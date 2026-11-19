import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Chip, Empty, Heading, Icon, Notice, Page, s, theme } from '../../components/ui';
import { useStore } from '../../lib/store';
import { useAcceptedTaskPlans } from '../../lib/decision-plans';
import { dateLabel } from '../../lib/model';
import { decisionsByDate, decisionSummary } from '../../lib/decision-history';
export default function Tasks() {
  const { data, save } = useStore();
  const plans = useAcceptedTaskPlans();
  const plannedTasks = new Set(plans.data.map(plan => plan.taskId));
  const [filter, setFilter] = useState('Open'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const tasks = data.tasks.filter(t => filter === 'All' || t.done === (filter === 'Done')).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const decisions = decisionsByDate(data.decisions);
  function openTask(id: string) {
    if (plannedTasks.has(id)) router.push({ pathname: '/task/[id]/decision', params: { id } });
    else router.push({ pathname: '/task/[id]', params: { id } });
  }
  async function toggle(id: string) { setBusy(true); setError(''); try { await save(d => ({ ...d, tasks: d.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) })); } catch { setError('Could not save that change. Try again.'); } finally { setBusy(false); } }
  return <Page title="Tasks"><View style={{ gap: 6 }}><Heading>Decisions to make.</Heading><Body>Each task is a decision. Set your priorities and compare your choices.</Body></View>
    {decisions.length > 0 && <><Heading>Decisions made</Heading>
      <Pressable accessibilityRole="button" accessibilityLabel={`View all ${decisions.length} decisions made`}
        accessibilityHint="Opens your decision timeline, newest first"
        onPress={() => router.push('/decisions-made')}
        style={({ pressed }) => ({ backgroundColor: '#123F3A', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 8, opacity: pressed ? 0.8 : 1 })}>
        {decisions.slice(0, 3).map((decision, index) => <View key={decision.id} style={[s.row, {
          minHeight: 48, paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderTopColor: '#315751',
        }]}>
          <Icon name="check" color="#D8E6B5" size={17} />
          <Text numberOfLines={1} style={[s.label, { color: theme.white, flex: 1 }]}>{decisionSummary(decision)}</Text>
        </View>)}
        <View style={[s.between, { minHeight: 44, borderTopWidth: 1, borderTopColor: '#315751' }]}>
          <Text style={[s.label, { color: '#D8E6B5' }]}>View all · {decisions.length}</Text><Icon name="arrow" color="#D8E6B5" size={18} />
        </View>
      </Pressable></>}
    <Button icon="plus" label="Add task" onPress={() => router.push('/task/new')} />
    <View style={s.wrap}>{['Open', 'Done', 'All'].map(f => <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />)}</View>
    {error ? <Notice error>{error}</Notice> : null}
    {tasks.map(t => <Card key={t.id}><View style={s.row}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Complete ${t.title}`} accessibilityState={{ checked: t.done, disabled: busy }} disabled={busy} onPress={() => toggle(t.id)} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}><View style={{ width: 25, height: 25, borderRadius: 8, borderWidth: 1.5, borderColor: theme.teal, backgroundColor: t.done ? theme.teal : 'white', alignItems: 'center', justifyContent: 'center' }}>{t.done && <Icon name="check" color="white" size={17} />}</View></Pressable>
      <Pressable accessibilityRole="button" onPress={() => openTask(t.id)} style={{ flex: 1, gap: 5 }}><Text style={[s.title, t.done && { textDecorationLine: 'line-through', color: theme.muted }]}>{t.title}</Text>{t.notes ? <Text numberOfLines={2} style={s.body}>{t.notes}</Text> : null}<Text style={[s.small, plannedTasks.has(t.id) && { color: theme.teal }]}>{plannedTasks.has(t.id) ? 'Plan scheduled' : t.dueDate ? dateLabel(t.dueDate) : 'No deadline'}</Text></Pressable><Icon name="arrow" size={18} />
    </View></Card>)}
    {!tasks.length && <Empty icon="tasks" title={filter === 'Done' ? 'Decisions completed' : 'A fresh page'} text={filter === 'Done' ? 'Completed tasks will appear here.' : 'Add a decision you need to make, then choose what matters most.'} />}
  </Page>;
}
