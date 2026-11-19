import { useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Body, Button, Card, Heading, Notice, Page, s, theme } from '../../../components/ui';
import { PriorityEditor } from '../../../components/PriorityEditor';
import { useRankedOptions, useTaskPriorities } from '../../../lib/priorities/hooks';

function TaskRanking({ taskId, dirty }: { taskId: string; dirty: boolean }) {
  const ranking = useRankedOptions(taskId);
  return <>
    <Heading>Suggested choices</Heading>
    {dirty ? <Notice>Save your changes with Update ranking to see choices for this balance.</Notice> : <>
      {ranking.loading ? <ActivityIndicator accessibilityLabel="Updating ranking" color={theme.teal} /> : ranking.error ? <Notice error>{ranking.error}</Notice> :
        ranking.data?.length === 0 ? <Body>No candidate options yet. Your priorities are ready for when choices arrive.</Body> :
          ranking.data?.map(option => <Card key={option.id} soft={option.is_recommended}>
            {option.is_recommended && <Text style={[s.label, { color: theme.teal }]}>Recommended</Text>}
            <Text style={s.title}>{option.rank}. {option.name}</Text>
            <Text style={s.small}>{option.score.toFixed(1)} / 100 weighted score</Text>
            <Body>{option.reason}</Body><Body>Main trade-off: {option.trade_off}</Body>
          </Card>)}
      <Button secondary label="Update ranking" disabled={ranking.loading} onPress={ranking.refresh} />
    </>}
  </>;
}

function TaskPriorities({ taskId }: { taskId: string }) {
  const priorities = useTaskPriorities(taskId);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!priorities.data) return <>
    {priorities.loading ? <ActivityIndicator accessibilityLabel="Loading task priorities" color={theme.teal} /> : <Notice error>{priorities.error || 'Task priorities could not be loaded.'}</Notice>}
    <Button secondary label="Try again" disabled={priorities.loading} onPress={priorities.refresh} />
  </>;
  return <>
    <Heading>{priorities.data.task.title}</Heading>
    {priorities.error ? <><Notice error>{priorities.error}</Notice><Button secondary label="Retry loading priorities" onPress={priorities.refresh} /></> : null}
    <Notice>{priorities.mode === 'universal' ? 'Using universal priorities · Changes to your business priorities carry through to this task.' : 'Using custom priorities · Task weights take precedence. New universal factors still carry through.'}</Notice>
    <PriorityEditor key={priorities.mode} task title={priorities.data.task.title} disabled={busy} onBusyChange={setSaving} factors={priorities.data.effective} onDirtyChange={setDirty} onSave={async factors => {
      await priorities.save(factors); setDirty(false);
    }} />
    {priorities.mode === 'custom' && <Button secondary label="Use universal priorities" busy={busy} disabled={saving} onPress={async () => {
      setBusy(true); setError('');
      try { await priorities.revertToUniversal(); setDirty(false); }
      catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string })?.message || 'Could not restore universal priorities.'); }
      finally { setBusy(false); }
    }} />}
    {error ? <Notice error>{error}</Notice> : null}
    <TaskRanking taskId={taskId} dirty={dirty} />
  </>;
}
export default function TaskPrioritiesPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Page title="Task priorities" back><TaskPriorities key={id} taskId={id} /></Page>;
}
