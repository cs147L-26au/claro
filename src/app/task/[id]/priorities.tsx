import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { Body, Button, Notice, Page, Sheet, theme } from '../../../components/ui';
import { PriorityEditor } from '../../../components/PriorityEditor';
import { useTaskPriorities } from '../../../lib/priorities/hooks';
import { useStore } from '../../../lib/store';

function TaskPriorities({ taskId, pending, onDirtyChange, onBusyChange }: {
  taskId: string; pending: boolean; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const priorities = useTaskPriorities(taskId);
  const { data } = useStore();
  if (!priorities.data) return <>
    {priorities.loading ? <ActivityIndicator accessibilityLabel="Loading priorities" color={theme.teal} /> : <Notice error>{priorities.error || 'Priorities could not be loaded.'}</Notice>}
    {!priorities.loading && <Button secondary label="Try again" onPress={priorities.refresh} />}
  </>;
  return <>
    {priorities.error ? <><Notice error>{priorities.error}</Notice><Button secondary label="Try again" onPress={priorities.refresh} /></> : null}
    <PriorityEditor task autoSave title={priorities.data.task.title} factors={priorities.data.effective}
      universalFactors={data.factors} onDirtyChange={onDirtyChange} onBusyChange={onBusyChange} onSave={priorities.save} />
    <Button label="Continue to decision" icon="arrow" disabled={pending || priorities.loading || Boolean(priorities.error)}
      onPress={() => router.push({ pathname: '/task/[id]/decision', params: { id: taskId, generate: '1' } })} />
  </>;
}

function TaskPrioritiesScreen({ taskId }: { taskId: string }) {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [failedBack, setFailedBack] = useState<{ resume: () => void } | null>(null);
  const pendingBack = useRef<(() => void) | null>(null);
  usePreventRemove(!leaving && (dirty || busy), ({ repeat }) => {
    if (dirty && !busy) setFailedBack({ resume: repeat });
    else pendingBack.current = repeat;
  });
  useEffect(() => {
    if (!busy && pendingBack.current) {
      const resume = pendingBack.current; pendingBack.current = null;
      if (dirty) setFailedBack({ resume }); else resume();
    }
  }, [dirty, busy]);
  return <Page title="Set priorities" back onBack={() => router.canGoBack() ? router.back() : router.replace('/tasks')}>
    <TaskPriorities taskId={taskId} pending={dirty || busy} onDirtyChange={setDirty} onBusyChange={setBusy} />
    <Sheet visible={Boolean(failedBack)} title="Changes aren’t saved" close={() => setFailedBack(null)}>
      <Body>Retry saving, or leave without these changes.</Body>
      <Button label="Keep editing" onPress={() => setFailedBack(null)} />
      <Button secondary label="Leave without saving" onPress={() => {
        const resume = failedBack?.resume; setFailedBack(null); setLeaving(true); resume?.();
      }} />
    </Sheet>
  </Page>;
}

export default function TaskPrioritiesPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskPrioritiesScreen key={id} taskId={id} />;
}
