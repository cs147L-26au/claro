import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Chip, Empty, Heading, Icon, Notice, Page, s, theme } from '../../components/ui';
import { useStore } from '../../lib/store';
import { dateLabel } from '../../lib/model';
export default function Tasks() {
  const { data, save } = useStore();
  const [filter, setFilter] = useState('To do'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const tasks = data.tasks.filter(t => filter === 'All' || t.done === (filter === 'Done')).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const decisions = data.decisions.filter(d => d.status === 'active');
  async function toggle(id: string) { setBusy(true); setError(''); try { await save(d => ({ ...d, tasks: d.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) })); } catch { setError('Could not save that change. Try again.'); } finally { setBusy(false); } }
  return <Page title="Tasks"><View style={{ gap: 6 }}><Heading>Small steps. A clearer day.</Heading><Body>Your choices, and the next steps to take.</Body></View>
    {decisions.length > 0 && <><View style={s.between}><Heading>Decisions made</Heading><Text style={s.small}>{decisions.length} saved</Text></View>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/decision/[id]', params: { id: decisions[0].id } })} style={{ backgroundColor: '#123F3A', borderRadius: 22, padding: 23, gap: 22 }}>
        <View style={s.row}><Icon name="check" color="#D8E6B5" size={20} /><Text style={[s.label, { color: '#D8E6B5', flex: 1 }]}>{decisions[0].title}</Text></View>
        <View style={s.between}><Text style={{ color: 'white', fontSize: 26, lineHeight: 34, flex: 1 }}>{decisions[0].choice}</Text><Icon name="arrow" color="#D8E6B5" /></View>
      </Pressable></>}
    <Button icon="plus" label="Add task" onPress={() => router.push('/task/new')} />
    <View style={s.wrap}>{['To do', 'Done', 'All'].map(f => <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />)}</View>
    {error ? <Notice error>{error}</Notice> : null}
    {tasks.map(t => <Card key={t.id}><View style={s.row}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Complete ${t.title}`} accessibilityState={{ checked: t.done, disabled: busy }} disabled={busy} onPress={() => toggle(t.id)} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}><View style={{ width: 25, height: 25, borderRadius: 8, borderWidth: 1.5, borderColor: theme.teal, backgroundColor: t.done ? theme.teal : 'white', alignItems: 'center', justifyContent: 'center' }}>{t.done && <Icon name="check" color="white" size={17} />}</View></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/task/[id]', params: { id: t.id } })} style={{ flex: 1, gap: 5 }}><Text style={[s.title, t.done && { textDecorationLine: 'line-through', color: theme.muted }]}>{t.title}</Text>{t.notes ? <Text numberOfLines={2} style={s.body}>{t.notes}</Text> : null}<Text style={s.small}>{t.dueDate ? dateLabel(t.dueDate) : 'No due date'}</Text></Pressable><Icon name="arrow" size={18} />
    </View></Card>)}
    {!tasks.length && <Empty icon="tasks" title={filter === 'Done' ? 'Every step counts' : 'A fresh page'} text={filter === 'Done' ? 'Completed tasks will appear here.' : 'Add something you’d like to move forward. One small step is enough.'} />}
  </Page>;
}
