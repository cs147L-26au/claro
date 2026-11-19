import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Body, Button, Card, Heading, Notice, Page } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { requireSupabase } from '../lib/supabase';
import { parseStoredData, type AppData } from '../lib/model';
import { accountDataError } from '../lib/account-data';

const LEGACY_KEY = '@claro/data/v1';
const IMPORT_OWNER_KEY = '@claro/legacy-import-owner/v1';
export default function Account() {
  const { session } = useAuth();
  const store = useStore();
  const [legacy, setLegacy] = useState<AppData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem(LEGACY_KEY), AsyncStorage.getItem(IMPORT_OWNER_KEY)]).then(([raw, owner]) => {
      if (!active || !raw || owner) return;
      const parsed = parseStoredData(raw);
      if (parsed.tasks.length || parsed.decisions.length) setLegacy(parsed);
    }).catch(() => { if (active) setError('Older device data could not be read. The original data has been kept.'); });
    return () => { active = false; };
  }, []);
  async function importLegacy() {
    if (!legacy || !session) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await store.importRecords(legacy);
      await AsyncStorage.setItem(IMPORT_OWNER_KEY, session.user.id);
      setLegacy(null); setMessage('Your older tasks and decisions are now in this account. Existing cloud records and universal priorities were kept.');
    } catch (e) { setError(accountDataError(e)); }
    finally { setBusy(false); }
  }
  return <Page title="Account" back>
    <Heading>Your business, together.</Heading>
    <Card><Body>{session?.user.email || 'Signed in'}</Body><Body>Your tasks, decisions, and priorities are saved securely to this Supabase account.</Body>
      <Body>{store.data.tasks.length} tasks · {store.data.decisions.length} decisions</Body>
      <Button secondary label="Refresh account data" busy={store.refreshing} disabled={busy} onPress={store.refresh} />
    </Card>
    {legacy && <Card><Heading>Bring your earlier work with you</Heading>
      <Body>This device has {legacy.tasks.length} older tasks and {legacy.decisions.length} older decisions. Import them only if they belong to this account.</Body>
      <Body>Existing cloud records will be kept. The original device copy will remain as a backup.</Body>
      <Button label="Import into this account" busy={busy} onPress={importLegacy} />
    </Card>}
    {error || store.error ? <Notice error>{error || store.error}</Notice> : null}
    {message ? <Notice>{message}</Notice> : null}
    <Button secondary label="Sign out" disabled={busy} onPress={async () => {
      setError('');
      try { const result = await requireSupabase().auth.signOut(); if (result.error) throw result.error; }
      catch (e) { setError(accountDataError(e)); }
    }} />
  </Page>;
}
