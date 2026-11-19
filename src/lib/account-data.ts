import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppData, Decision, Factor, Task } from './model.ts';
import type { Database, DecisionRow, Json, TaskRow } from './priorities/database.types.ts';
import { validatePriorityTotal } from './priorities/logic.ts';

export const taskFromRow = (row: TaskRow): Task => ({ id: row.id, title: row.title, notes: row.notes, dueDate: row.due_date || '', done: row.done });
export const taskToRow = (task: Task) => ({ id: task.id, title: task.title, notes: task.notes, due_date: task.dueDate || null, done: task.done });
export function decisionFromRow(row: DecisionRow): Decision {
  const priorities = row.priorities as Factor[];
  validatePriorityTotal(priorities.map(f => ({ factor: f.id, weight: f.weight })));
  return { id: row.id, title: row.title, category: row.category, choice: row.choice, notes: row.notes,
    alternatives: row.alternatives, reviewDate: row.review_date || '', status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at, priorities };
}
export const decisionToRow = (decision: Decision) => ({
  id: decision.id, title: decision.title, category: decision.category, choice: decision.choice,
  notes: decision.notes, alternatives: decision.alternatives, review_date: decision.reviewDate || null,
  status: decision.status, created_at: decision.createdAt, updated_at: decision.updatedAt,
  priorities: decision.priorities as Json,
});
export function changedRecords<T extends { id: string }>(before: T[], after: T[]) {
  const previous = new Map(before.map(row => [row.id, JSON.stringify(row)]));
  return after.filter(row => previous.get(row.id) !== JSON.stringify(row));
}
export function accountDataError(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (['PGRST205', 'PGRST202', '42703', '42P01'].includes(e?.code || '')) {
    return `Supabase could not load Claro’s database schema (${e.code}). ${e.message || 'A required table, column, or function is unavailable.'} If setup already succeeded, check that the app and SQL Editor use the same project and refresh the API schema cache.`;
  }
  return e?.message || 'Could not connect to your account. Check your connection and try again.';
}

/** Every operation is pinned to the account that mounted the store. */
export function createAccountDataService(client: SupabaseClient<Database>, userId: string) {
  async function assertAccount() {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (data.user?.id !== userId) throw new Error('Your account changed. Reopen this screen before saving.');
  }
  async function readPages<T>(page: (start: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
    const rows: T[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await page(start);
      if (error) throw error;
      if (!data) throw new Error('Your account data could not be read.');
      rows.push(...data);
      if (data.length < 500) break;
    }
    return rows;
  }
  async function load(): Promise<AppData> {
    await assertAccount();
    const [tasks, decisions, priorities] = await Promise.all([
      readPages(start => client.from('tasks').select('*').eq('user_id', userId).order('id').range(start, start + 499)),
      readPages(start => client.from('decisions').select('*').eq('user_id', userId).order('id').range(start, start + 499)),
      client.from('universal_priorities').select('*').eq('user_id', userId).order('sort_order'),
    ]);
    if (priorities.error) throw priorities.error;
    if (!priorities.data.length) throw new Error('Your account priorities are missing. Apply the Supabase migrations before continuing.');
    validatePriorityTotal(priorities.data);
    return { version: 1, tasks: tasks.map(taskFromRow), decisions: decisions.map(decisionFromRow).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      factors: priorities.data.map(row => ({ id: row.factor, name: row.name, description: row.description, weight: row.weight, color: row.color })) };
  }
  async function write(tasks: Task[], decisions: Decision[], importOnly = false) {
    await assertAccount();
    const { error } = await client.rpc('save_app_records', {
      p_tasks: tasks.map(taskToRow), p_decisions: decisions.map(decisionToRow), p_import_only: importOnly, p_expected_user_id: userId,
    });
    if (error) throw error;
  }
  async function saveChanges(before: AppData, after: AppData) {
    if (before.tasks.some(row => !after.tasks.some(next => next.id === row.id)) || before.decisions.some(row => !after.decisions.some(next => next.id === row.id))) {
      throw new Error('Use completion or archive to keep your account history.');
    }
    if (JSON.stringify(before.factors) !== JSON.stringify(after.factors)) throw new Error('Use the Priorities editor to update your account weights.');
    const tasks = changedRecords(before.tasks, after.tasks);
    const decisions = changedRecords(before.decisions, after.decisions);
    if (tasks.length || decisions.length) await write(tasks, decisions);
  }
  return { load, saveChanges, importRecords: (data: AppData) => write(data.tasks, data.decisions, true) };
}
