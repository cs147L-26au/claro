import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, PostDecisionTaskRow } from './priorities/database.types.ts';
import { validDate } from './model.ts';

export type FollowUpInput = { id?: string; title: string; notes?: string; dueDate: string };
export function createFollowUpService(client: SupabaseClient<Database>) {
  async function account(expectedUserId?: string) {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('Sign in to see your follow-ups.');
    if (expectedUserId && expectedUserId !== data.user.id) throw new Error('Your account changed. Reopen this screen.');
    return data.user.id;
  }
  async function list(start?: string, end?: string) {
    const userId = await account();
    const all: PostDecisionTaskRow[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = client.from('post_decision_tasks').select('*').eq('user_id', userId).order('due_date').order('id');
      if (start) query = query.gte('due_date', start);
      if (end) query = query.lte('due_date', end);
      const { data, error } = await query.range(offset, offset + 499);
      if (error) throw error;
      all.push(...data);
      if (data.length < 500) return all;
    }
  }
  async function create(decisionId: string, steps: FollowUpInput[], expectedUserId?: string) {
    const userId = await account(expectedUserId);
    if (!decisionId || !steps.length) throw new Error('Choose a saved decision and add a follow-up.');
    const rows = steps.map(step => {
      if (!step.title.trim() || step.title.trim().length > 120 || (step.notes?.length || 0) > 2000 || !step.dueDate || !validDate(step.dueDate)) {
        throw new Error('Each follow-up needs a title and a valid date (YYYY-MM-DD).');
      }
      return { ...(step.id ? { id: step.id } : {}), user_id: userId, decision_id: decisionId,
        title: step.title.trim(), notes: step.notes?.trim() || '', due_date: step.dueDate };
    });
    // One insert is atomic; the composite foreign key prevents cross-account links.
    const { data, error } = await client.from('post_decision_tasks').insert(rows).select();
    if (error) throw error;
    return data;
  }
  async function setDone(id: string, done: boolean, expectedUserId?: string) {
    const userId = await account(expectedUserId);
    const { data, error } = await client.from('post_decision_tasks').update({ done }).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw error;
    return data;
  }
  return { list, create, setDone };
}
