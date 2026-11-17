import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, Card, Chip, Empty, Heading, Notice, Page, s, theme } from '../../components/ui';
import { useStore } from '../../lib/store';
import { dateLabel } from '../../lib/model';
export default function DecisionDetail() {
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const { data, save } = useStore();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const d = data.decisions.find(x => x.id === id);
  if (!d) return <Page title="Decision" back><Empty title="Decision not found" text="Return to your decision set to find a saved choice." /><Button label="View decisions" onPress={() => router.replace('/decisions')} /></Page>;
  async function archive() {
    setBusy(true); setError('');
    try { await save(state => ({ ...state, decisions: state.decisions.map(x => x.id === id ? { ...x, status: x.status === 'active' ? 'archived' : 'active', updatedAt: new Date().toISOString() } : x) })); }
    catch { setError('Could not update this decision. Please try again.'); } finally { setBusy(false); }
  }
  return <Page title="Your decision" back>
    {saved === '1' && <Notice>Decision saved. A little more clarity, whenever you need it.</Notice>}
    <View style={s.wrap}><Chip label={d.category} /><Chip label={d.status === 'active' ? 'Active' : 'Archived'} /></View>
    <Heading>{d.title}</Heading>
    <Card soft><Text style={s.label}>YOUR CHOICE</Text><Text style={[s.heading, { fontSize: 23 }]}>{d.choice}</Text></Card>
    <View style={{ gap: 8 }}><Heading>Why you chose it</Heading><Body>{d.notes || 'No notes added yet. You can add your reasoning by editing this decision.'}</Body></View>
    {d.alternatives.length > 0 && <Card><Text style={s.title}>Other options considered</Text>{d.alternatives.map((a, i) => <Body key={i}>• {a}</Body>)}</Card>}
    <Card><Text style={s.title}>What mattered at the time</Text><Body>These are the priorities saved with this decision.</Body>{d.priorities.map(f => <View key={f.id} style={s.row}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: f.color }} /><Text style={[s.label, { flex: 1 }]}>{f.name}</Text><Text style={[s.label, { color: theme.teal }]}>{f.weight}%</Text></View>)}</Card>
    <Card><Text style={s.title}>A moment to revisit</Text><Body>{d.reviewDate ? dateLabel(d.reviewDate) : 'No review date set'}</Body><Text style={s.small}>Saved {new Date(d.createdAt).toLocaleDateString()} · Updated {new Date(d.updatedAt).toLocaleDateString()}</Text></Card>
    {error ? <Notice error>{error}</Notice> : null}
    <Button label="Edit decision" icon="edit" disabled={busy} onPress={() => router.push({ pathname: '/decision/edit', params: { id: d.id } })} />
    <Button secondary icon="archive" label={d.status === 'active' ? 'Archive decision' : 'Restore decision'} onPress={archive} busy={busy} />
    <Button secondary label="Back to decision set" disabled={busy} onPress={() => router.replace('/decisions')} />
  </Page>;
}
