import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { Body, Button, Field, Heading, Notice, Page, Sheet, s, theme } from '../../../components/ui';
import { DecisionPlanDetails } from '../../../components/DecisionPlanDetails';
import { useAuth } from '../../../lib/auth';
import { useStore } from '../../../lib/store';
import { getTaskPriorities } from '../../../lib/priorities';
import { generateTaskDecisionPlan } from '../../../lib/ai';
import { acceptDecisionPlan, getDecisionPlan, saveDecisionPlan } from '../../../lib/decision-plans';
import type { SavedDecisionPlan } from '../../../lib/decision-plans';
import { addPlanDays, planInputKey } from '../../../lib/decision-plan';
import type { DecisionPlan, DecisionPlanInput, ReadyDecisionPlan } from '../../../lib/decision-plan';
import type { Factor } from '../../../lib/model';
import { dateLabel, today, validDate } from '../../../lib/model';

type Snapshot = { input: DecisionPlanInput; priorities: Factor[] };
type PendingPlan = { snapshot: Snapshot; plan: ReadyDecisionPlan };

function DecisionResult({ taskId, autoGenerate }: { taskId: string; autoGenerate: boolean }) {
  const { session } = useAuth();
  const { refresh } = useStore();
  const [record, setRecord] = useState<SavedDecisionPlan | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [proposal, setProposal] = useState<DecisionPlan | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState(today);
  const [dateError, setDateError] = useState('');
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const active = useRef(true);
  const running = useRef(false);
  const autoStarted = useRef(false);
  const autoIntent = useRef(autoGenerate);
  const unsaved = useRef<PendingPlan | null>(null);
  const acceptRef = useRef(false);
  const saveRef = useRef(false);
  const disablePrevention = usePreventRemove((accepting || saving) && !leaving);
  useEffect(() => { active.current = true; return () => { active.current = false; request.current?.abort(); }; }, []);

  async function persist(pending: PendingPlan) {
    if (!session || saveRef.current) return;
    saveRef.current = true; setSaving(true); setError('');
    try {
      const { input, priorities } = pending.snapshot;
      const saved = await saveDecisionPlan(taskId, {
        inputKey: planInputKey(input), input: { title: input.title, description: input.description, dueDate: input.dueDate, context: input.context },
        priorities, plan: pending.plan,
      }, session.user.id);
      if (active.current) { setRecord(saved); setPendingPlan(null); unsaved.current = null; }
    } catch (e) {
      if (active.current) setError((e as { message?: string })?.message || 'Could not save your recommendation. Please retry saving.');
    } finally { saveRef.current = false; if (active.current) setSaving(false); }
  }

  async function research(base: Snapshot, additional = '') {
    if (running.current || acceptRef.current || saveRef.current) return;
    const context = [base.input.context, additional.trim()].filter(Boolean).join('\n');
    if (context.length > 4000) { setError('Keep the additional details under 4,000 characters.'); return; }
    if (base.input.dueDate && base.input.dueDate < today()) { setError('Your deadline has passed. Update the decision details before continuing.'); return; }
    const next: Snapshot = { ...base, input: { ...base.input, context, startDate: today() } };
    const controller = new AbortController();
    const ticket = ++generation.current;
    request.current = controller; running.current = true;
    setSnapshot(next); setResearching(true); setError(''); setAnswer(''); setPendingPlan(null); setProposal(null); unsaved.current = null;
    try {
      const result = await generateTaskDecisionPlan(next.input, controller.signal);
      if (!active.current || ticket !== generation.current) return;
      setProposal(result); setStartDate(next.input.startDate);
      if (result.status === 'ready') {
        const pending = { snapshot: next, plan: result };
        unsaved.current = pending;
        setPendingPlan(pending);
        await persist(pending);
      }
    } catch (e) {
      if (active.current && ticket === generation.current) setError(e instanceof Error ? e.message : 'Could not prepare your decision. Please try again.');
    } finally {
      if (ticket === generation.current) { request.current = null; running.current = false; if (active.current) setResearching(false); }
    }
  }
  function cancelResearch() {
    generation.current++; request.current?.abort(); request.current = null; running.current = false; setResearching(false); setError('');
  }
  const researchRef = useRef(research);
  researchRef.current = research;

  const load = useCallback(async () => {
    if (!session) return;
    const ticket = ++generation.current;
    setLoading(true); setResearching(false); setLeaving(false); setError('');
    setSnapshot(null); setProposal(null); setRecord(null); setPendingPlan(null);
    try {
      const saved = await getDecisionPlan(taskId, session.user.id);
      if (!active.current || ticket !== generation.current) return;
      setRecord(saved);
      if (saved?.status === 'accepted') {
        setProposal(saved.plan); setStartDate(saved.startDate || today()); setSnapshot(null); setPendingPlan(null); unsaved.current = null;
        return;
      }
      const current = await getTaskPriorities(taskId);
      if (!active.current || ticket !== generation.current) return;
      const previousInput = unsaved.current?.snapshot.input || saved?.input;
      const sameBrief = previousInput?.title === current.task.title && previousInput.description === current.task.notes &&
        previousInput.dueDate === (current.task.due_date || '');
      const next: Snapshot = { input: { title: current.task.title, description: current.task.notes,
        dueDate: current.task.due_date || '', startDate: today(), context: sameBrief ? previousInput?.context || '' : '', factors: current.effective }, priorities: current.effective };
      setSnapshot(next); setStartDate(today());
      if (unsaved.current && planInputKey(unsaved.current.snapshot.input) === planInputKey(next.input)) {
        setProposal(unsaved.current.plan); setPendingPlan(unsaved.current); return;
      }
      unsaved.current = null; setPendingPlan(null);
      const currentPlan = saved && saved.inputKey === planInputKey(next.input);
      setProposal(currentPlan ? saved.plan : null);
      if (autoIntent.current && !autoStarted.current && !currentPlan) {
        autoStarted.current = true;
        router.setParams({ generate: undefined });
        setLoading(false);
        void researchRef.current(next);
      }
    } catch (e) {
      if (active.current && ticket === generation.current) setError((e as { message?: string })?.message || 'Could not load this decision. Please try again.');
    } finally { if (active.current && ticket === generation.current) setLoading(false); }
  }, [taskId, session?.user.id]);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current++; request.current?.abort(); request.current = null; running.current = false; };
  }, [load]));

  const ready = proposal?.status === 'ready' ? proposal : null;
  const accepted = record?.status === 'accepted';
  const endDate = ready ? addPlanDays(startDate, ready.durationDays - 1) : '';
  const deadline = snapshot?.input.dueDate || record?.input.dueDate;
  const dateFits = Boolean(startDate && validDate(startDate) && startDate >= today() && (!deadline || endDate <= deadline));
  const busy = researching || saving || accepting;
  const matchesSaved = Boolean(record && snapshot && record.inputKey === planInputKey(snapshot.input) && !pendingPlan);

  async function accept() {
    if (!record || !ready || !matchesSaved || !dateFits || busy || acceptRef.current || !session) return;
    acceptRef.current = true; setAccepting(true); setError('');
    try {
      const receipt = await acceptDecisionPlan(taskId, record.inputKey, startDate, session.user.id);
      await refresh();
      if (!active.current) return;
      setLeaving(true); disablePrevention();
      router.navigate({ pathname: '/calendar', params: { date: receipt.startDate, addedTaskId: taskId,
        addedTaskTitle: record.input.title, noticeId: `${receipt.decisionId}-${Date.now()}` } });
    } catch (e) {
      if (active.current) setError((e as { message?: string })?.message || 'Could not add your plan to the calendar. Please try again.');
    } finally { acceptRef.current = false; if (active.current) setAccepting(false); }
  }

  return <Page title={accepted ? 'Your decision & plan' : 'Your decision'} back
    onBack={() => { if (!acceptRef.current && !saveRef.current) { cancelResearch(); if (router.canGoBack()) router.back(); else router.replace({ pathname: '/task/[id]/priorities', params: { id: taskId } }); } }}>
    {loading ? <><ActivityIndicator color={theme.teal} accessibilityLabel="Loading your decision" /><Body>Opening your decision…</Body></> : researching ? <>
      <ActivityIndicator color={theme.teal} accessibilityLabel="Preparing your recommendation" />
      <Heading>{saving ? 'Saving your recommendation…' : 'Finding your best next move.'}</Heading>
      {!saving && <Body>Checking options, contact details, and next steps.</Body>}
      <Button secondary label="Cancel" disabled={saving} onPress={cancelResearch} />
    </> : proposal?.status === 'needs_info' ? <>
      <Heading>One more detail.</Heading>
      {proposal.questions.map((question, index) => <Body key={index}>{question}</Body>)}
      <Field label="Your answer" multiline value={answer} onChangeText={setAnswer} maxLength={Math.max(0, 4000 - (snapshot?.input.context.length || 0) - 1)} placeholder="Add the missing details" />
      <Button label="Find my recommendation" disabled={!answer.trim() || busy} onPress={() => { if (snapshot) void research(snapshot, answer); }} />
    </> : ready ? <>
      {accepted && <Notice>Plan scheduled · {dateLabel(record.startDate || startDate)}</Notice>}
      <DecisionPlanDetails key={snapshot ? planInputKey(snapshot.input) : record?.inputKey} plan={ready} startDate={accepted ? record.startDate || startDate : startDate}
        priorities={record?.status === 'accepted' ? record.priorities : snapshot?.priorities || record?.priorities || []} />
      {!accepted && <>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setDateDraft(startDate); setDateError(''); setDateOpen(true); }} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[s.label, { color: theme.teal }]}>Starts {dateLabel(startDate)} · Change</Text>
        </Pressable>
        {!dateFits && <Notice error>{startDate < today() ? 'Choose today or a future start date.' : 'This plan ends after your deadline. Choose an earlier start date or update the deadline.'}</Notice>}
        {pendingPlan ? <Button label={saving ? 'Saving recommendation…' : 'Retry saving recommendation'} busy={saving} onPress={() => void persist(pendingPlan)} /> :
          <Button label={accepting ? 'Adding your plan…' : 'Add plan to calendar'} icon="calendar" busy={accepting} disabled={busy || !dateFits || !matchesSaved} onPress={accept} />}
      </>}
      {accepted && <Button label="View calendar" icon="calendar" onPress={() => router.navigate({ pathname: '/calendar', params: { date: record.startDate || today() } })} />}
    </> : !error && snapshot ? <>
      <Heading>Ready for a clear next step?</Heading><Body>We’ll use your priorities to choose an option and plan the work.</Body>
      <Button label="Get my recommendation" icon="sparkles" onPress={() => void research(snapshot)} />
    </> : null}
    {error ? <Notice error>{error}</Notice> : null}
    {!loading && !busy && error && !ready && <Button secondary label="Try again" onPress={() => { if (snapshot) void research(snapshot); else void load(); }} />}
    <Sheet visible={dateOpen} title="Plan start date" close={() => { if (!busy) setDateOpen(false); }}>
      <Field label="Start date" value={dateDraft} onChangeText={setDateDraft} maxLength={10} placeholder="YYYY-MM-DD" />
      {dateError ? <Notice error>{dateError}</Notice> : null}
      <Button label="Use this date" onPress={() => {
        if (!dateDraft || !validDate(dateDraft) || dateDraft < today()) { setDateError('Choose today or a future date in YYYY-MM-DD format.'); return; }
        if (ready && deadline && addPlanDays(dateDraft, ready.durationDays - 1) > deadline) { setDateError('The plan would finish after your decision deadline.'); return; }
        setStartDate(dateDraft); setDateOpen(false);
      }} />
    </Sheet>
  </Page>;
}

export default function TaskDecisionPage() {
  const { id, generate } = useLocalSearchParams<{ id: string; generate?: string }>();
  return <DecisionResult key={id} taskId={id} autoGenerate={generate === '1'} />;
}
