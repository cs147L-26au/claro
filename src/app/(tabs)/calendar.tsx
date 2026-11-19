import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, Card, Chip, Empty, Field, Heading, Icon, IconButton, Notice, Page, Sheet, s, theme } from '../../components/ui';
import { PlanResources } from '../../components/DecisionPlanDetails';
import { usePostDecisionTasks } from '../../lib/followups';
import { useAcceptedTaskPlans } from '../../lib/decision-plans';
import type { PlanAction } from '../../lib/decision-plan';
import { useStore } from '../../lib/store';
import { dateLabel, today, uid, validDate } from '../../lib/model';

export default function Calendar() {
  const { date, addedTaskId, noticeId } = useLocalSearchParams<{ date?: string; addedTaskId?: string; addedTaskTitle?: string; noticeId?: string }>();
  const [selected, setSelected] = useState(today);
  useEffect(() => { if (date && validDate(date)) setSelected(date); }, [date]);
  const [year, month] = selected.split('-').map(Number);
  const days = new Date(year, month, 0).getDate();
  const prefix = selected.slice(0, 7);
  const followups = usePostDecisionTasks(`${prefix}-01`, `${prefix}-${days}`);
  const { data } = useStore();
  const plans = useAcceptedTaskPlans();
  const plannedActions = useMemo(() => {
    const actions = new Map<string, PlanAction>();
    plans.data.forEach(saved => {
      if (saved.status !== 'accepted' || !saved.decisionId) return;
      saved.plan.days.forEach(day => day.actions.forEach((action, index) => {
        actions.set(`${saved.decisionId}-${day.day}-${index + 1}`, action);
      }));
    });
    return actions;
  }, [plans.data]);
  const [expandedActions, setExpandedActions] = useState<string[]>([]);
  const shownNotices = useRef(new Set<string>());
  const [banner, setBanner] = useState('');
  useEffect(() => {
    if (!noticeId || !addedTaskId || shownNotices.current.has(noticeId)) return;
    const saved = plans.data.find(plan => plan.taskId === addedTaskId && plan.status === 'accepted');
    if (!saved) return;
    const taskTitle = data.tasks.find(task => task.id === saved.taskId)?.title || saved.input.title;
    shownNotices.current.add(noticeId);
    setBanner(`${taskTitle} has been added to your calendar.`);
    router.setParams({ addedTaskId: undefined, addedTaskTitle: undefined, noticeId: undefined });
  }, [noticeId, addedTaskId, plans.data, data.tasks]);
  function openDecision(id: string) {
    const saved = plans.data.find(plan => plan.decisionId === id);
    if (saved) router.push({ pathname: '/task/[id]/decision', params: { id: saved.taskId } });
    else router.push({ pathname: '/decision/[id]', params: { id } });
  }
  const [adding, setAdding] = useState(false);
  const [decisionId, setDecisionId] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(selected);
  const [newId, setNewId] = useState(uid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rows = followups.data.filter(row => row.due_date === selected);
  const counts = new Map<string, number>();
  followups.data.filter(row => !row.done).forEach(row => counts.set(row.due_date, (counts.get(row.due_date) || 0) + 1));
  function moveMonth(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    setSelected(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`);
  }
  async function save() {
    setBusy(true); setError('');
    try {
      await followups.create(decisionId, [{ id: newId, title, notes, dueDate }]);
      setSelected(dueDate); setAdding(false);
    } catch (e) { setError((e as { message?: string })?.message || 'Could not save this follow-up.'); }
    finally { setBusy(false); }
  }
  return <Page title="Calendar" action={<IconButton name="history" label="Refresh follow-ups" onPress={followups.refresh} />}>
    {banner ? <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[s.card, s.soft, s.row, { paddingVertical: 10 }]}>
      <Icon name="check" size={20} />
      <Text style={[s.label, { flex: 1, color: theme.teal }]}>{banner}</Text>
      <IconButton name="close" label="Dismiss calendar confirmation" onPress={() => setBanner('')} />
    </View> : null}
    <Body>Your next steps.</Body>
    <Card>
      <View style={s.between}>
        <IconButton name="back" label="Previous month" onPress={() => moveMonth(-1)} />
        <Text accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit style={[s.title, { flex: 1, textAlign: 'center', color: theme.teal }]}>{new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <IconButton name="arrow" label="Next month" onPress={() => moveMonth(1)} />
      </View>
      <View style={{ flexDirection: 'row' }}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => <Text key={i} style={[s.small, { width: `${100 / 7}%`, textAlign: 'center' }]}>{day}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: new Date(year, month - 1, 1).getDay() }, (_, i) => <View key={`blank-${i}`} style={{ width: `${100 / 7}%` }} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = `${prefix}-${String(i + 1).padStart(2, '0')}`;
          const active = selected === date;
          return <Pressable key={date} accessibilityRole="button" accessibilityLabel={`${dateLabel(date)}, ${counts.get(date) || 0} open follow-ups`}
            accessibilityState={{ selected: active }} onPress={() => setSelected(date)}
            style={{ width: `${100 / 7}%`, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 16, backgroundColor: active ? theme.teal : date === today() ? theme.soft : 'transparent', gap: 4 }}>
            <Text style={[s.label, { color: active ? theme.white : theme.ink }]}>{i + 1}</Text>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: counts.has(date) ? active ? theme.white : theme.teal : 'transparent' }} />
          </Pressable>;
        })}
      </View>
      <View style={{ alignItems: 'center' }}><Chip label="Today" onPress={() => setSelected(today())} /></View>
    </Card>
    <Heading>{dateLabel(selected)}</Heading>
    {followups.loading && <ActivityIndicator accessibilityLabel="Loading follow-ups" color={theme.teal} />}
    {followups.error ? <><Notice error>{followups.error}</Notice><Button secondary label="Try again" onPress={followups.refresh} /></> : null}
    {!adding && error ? <Notice error>{error}</Notice> : null}
    {rows.map(row => {
      const action = plannedActions.get(row.id);
      const isExpanded = expandedActions.includes(row.id);
      const titleStyle = [s.title, { flex: 1, textDecorationLine: row.done ? 'line-through' as const : 'none' as const }];
      return <Card key={row.id}>
        <View style={s.row}>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`Complete ${row.title}`} accessibilityState={{ checked: row.done, disabled: busy }} disabled={busy}
            onPress={async () => { setBusy(true); setError(''); try { await followups.setDone(row.id, !row.done); } catch (e) { setError((e as { message?: string })?.message || 'Could not update follow-up.'); } finally { setBusy(false); } }}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: theme.border, backgroundColor: row.done ? theme.soft : theme.white }}>
            {row.done && <Icon name="check" />}
          </Pressable>
          {action ? <Pressable accessibilityRole="button" accessibilityLabel={`${row.title}, ${isExpanded ? 'hide' : 'show'} details`}
            accessibilityState={{ expanded: isExpanded }}
            onPress={() => setExpandedActions(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id])}
            style={[s.between, { flex: 1, minHeight: 44 }]}>
            <Text style={titleStyle}>{row.title}</Text><Icon name={isExpanded ? 'close' : 'plus'} size={17} />
          </Pressable> : <Text style={titleStyle}>{row.title}</Text>}
        </View>
        {action ? isExpanded && <><Body>{action.details}</Body><PlanResources resources={action.resources} /></> : row.notes ? <Body>{row.notes}</Body> : null}
        {(!action || isExpanded) && <Pressable accessibilityRole="button" accessibilityLabel="View decision and plan" onPress={() => openDecision(row.decision_id)} style={{ minHeight: 36, justifyContent: 'center' }}>
          <Text style={[s.small, { color: theme.teal }]}>{data.decisions.find(d => d.id === row.decision_id)?.title || 'View decision & plan'}</Text>
        </Pressable>}
      </Card>;
    })}
    {!followups.loading && !followups.error && !rows.length && <Empty icon="calendar" title="No follow-ups for this day" text="Next steps from your saved decisions appear here." />}
    <Button icon="plus" label="Add post-decision task" onPress={() => { setNewId(uid()); setDecisionId(''); setTitle(''); setNotes(''); setDueDate(selected); setError(''); setAdding(true); }} />
    <Sheet visible={adding} title="Add post-decision task" close={() => { if (!busy) setAdding(false); }}>
      <Heading>Which saved decision?</Heading>
      {data.decisions.length ? <View style={s.wrap}>{data.decisions.map(d => <Chip key={d.id} label={d.title} selected={decisionId === d.id} onPress={() => { if (!busy) setDecisionId(d.id); }} />)}</View> : <Body>Save a decision first, then add its follow-ups here.</Body>}
      <Field label="Follow-up *" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} placeholder="e.g. Contact the chosen supplier" />
      <Field label="Due date *" value={dueDate} onChangeText={setDueDate} maxLength={10} editable={!busy} placeholder="YYYY-MM-DD" />
      <Field label="Notes" value={notes} onChangeText={setNotes} maxLength={2000} multiline editable={!busy} />
      {error ? <Notice error>{error}</Notice> : null}
      <Button label="Save follow-up" busy={busy} disabled={!decisionId || !title.trim()} onPress={save} />
    </Sheet>
  </Page>;
}
