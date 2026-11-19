import type { SupabaseClient } from '@supabase/supabase-js';
import type { Factor, Task } from '../model.ts';
import type { Database, Json, TaskPriorityRow, UniversalPriorityRow } from './database.types.ts';
import { mergePriorities, scoreOptions, validatePriorityTotal } from './logic.ts';

export const toFactor = (row: UniversalPriorityRow): Factor => ({
  id: row.factor, name: row.name, description: row.description, color: row.color, weight: row.weight,
});
const toPriority = (factor: Factor) => ({ factor: factor.id, weight: factor.weight });
const payload = (factor: Factor) => ({ ...toPriority(factor), name: factor.name.trim(), description: factor.description.trim(), color: factor.color });

export function effectiveFactors(universal: UniversalPriorityRow[], task: TaskPriorityRow[]): Factor[] {
  const overrides = task.filter(row => !row.inherited);
  const metadata = new Map([...universal, ...overrides].map(row => [row.factor, row]));
  return mergePriorities(universal, overrides).map(row => ({ ...toFactor(metadata.get(row.factor)!), weight: row.weight }));
}

/** Dependency injection allows contract tests without loading React Native or credentials. */
export function createPriorityService(client: SupabaseClient<Database>) {
  async function account() {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('Sign in to use your account priorities.');
    return data.user.id;
  }
  async function readUniversal(userId: string) {
    const { data, error } = await client.from('universal_priorities').select('*').eq('user_id', userId).order('sort_order');
    if (error) throw error;
    if (!data.length) throw new Error('Account priorities are missing. Apply the Setting Priorities migration.');
    validatePriorityTotal(data);
    return data;
  }
  async function taskSnapshot(taskId: string) {
    const userId = await account();
    const { data: task, error: taskError } = await client.from('tasks').select('*').eq('id', taskId).eq('user_id', userId).maybeSingle();
    if (taskError) throw taskError;
    if (!task) throw new Error('This task is not available in your account yet. Try again after it has synced.');
    const [universal, response] = await Promise.all([
      readUniversal(userId),
      client.from('task_priorities').select('*').eq('task_id', taskId).eq('user_id', userId).order('sort_order'),
    ]);
    if (response.error) throw response.error;
    const overrides = response.data.filter(row => !row.inherited);
    return { task, universal, overrides, startingCopy: response.data.filter(row => row.inherited).map(toFactor),
      effective: effectiveFactors(universal, response.data), mode: overrides.length ? 'custom' as const : 'universal' as const };
  }
  async function createTaskWithPriorities(task: Task, factors?: Factor[], expectedUserId?: string) {
    const userId = await account();
    if (expectedUserId && expectedUserId !== userId) throw new Error('Your account changed. Reopen the screen before saving.');
    if (factors) validatePriorityTotal(factors.map(toPriority));
    const { data, error } = await client.rpc('create_task_with_priorities', {
      p_task: { id: task.id, title: task.title, notes: task.notes, due_date: task.dueDate || null },
      p_expected_user_id: userId, ...(factors ? { p_factors: factors.map(payload) } : {}),
    });
    if (error) throw error;
    return data;
  }
  async function getUniversalPriorities() { return (await readUniversal(await account())).map(toFactor); }
  async function saveUniversalPriorities(factors: Factor[]) {
    const userId = await account();
    validatePriorityTotal(factors.map(toPriority));
    const { error } = await client.rpc('save_priorities', { p_factors: factors.map(payload), p_expected_user_id: userId });
    if (error) throw error;
  }
  async function saveTaskPriorities(taskId: string, factors: Factor[]) {
    validatePriorityTotal(factors.map(toPriority));
    const current = await taskSnapshot(taskId);
    // Keep old exclusions, and explicitly suppress universal factors removed in the editor.
    const omitted = new Map([...current.universal, ...current.overrides].filter(row =>
      !factors.some(factor => factor.id === row.factor)).map(row => [row.factor, row]));
    const rows: Json[] = [
      ...factors.map(factor => ({ ...payload(factor), excluded: false })),
      ...[...omitted.values()].map(row => ({ ...payload(toFactor(row)), weight: 0, excluded: true })),
    ];
    const { error } = await client.rpc('save_priorities', { p_task_id: taskId, p_factors: rows, p_expected_user_id: current.task.user_id });
    if (error) throw error;
  }
  async function revertTaskToUniversal(taskId: string) {
    const userId = await account();
    const { error } = await client.rpc('save_priorities', { p_task_id: taskId, p_factors: [], p_expected_user_id: userId });
    if (error) throw error;
  }
  async function getEffectivePriorities(taskId: string) { return (await taskSnapshot(taskId)).effective; }
  async function getSavedTaskPriorities() {
    const userId = await account();
    async function pages<T>(read: (start: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
      const all: T[] = [];
      for (let start = 0; ; start += 500) {
        const { data, error } = await read(start);
        if (error) throw error;
        if (!data) throw new Error('Saved task priorities could not be loaded.');
        all.push(...data);
        if (data.length < 500) return all;
      }
    }
    // Read each collection once, including completed tasks, without a request per chart.
    const [tasks, rows, universal] = await Promise.all([
      pages(start => client.from('tasks').select('*').eq('user_id', userId).order('id').range(start, start + 499)),
      pages(start => client.from('task_priorities').select('*').eq('user_id', userId).order('task_id').order('factor').range(start, start + 499)),
      readUniversal(userId),
    ]);
    const grouped = new Map<string, TaskPriorityRow[]>();
    for (const row of rows) {
      const group = grouped.get(row.task_id) || [];
      group.push(row); grouped.set(row.task_id, group);
    }
    return tasks.map(task => {
      const priorities = (grouped.get(task.id) || []).sort((a, b) => a.sort_order - b.sort_order || a.factor.localeCompare(b.factor));
      return { task, effective: effectiveFactors(universal, priorities),
        mode: priorities.some(row => !row.inherited) ? 'custom' as const : 'universal' as const };
    }).sort((a, b) => a.task.title.localeCompare(b.task.title) || a.task.id.localeCompare(b.task.id));
  }
  async function rankOptions(taskId: string) {
    const snapshot = await taskSnapshot(taskId);
    // Page through candidates before ranking; Supabase's default row cap must not hide a winner.
    const options = [];
    const pageSize = 500;
    for (let start = 0; ; start += pageSize) {
      const { data, error } = await client.from('options').select('*').eq('task_id', taskId).order('id').range(start, start + pageSize - 1);
      if (error) throw error;
      options.push(...data.map(row => ({ ...row, ratings: row.ratings && typeof row.ratings === 'object' && !Array.isArray(row.ratings) ? row.ratings : {} })));
      if (data.length < pageSize) break;
    }
    return scoreOptions(options, snapshot.effective.map(toPriority), Object.fromEntries(snapshot.effective.map(f => [f.id, f.name])));
  }
  return { getUniversalPriorities, saveUniversalPriorities, taskSnapshot, saveTaskPriorities, revertTaskToUniversal, getEffectivePriorities, rankOptions, createTaskWithPriorities, getSavedTaskPriorities };
}
