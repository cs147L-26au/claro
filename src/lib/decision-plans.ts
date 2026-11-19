import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from './auth';
import { requireSupabase } from './supabase';
import { createDecisionPlanService } from './decision-plan-service';
import type { SavedDecisionPlan } from './decision-plan-service';
import { invalidatePriorities } from './priorities';
import { invalidateFollowUps } from './followups';

export type { SavedDecisionPlan } from './decision-plan-service';
const listeners = new Set<() => void>();
export function invalidateDecisionPlans() { listeners.forEach(listener => listener()); }
const service = () => createDecisionPlanService(requireSupabase());
export const getDecisionPlan = (taskId: string, userId?: string) => service().get(taskId, userId);
export async function saveDecisionPlan(taskId: string, draft: Parameters<ReturnType<typeof createDecisionPlanService>['saveDraft']>[1], userId?: string) {
  const result = await service().saveDraft(taskId, draft, userId);
  invalidateDecisionPlans(); return result;
}
export async function acceptDecisionPlan(taskId: string, inputKey: string, startDate: string, userId?: string) {
  const result = await service().accept(taskId, inputKey, startDate, userId);
  invalidateDecisionPlans(); invalidateFollowUps(); invalidatePriorities();
  return result;
}

export function useAcceptedTaskPlans() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const request = useRef(0);
  const [state, setState] = useState<{ userId?: string; data: SavedDecisionPlan[]; loading: boolean; error: string }>({ userId, data: [], loading: Boolean(userId), error: '' });
  const refresh = useCallback(async () => {
    const ticket = ++request.current;
    if (!userId) { setState({ userId, data: [], loading: false, error: '' }); return; }
    setState(old => ({ userId, data: old.userId === userId ? old.data : [], loading: true, error: '' }));
    try {
      const data = await service().listAccepted(userId);
      if (ticket === request.current) setState({ userId, data, loading: false, error: '' });
    } catch (e) {
      if (ticket === request.current) setState(old => ({ userId, data: old.userId === userId ? old.data : [], loading: false, error: (e as { message?: string })?.message || 'Could not load your plans.' }));
    }
  }, [userId]);
  useFocusEffect(useCallback(() => { void refresh(); return () => { request.current++; }; }, [refresh]));
  useEffect(() => { listeners.add(refresh); return () => { listeners.delete(refresh); request.current++; }; }, [refresh]);
  return { ...(state.userId === userId ? state : { data: [], loading: Boolean(userId), error: '' }), refresh };
}
