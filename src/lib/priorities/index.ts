import { requireSupabase } from '../supabase';
import { createPriorityService } from './service';
import type { Factor, Task } from '../model';

export { mergePriorities, scoreOptions, normalizePriorities, validatePriorityTotal } from './logic';
export type { Priority, RankedOption, CandidateOption } from './logic';
const listeners = new Set<() => void>();
export const subscribePriorities = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** Call after a teammate changes option ratings to refresh mounted ranking hooks. */
export const invalidatePriorities = () => { for (const listener of listeners) listener(); };
const service = () => createPriorityService(requireSupabase());
export const getUniversalPriorities = () => service().getUniversalPriorities();
export const getTaskPriorities = (taskId: string) => service().taskSnapshot(taskId);
export const getSavedTaskPriorities = () => service().getSavedTaskPriorities();
export const getEffectivePriorities = (taskId: string) => service().getEffectivePriorities(taskId);
/** Returns top 3, without writing to teammate-owned options. */
export const rankOptions = (taskId: string) => service().rankOptions(taskId);
/** Await this before generating options. Undefined factors means follow universal priorities. */
export async function createTaskWithPriorities(task: Task, factors?: Factor[], expectedUserId?: string) {
  const id = await service().createTaskWithPriorities(task, factors, expectedUserId);
  invalidatePriorities();
  return id;
}
export async function saveUniversalPriorities(factors: Factor[]) {
  await service().saveUniversalPriorities(factors); invalidatePriorities();
}
export async function saveTaskPriorities(taskId: string, factors: Factor[]) {
  await service().saveTaskPriorities(taskId, factors); invalidatePriorities();
}
export async function revertTaskToUniversal(taskId: string) {
  await service().revertTaskToUniversal(taskId); invalidatePriorities();
}
