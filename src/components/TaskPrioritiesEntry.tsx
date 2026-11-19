import { router } from 'expo-router';
import { Button, Card, Body } from './ui';
import { useTaskPriorities } from '../lib/priorities/hooks';

/** Drop-in entry point for the task team's detail screen. No task writes. */
export function TaskPrioritiesEntry({ taskId }: { taskId: string }) {
  const priorities = useTaskPriorities(taskId);
  return <Card>
    <Body>{priorities.mode === 'custom' ? 'Using custom priorities for this task.' : priorities.mode === 'universal' ? 'Using your universal priorities.' : priorities.loading ? 'Checking task priorities…' : 'Universal by default. Open to check or customize this task’s balance.'}</Body>
    <Button secondary icon="priorities" label="Adjust priorities for this task" onPress={() => router.push({ pathname: '/task/[id]/priorities', params: { id: taskId } })} />
  </Card>;
}
