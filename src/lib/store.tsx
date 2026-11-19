import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { usePathname } from 'expo-router';
import type { AppData } from './model';
import { useAuth } from './auth';
import { requireSupabase } from './supabase';
import { accountDataError, createAccountDataService } from './account-data';
import { createAccountController } from './account-controller';
import { subscribePriorities } from './priorities';
import { Body, Button, Heading, Notice, Page, theme } from '../components/ui';

type Store = {
  data: AppData;
  save: (update: (data: AppData) => AppData) => Promise<void>;
  refresh: () => Promise<void>;
  importRecords: (data: AppData) => Promise<void>;
  refreshing: boolean;
  error: string;
};
const Context = createContext<Store | null>(null);
function AccountStore({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const controller = useRef<ReturnType<typeof createAccountController> | null>(null);
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const refresh = useCallback(async () => {
    if (!controller.current) return;
    setRefreshing(true);
    try { await controller.current.refresh(); setError(''); }
    catch (e) { setError(accountDataError(e)); }
    finally { setRefreshing(false); }
  }, []);
  useEffect(() => {
    const next = createAccountController(createAccountDataService(requireSupabase(), userId), nextData => { setData(nextData); setError(''); }, e => setError(accountDataError(e)));
    controller.current = next;
    void refresh();
    const unsubscribe = subscribePriorities(() => { void refresh(); });
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const focus = () => { void refresh(); };
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('focus', focus);
    return () => {
      next.dispose(); controller.current = null; unsubscribe(); listener.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('focus', focus);
    };
  }, [userId, refresh]);
  useEffect(() => {
    if (previousPath.current !== pathname) { previousPath.current = pathname; void refresh(); }
  }, [pathname, refresh]);
  if (!data) return <Page title="Claro">
    {refreshing || !error ? <><ActivityIndicator accessibilityLabel="Loading your account" color={theme.teal} /><Body>Getting your tasks, decisions, and priorities…</Body></> : <>
      <Heading>Let’s reconnect your account.</Heading><Notice error>{error}</Notice>
      <Button label="Try again" onPress={refresh} />
      <Button secondary label="Sign out" onPress={async () => { const result = await requireSupabase().auth.signOut(); if (result.error) setError(result.error.message); }} />
    </>}
  </Page>;
  return <Context.Provider value={{ data, refreshing, error, refresh,
    save: update => controller.current ? controller.current.save(update) : Promise.reject(new Error('Your account is no longer active.')),
    importRecords: records => controller.current ? controller.current.importRecords(records) : Promise.reject(new Error('Your account is no longer active.')),
  }}><View style={{ flex: 1, backgroundColor: theme.bg }}>
    {error ? <Notice error>Could not refresh your account. Your last loaded data is shown. Open Account to retry.</Notice> : null}
    {children}
  </View></Context.Provider>;
}
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  return session ? <AccountStore key={session.user.id} userId={session.user.id}>{children}</AccountStore> : <>{children}</>;
}
export function useStore() {
  const store = useContext(Context);
  if (!store) throw new Error('Sign in before accessing account data.');
  return store;
}
