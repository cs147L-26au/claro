import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AppData, initialData, parseStoredData } from './model';
import { CommitQueue, createCommitQueue } from './persistence';

const KEY = '@claro/data/v1';
type Store = { data: AppData; save: (update: (data: AppData) => AppData) => Promise<void> };
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(initialData);
  const queue = useRef<CommitQueue<AppData> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => {
      const next = raw ? parseStoredData(raw) : initialData;
      queue.current = createCommitQueue(next, value => AsyncStorage.setItem(KEY, JSON.stringify(value)), setData);
      setData(next); setLoaded(true);
    }).catch(() => setError('Your saved data could not be opened. Restart Claro to retry. Your existing data has not been changed.'));
  }, []);
  const save: Store['save'] = update => {
    if (!queue.current) return Promise.reject(new Error('Your saved data is still loading.'));
    return queue.current.commit(update);
  };
  if (!loaded) return <View style={{ flex: 1, backgroundColor: '#FBF7ED', justifyContent: 'center', padding: 32 }}>
    {error ? <Text accessibilityRole="alert" style={{ color: '#9B4039', fontSize: 17 }}>{error}</Text> : <ActivityIndicator color="#105B56" size="large" />}
  </View>;
  return <Context.Provider value={{ data, save }}>{children}</Context.Provider>;
}
export function useStore() { const store = useContext(Context); if (!store) throw new Error('Missing StoreProvider'); return store; }
