import { useState } from 'react';
import { Body, Button, Card, Field, Heading, Notice, Page } from '../components/ui';
import { useAuth } from '../lib/auth';
import { requireSupabase, supabaseConfigured } from '../lib/supabase';

export default function Login() {
  const { error: sessionError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function authenticate() {
    setBusy(true); setError(''); setMessage('');
    try {
      const auth = requireSupabase().auth;
      const result = signup ? await auth.signUp({ email: email.trim(), password }) : await auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword('');
      if (signup && !result.data.session) { setSignup(false); setMessage('Check your email to confirm your account, then return here to sign in.'); }
      // Protected routes switch to the app when AuthProvider receives the session.
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in. Please try again.'); }
    finally { setBusy(false); }
  }
  return <Page title="Claro">
    <Heading>Every business decision, clear.</Heading>
    <Body>Your tasks, priorities, and decisions together. Sign in to pick up where you left off.</Body>
    {!supabaseConfigured ? <Notice error>Connect Claro to Supabase by setting the public URL and client key in .env, then restart Expo.</Notice> : <Card>
      <Heading>{signup ? 'Create your account' : 'Welcome back'}</Heading>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" editable={!busy} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={signup ? 'new-password' : 'current-password'} editable={!busy} />
      {signup && <Body>Use at least 8 characters.</Body>}
      {error || sessionError ? <Notice error>{error || sessionError}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      <Button label={signup ? 'Create account' : 'Sign in'} busy={busy} disabled={!email.trim() || !password || (signup && password.length < 8)} onPress={authenticate} />
      <Button secondary label={signup ? 'I already have an account' : 'Create an account'} disabled={busy} onPress={() => { setSignup(!signup); setError(''); setMessage(''); }} />
    </Card>}
  </Page>;
}
