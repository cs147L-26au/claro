import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type AuthState = { session: Session | null; loading: boolean; error: string };
const Context = createContext<AuthState>({ session: null, loading: true, error: '' });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: Boolean(supabase), error: '' });
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let eventReceived = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      eventReceived = true;
      if (active) setState({ session, loading: false, error: '' });
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && !eventReceived) setState({ session: data.session, loading: false, error: error?.message || '' });
    }).catch(error => {
      if (active && !eventReceived) setState({ session: null, loading: false, error: error instanceof Error ? error.message : 'Could not restore your session.' });
    });
    const refresh = (status: string | null | undefined) => {
      if (Platform.OS === 'web') return;
      if (status === 'active') supabase!.auth.startAutoRefresh(); else supabase!.auth.stopAutoRefresh();
    };
    refresh(AppState.currentState);
    const listener = AppState.addEventListener('change', refresh);
    return () => { active = false; subscription.unsubscribe(); listener.remove(); if (Platform.OS !== 'web') supabase!.auth.stopAutoRefresh(); };
  }, []);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useAuth() { return useContext(Context); }
