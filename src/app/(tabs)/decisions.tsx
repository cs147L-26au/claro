import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Chip, Empty, Field, Heading, Icon, Page, s, theme } from '../../components/ui';
import { useStore } from '../../lib/store';
import { dateLabel } from '../../lib/model';

export default function Decisions() {
  const { data } = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Active');
  const filtered = data.decisions.filter(d => (filter === 'All' || d.status === (filter === 'Active' ? 'active' : 'archived')) &&
    [d.title, d.choice, d.notes, d.category].join(' ').toLowerCase().includes(query.toLowerCase().trim())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return <Page title="Decisions">
    <View style={{ gap: 6 }}><Heading>A little clarity to come back to.</Heading><Body>Your choices, your reasons, all in one place.</Body></View>
    <Button icon="plus" label="Store a decision" onPress={() => router.push('/decision/new')} />
    <Pressable accessibilityRole="button" onPress={() => router.push('/decision/compare')}><Card soft><View style={s.row}><Icon name="decision" /><View style={{ flex: 1, gap: 4 }}><Text style={[s.title, { color: theme.teal }]}>Still weighing your options?</Text><Body>Compare them with your priorities.</Body></View><Icon name="arrow" size={18} /></View></Card></Pressable>
    <Field label="Find a decision" placeholder="Search decisions, choices, or notes" value={query} onChangeText={setQuery} />
    <View style={s.wrap}>{['Active', 'Archived', 'All'].map(f => <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />)}</View>
    <Text style={s.small}>{filtered.length} {filtered.length === 1 ? 'decision' : 'decisions'}</Text>
    {filtered.map(d => <Pressable accessibilityRole="button" key={d.id} onPress={() => router.push({ pathname: '/decision/[id]', params: { id: d.id } })}><Card>
      <View style={s.between}><Text style={[s.small, { color: theme.teal }]}>{d.category.toUpperCase()}</Text><Text style={s.small}>{d.status === 'archived' ? 'Archived' : 'Saved'}</Text></View>
      <View style={s.between}><Text style={[s.title, { flex: 1 }]}>{d.title}</Text><Icon name="arrow" size={18} /></View>
      <Body>{d.choice}</Body><View style={s.divider} /><Text style={s.small}>{d.reviewDate ? `Review · ${dateLabel(d.reviewDate)}` : `Saved · ${new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</Text>
    </Card></Pressable>)}
    {!filtered.length && <Empty title={query ? 'No matching decisions' : filter === 'Archived' ? 'Nothing archived yet' : 'Keep the why behind your choices'} text={query ? 'Try another search or change your filter.' : filter === 'Archived' ? 'Archive a decision when you no longer need to review it. You can restore it anytime.' : 'Save your first decision, what you chose, and what helped you get there.'} />}
    <Text style={[s.small, { textAlign: 'center' }]}>Saved to your account · Synced across devices</Text>
  </Page>;
}
