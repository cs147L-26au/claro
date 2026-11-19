import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, usePreventRemove } from 'expo-router';
import { Body, Button, Field, Heading, Notice, Page, s, theme } from './ui';
import { TaskPriorityCard } from './TaskPriorityCard';
import { suggestDecisionPriorities } from '../lib/ai';
import { validateDecisionBrief } from '../lib/decision-ai';
import type { DecisionBrief, DecisionSuggestion } from '../lib/decision-ai';
import { uid, validateFactors } from '../lib/model';
import type { Factor } from '../lib/model';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';
import { createTaskWithPriorities, getEffectivePriorities, saveTaskPriorities } from '../lib/priorities';

export function NewTaskForm() {
  const { session } = useAuth();
  const { data, refresh, save } = useStore();
  const [newId] = useState(uid);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [suggestion, setSuggestion] = useState<DecisionSuggestion | null>(null);
  const [analyzedBrief, setAnalyzedBrief] = useState<DecisionBrief | null>(null);
  const [draft, setDraft] = useState<Factor[]>([]);
  const [stage, setStage] = useState<'details' | 'review'>('details');
  const [editingDetails, setEditingDetails] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const created = useRef(false);
  const syncRequest = useRef(0);
  const active = useRef(true);
  const allowNavigation = usePreventRemove((stage === 'review' || editingDetails) && !leaving, () => {
    if (savingRef.current) return;
    if (stage === 'details') returnToPriorities();
    else backToInitialDetails();
  });
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; request.current?.abort(); };
  }, []);
  const reloadSavedPriorities = useCallback(async () => {
    const ticket = ++syncRequest.current;
    setSyncing(true); setSyncFailed(false);
    try {
      const factors = await getEffectivePriorities(newId);
      if (ticket === syncRequest.current) { setDraft(factors); setError(''); }
    } catch (e) {
      if (ticket === syncRequest.current) {
        setSyncFailed(true);
        setError((e as { message?: string })?.message || 'Could not load your latest priorities.');
      }
    } finally { if (ticket === syncRequest.current) setSyncing(false); }
  }, [newId]);
  useFocusEffect(useCallback(() => {
    setLeaving(false);
    // Keep the saved task balance current when returning to this screen.
    if (created.current) void reloadSavedPriorities();
    return () => { syncRequest.current++; };
  }, [reloadSavedPriorities]));

  async function analyze() {
    if (request.current || savingRef.current || syncing) return;
    setError('');
    let brief;
    try { brief = validateDecisionBrief({ title, description, dueDate }); }
    catch (e) { setError((e as Error).message); return; }
    Keyboard.dismiss();
    const controller = new AbortController();
    request.current = controller;
    setAnalyzing(true);
    try {
      const result = await suggestDecisionPriorities(brief, controller.signal);
      if (!active.current || request.current !== controller) return;
      setSuggestion(result);
      setSyncFailed(false);
      setAnalyzedBrief(brief);
      setTitle(brief.title); setDescription(brief.description); setDueDate(brief.dueDate);
      setDraft(result.factors.map(({ reason, ...factor }) => factor));
      setEditingDetails(false);
      setStage('review');
    } catch (e) {
      if (active.current && request.current === controller) setError(e instanceof Error ? e.message : 'Could not analyze this decision. Please try again.');
    } finally {
      if (active.current && request.current === controller) { request.current = null; setAnalyzing(false); }
    }
  }

  function cancelAnalysis() {
    request.current?.abort(); request.current = null; setAnalyzing(false); setError('');
  }
  function editDetails() {
    if (savingRef.current || syncing) return;
    setEditingDetails(true);
    setStage('details'); setError('');
  }
  function returnToPriorities() {
    if (!analyzedBrief || savingRef.current) return;
    cancelAnalysis();
    setTitle(analyzedBrief.title); setDescription(analyzedBrief.description); setDueDate(analyzedBrief.dueDate);
    setEditingDetails(false); setStage('review');
  }
  function backToInitialDetails() {
    if (savingRef.current || syncing) return;
    setEditingDetails(false); setStage('details'); setError('');
  }
  async function confirm() {
    if (savingRef.current || syncing || syncFailed || !suggestion || !analyzedBrief || !validateFactors(draft)) return;
    if (!session) { setError('Sign in again before saving your decision.'); return; }
    savingRef.current = true; setSaving(true); setError('');
    try {
      const record = { id: newId, title: analyzedBrief.title, notes: analyzedBrief.description, dueDate: analyzedBrief.dueDate, done: false };
      if (created.current) {
        await save(data => {
          if (!data.tasks.some(task => task.id === newId)) throw new Error('This task is no longer available. Return to Tasks and reopen it.');
          return { ...data, tasks: data.tasks.map(task => task.id === newId ? { ...task, title: record.title, notes: record.notes, dueDate: record.dueDate } : task) };
        });
        await saveTaskPriorities(newId, draft);
      } else {
        await createTaskWithPriorities(record, draft, session.user.id);
        created.current = true;
      }
      await refresh();
      if (active.current) {
        setLeaving(true); allowNavigation();
        router.push({ pathname: '/task/[id]/decision', params: { id: newId, generate: '1' } });
      }
    } catch (e) {
      if (active.current) setError((e as { message?: string })?.message || 'Could not save this decision. Your priorities are still here; please try again.');
    } finally {
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  }

  if (stage === 'review' && suggestion) return <Page key="review" title="Set priorities" back onBack={backToInitialDetails}>
    <Body>Our suggested balance. Adjust what matters most.</Body>
    <TaskPriorityCard factors={draft} title={title.trim()} disabled={saving || syncing} universalFactors={data.factors}
      suggestions={suggestion.factors} onChange={setDraft} />
    {error ? <Notice error>{error}</Notice> : null}
    {syncFailed && <Button secondary label="Try again" disabled={syncing} onPress={reloadSavedPriorities} />}
    <Button label={saving ? 'Continuing…' : 'Continue to decision'} icon="arrow" busy={saving} disabled={syncing || syncFailed} onPress={confirm} />
    <View style={[s.row, { justifyContent: 'center', gap: 24 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Reset to recommended" disabled={saving || syncing}
        onPress={() => setDraft(suggestion.factors.map(({ reason, ...factor }) => factor))}
        style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: saving || syncing ? 0.4 : pressed ? 0.6 : 1 })}>
        <Text style={[s.small, { color: theme.teal }]}>Reset to recommended</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={saving || syncing} onPress={editDetails}
        style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: saving || syncing ? 0.4 : pressed ? 0.6 : 1 })}>
        <Text style={[s.small, { color: theme.teal }]}>Edit details</Text>
      </Pressable>
    </View>
  </Page>;

  return <Page key="details" title={editingDetails ? 'Edit details' : 'Add a task'} back onBack={editingDetails ? returnToPriorities : undefined}>
    <Heading>What are you deciding?</Heading>
    <Body>Tell us your goals, options, and constraints.</Body>
    <Field label="Decision name *" placeholder="e.g. Choose a coffee supplier" value={title} onChangeText={value => { setTitle(value); setError(''); }} maxLength={120} editable={!analyzing} />
    <Field label="Description *" placeholder="What are your goals, choices, and constraints? e.g. I need reliable weekly deliveries for my café, within a $600 budget, without lowering coffee quality." multiline value={description} onChangeText={value => { setDescription(value); setError(''); }} maxLength={2000} editable={!analyzing} />
    <Text style={[s.small, { marginTop: -12 }]}>{description.length}/2,000</Text>
    <Field label="Decision deadline (optional)" placeholder="YYYY-MM-DD" value={dueDate} onChangeText={value => { setDueDate(value); setError(''); }} maxLength={10} editable={!analyzing} />
    {error ? <Notice error>{error}</Notice> : null}
    <Button icon={editingDetails ? undefined : 'sparkles'} label={analyzing ? 'Finding your priorities…' : editingDetails ? 'Save' : 'Help me make a decision'} busy={analyzing} onPress={analyze} />
    {analyzing && <Button secondary label="Cancel" onPress={cancelAnalysis} />}
  </Page>;
}
