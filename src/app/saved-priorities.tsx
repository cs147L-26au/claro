import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Chip, Empty, Field, IconButton, Notice, Page, s, theme } from '../components/ui';
import { PriorityChart } from '../components/PriorityChart';
import { useSavedTaskPriorities } from '../lib/priorities/hooks';

const filters = ['All', 'Custom', 'Completed'] as const;
export default function SavedPriorities() {
  const saved = useSavedTaskPriorities();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<typeof filters[number]>('All');
  const [limit, setLimit] = useState(20);
  const matches = (saved.data || []).filter(item =>
    item.task.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (filter !== 'Custom' || item.mode === 'custom') && (filter !== 'Completed' || item.task.done));
  return <Page title="Saved task priorities" back action={<IconButton name="history" label="Refresh saved task priorities" onPress={() => { void saved.refresh(); }} />}>
    <Field label="Find a task" placeholder="Search by decision name" value={search} onChangeText={value => { setSearch(value); setLimit(20); }} />
    <View style={s.wrap}>{filters.map(value => <Chip key={value} label={value} selected={filter === value} onPress={() => { setFilter(value); setLimit(20); }} />)}</View>
    {saved.loading && <ActivityIndicator color={theme.teal} accessibilityLabel="Loading saved task priorities" />}
    {saved.error ? <><Notice error>{saved.error}</Notice><Button secondary label="Try again" disabled={saved.loading} onPress={() => { void saved.refresh(); }} /></> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 20 }}>
      {matches.slice(0, limit).map(item => <Pressable key={item.task.id} accessibilityRole="button"
        accessibilityLabel={`View task priorities for ${item.task.title}`}
        onPress={() => router.push({ pathname: '/task/[id]/priorities', params: { id: item.task.id } })}
        style={({ pressed }) => ({ width: '48%', gap: 8, opacity: pressed ? 0.65 : 1 })}>
        <View style={[s.card, { padding: 8, alignItems: 'center', gap: 8 }]}>
          <PriorityChart factors={item.effective} chartOnly segmentLabels centerLabel={item.task.title} />
        </View>
        <Text style={[s.small, { textAlign: 'center', color: theme.teal }]}>View task priorities</Text>
      </Pressable>)}
    </View>
    {matches.length > limit && <Button secondary label="Show more tasks" onPress={() => setLimit(current => current + 20)} />}
    {!saved.loading && !saved.error && !matches.length && <Empty icon="history"
      title={saved.data?.length ? 'No matching tasks' : 'Your task balances will appear here'}
      text={saved.data?.length ? 'Try another name or filter.' : 'Add a decision task, then use your universal balance or save priorities just for it.'} />}
  </Page>;
}
