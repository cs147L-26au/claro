import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from './auth';
import { requireSupabase } from './supabase';
import { createFollowUpService, type FollowUpInput } from './followups-service';
import type { PostDecisionTaskRow } from './priorities/database.types';

const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());
export async function createPostDecisionTasks(decisionId: string, steps: FollowUpInput[], expectedUserId?: string) {
  const rows = await createFollowUpService(requireSupabase()).create(decisionId, steps, expectedUserId);
  changed(); return rows;
}
export function usePostDecisionTasks(start?: string, end?: string) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const scope = `${userId}:${start}:${end}`;
  const latest = useRef(scope); latest.current = scope;
  const request = useRef(0);
  const [state, setState] = useState<{ scope: string; data: PostDecisionTaskRow[]; loading: boolean; error: string }>({ scope, data: [], loading: true, error: '' });
  const refresh = useCallback(async () => {
    const ticket = ++request.current;
    if (!userId) return;
    setState(old => ({ scope, data: old.scope === scope ? old.data : [], loading: true, error: '' }));
    try {
      const data = await createFollowUpService(requireSupabase()).list(start, end);
      if (latest.current === scope && ticket === request.current) setState({ scope, data, loading: false, error: '' });
    } catch (error) {
      if (latest.current === scope && ticket === request.current) setState(old => ({ ...old, loading: false, error: (error as { message?: string })?.message || 'Could not load follow-ups.' }));
    }
  }, [scope, userId, start, end]);
  useFocusEffect(useCallback(() => { void refresh(); return () => { request.current++; }; }, [refresh]));
  useEffect(() => { const listener = () => { void refresh(); }; listeners.add(listener); return () => { listeners.delete(listener); }; }, [refresh]);
  return { ...(state.scope === scope ? state : { data: [], loading: Boolean(userId), error: '' }), refresh,
    create: (decisionId: string, steps: FollowUpInput[]) => createPostDecisionTasks(decisionId, steps, userId),
    setDone: async (id: string, done: boolean) => {
      await createFollowUpService(requireSupabase()).setDone(id, done, userId); changed();
    },
  };
}
