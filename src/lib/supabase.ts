import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import type { Database } from './priorities/database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(url && anonKey);
// Missing configuration is a visible setup state, not an anonymous/local fallback.
export const supabase = url && anonKey ? createClient<Database>(url, anonKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web', lock: processLock,
  },
}) : null;

export function requireSupabase() {
  if (!supabase) throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to connect Claro.');
  return supabase;
}
