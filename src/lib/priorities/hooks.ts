import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../auth';
import { getUniversalPriorities, getTaskPriorities, rankOptions, revertTaskToUniversal,
  saveTaskPriorities, saveUniversalPriorities, subscribePriorities, getSavedTaskPriorities } from './index';

/** Clear account-scoped data immediately on identity change; ignore late requests. */
function useResource<T>(key: string, loader: () => Promise<T>) {
  const { session } = useAuth();
  const scope = `${session?.user.id || ''}:${key}`;
  const latest = useRef(scope); latest.current = scope;
  const request = useRef(0);
  const [state, setState] = useState<{ scope: string; data: T | null; loading: boolean; error: string }>({ scope, data: null, loading: Boolean(session), error: '' });
  const refresh = useCallback(async () => {
    const ticket = ++request.current;
    if (!session) { setState({ scope, data: null, loading: false, error: '' }); return; }
    setState(old => ({ scope, data: old.scope === scope ? old.data : null, loading: true, error: '' }));
    try {
      const data = await loader();
      if (ticket === request.current && latest.current === scope) setState({ scope, data, loading: false, error: '' });
    } catch (error) {
      if (ticket === request.current && latest.current === scope) setState(old => ({ scope, data: old.scope === scope ? old.data : null, loading: false, error: error instanceof Error ? error.message : String((error as { message?: string })?.message || 'Could not load priorities. Try again.') }));
    }
  }, [scope, Boolean(session), loader]);
  useFocusEffect(useCallback(() => { void refresh(); return () => { request.current++; }; }, [refresh]));
  useEffect(() => subscribePriorities(() => { void refresh(); }), [refresh]);
  useEffect(() => () => { request.current++; }, []);
  return { ...(state.scope === scope ? state : { data: null, loading: Boolean(session), error: '' }), refresh };
}

export function useUniversalPriorities() {
  const resource = useResource('universal', getUniversalPriorities);
  return { ...resource, priorities: resource.data, save: saveUniversalPriorities };
}
export function useSavedTaskPriorities() {
  return useResource('saved-tasks', getSavedTaskPriorities);
}
export function useTaskPriorities(taskId: string) {
  const load = useCallback(() => getTaskPriorities(taskId), [taskId]);
  const resource = useResource(`task:${taskId}`, load);
  return { ...resource, priorities: resource.data?.effective || null, mode: resource.data?.mode,
    save: (factors: Parameters<typeof saveTaskPriorities>[1]) => saveTaskPriorities(taskId, factors),
    revertToUniversal: () => revertTaskToUniversal(taskId) };
}
export function useRankedOptions(taskId: string) {
  const load = useCallback(() => rankOptions(taskId), [taskId]);
  return useResource(`ranking:${taskId}`, load);
}
