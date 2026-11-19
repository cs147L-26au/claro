import type { SupabaseClient } from '@supabase/supabase-js';
import type { Factor } from './model.ts';
import { validDate, validateFactors } from './model.ts';
import { parseDecisionPlan, planInputKey } from './decision-plan.ts';
import type { DecisionPlan, ReadyDecisionPlan } from './decision-plan.ts';
import type { Database, Json } from './priorities/database.types.ts';

export type SavedPlanInput = { title: string; description: string; dueDate: string; context: string };
export type SavedDecisionPlan = {
  taskId: string; userId: string; inputKey: string; input: SavedPlanInput;
  priorities: Factor[]; plan: ReadyDecisionPlan; status: 'draft' | 'accepted';
  decisionId: string | null; startDate: string | null;
};
export type DecisionPlanDraft = { inputKey: string; input: SavedPlanInput; priorities: Factor[]; plan: DecisionPlan };
export type PlanAcceptance = { decisionId: string; startDate: string; alreadyAccepted: boolean };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Your saved recommendation could not be read.');
  return value as Record<string, unknown>;
}
function inputSnapshot(value: unknown): SavedPlanInput {
  const input = record(value);
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 ||
      typeof input.description !== 'string' || input.description.length > 2000 ||
      typeof input.dueDate !== 'string' || !validDate(input.dueDate) ||
      typeof input.context !== 'string' || input.context.length > 4000) {
    throw new Error('Check the decision details before continuing.');
  }
  return { title: input.title, description: input.description, dueDate: input.dueDate, context: input.context };
}
function savedPlan(value: unknown, userId: string): SavedDecisionPlan {
  const row = record(value);
  const input = inputSnapshot(row.input);
  const plan = parseDecisionPlan(row.plan);
  if (typeof row.task_id !== 'string' || !row.task_id || row.user_id !== userId ||
      typeof row.input_key !== 'string' || !row.input_key || !validateFactors(row.priorities) ||
      plan.status !== 'ready' || !['draft', 'accepted'].includes(row.status as string) ||
      (row.status === 'draft' && (row.decision_id !== null || row.start_date !== null)) ||
      (row.status === 'accepted' && (typeof row.decision_id !== 'string' || !row.decision_id ||
        typeof row.start_date !== 'string' || !row.start_date || !validDate(row.start_date)))) {
    throw new Error('Your saved recommendation could not be read.');
  }
  if (row.input_key !== planInputKey({ ...input, factors: row.priorities })) {
    throw new Error('Your saved recommendation does not match its decision details. Generate it again.');
  }
  return { taskId: row.task_id, userId, inputKey: row.input_key, input, priorities: row.priorities,
    plan, status: row.status as SavedDecisionPlan['status'],
    decisionId: row.decision_id as string | null, startDate: row.start_date as string | null };
}
function databaseError(error: { code?: string; message: string }): Error {
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code || '')) {
    return new Error('Decision plans are not configured yet. Apply the decision-plan migration to Supabase.');
  }
  return new Error(error.message);
}

/** Plans and calendar acceptance are account-scoped; acceptance is a single database transaction. */
export function createDecisionPlanService(client: SupabaseClient<Database>) {
  async function account(expectedUserId?: string): Promise<string> {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('Sign in to save your recommendation.');
    if (expectedUserId && expectedUserId !== data.user.id) throw new Error('Your account changed. Reopen the screen before saving.');
    return data.user.id;
  }
  async function get(taskId: string, expectedUserId?: string): Promise<SavedDecisionPlan | null> {
    const userId = await account(expectedUserId);
    const { data, error } = await client.from('task_decision_plans').select('*')
      .eq('task_id', taskId).eq('user_id', userId).maybeSingle();
    if (error) throw databaseError(error);
    return data ? savedPlan(data, userId) : null;
  }
  async function listAccepted(expectedUserId?: string): Promise<SavedDecisionPlan[]> {
    const userId = await account(expectedUserId);
    const plans: SavedDecisionPlan[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await client.from('task_decision_plans').select('*')
        .eq('user_id', userId).eq('status', 'accepted').order('task_id').range(start, start + 499);
      if (error) throw databaseError(error);
      if (!data) throw new Error('Your scheduled recommendations could not be loaded.');
      plans.push(...data.map(row => savedPlan(row, userId)));
      if (data.length < 500) return plans;
    }
  }
  async function saveDraft(taskId: string, draft: DecisionPlanDraft, expectedUserId?: string): Promise<SavedDecisionPlan> {
    const input = inputSnapshot(draft.input);
    const plan = parseDecisionPlan(draft.plan);
    if (plan.status !== 'ready') throw new Error('Complete the decision details before saving a recommendation.');
    if (!validateFactors(draft.priorities)) throw new Error('Choose 2–8 factors totaling 100%.');
    const priorities = draft.priorities.map(({ id, name, description, color, weight }) => ({ id, name, description, color, weight }));
    if (draft.inputKey !== planInputKey({ ...input, factors: priorities })) {
      throw new Error('The decision details changed. Generate a fresh recommendation.');
    }
    const userId = await account(expectedUserId);
    const { data, error } = await client.rpc('save_task_decision_plan', {
      p_task_id: taskId, p_input_key: draft.inputKey, p_input: input,
      p_priorities: priorities, p_plan: plan as unknown as Json, p_expected_user_id: userId,
    });
    if (error) throw databaseError(error);
    return savedPlan(data, userId);
  }
  async function accept(taskId: string, inputKey: string, startDate: string, expectedUserId?: string): Promise<PlanAcceptance> {
    if (!startDate || !validDate(startDate)) throw new Error('Choose a valid plan start date.');
    if (!inputKey) throw new Error('Generate a recommendation before continuing.');
    const userId = await account(expectedUserId);
    const { data, error } = await client.rpc('accept_task_decision_plan', {
      p_task_id: taskId, p_input_key: inputKey, p_start_date: startDate, p_expected_user_id: userId,
    });
    if (error) throw databaseError(error);
    const receipt = record(data);
    if (typeof receipt.decisionId !== 'string' || !receipt.decisionId ||
        typeof receipt.startDate !== 'string' || !receipt.startDate || !validDate(receipt.startDate) ||
        typeof receipt.alreadyAccepted !== 'boolean') throw new Error('Your calendar update could not be confirmed. Please try again.');
    return { decisionId: receipt.decisionId, startDate: receipt.startDate, alreadyAccepted: receipt.alreadyAccepted };
  }
  return { get, listAccepted, saveDraft, accept };
}
