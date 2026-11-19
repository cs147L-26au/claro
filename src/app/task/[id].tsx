import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, Empty, Field, Heading, Notice, Page } from '../../components/ui';
import { useStore } from '../../lib/store';
import { validDate } from '../../lib/model';
import { TaskPrioritiesEntry } from '../../components/TaskPrioritiesEntry';
import { NewTaskForm } from '../../components/NewTaskForm';
import { useAcceptedTaskPlans } from '../../lib/decision-plans';

export default function TaskForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === 'new' ? <NewTaskForm /> : <EditTaskForm key={id} id={id} />;
}

function EditTaskForm({ id }: { id: string }) {
  const { data, save } = useStore(); const task = data.tasks.find(t => t.id === id);
  const plans = useAcceptedTaskPlans();
  const hasPlan = plans.data.some(plan => plan.taskId === id);
  const [title, setTitle] = useState(task?.title || ''); const [notes, setNotes] = useState(task?.notes || '');
  const [dueDate, setDueDate] = useState(task?.dueDate || ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!task) return <Page title="Task" back><Empty title="Task not found" text="Return to Tasks to find your next step." /></Page>;
  async function submit(done = task?.done || false) {
    if (!task) return;
    if (!title.trim()) { setError('Give your task a title.'); return; }
    if (!validDate(dueDate)) { setError('Use a real date in YYYY-MM-DD format, or leave it empty.'); return; }
    setBusy(true); setError('');
    const record = { id: task.id, title: title.trim(), notes: notes.trim(), dueDate, done };
    try {
      await save(d => ({ ...d, tasks: d.tasks.map(t => t.id === task.id ? record : t) }));
      router.replace('/tasks');
    }
    catch (e) { setError((e as { message?: string })?.message || 'Could not save this task. Please try again.'); } finally { setBusy(false); }
  }
  return <Page title="Your task" back><Heading>What are you deciding?</Heading><Body>Give this decision a name and describe what you need.</Body>
    {hasPlan && <Button label="View decision & plan" icon="decision" onPress={() => router.push({ pathname: '/task/[id]/decision', params: { id } })} />}
    <Field label="Decision name *" placeholder="e.g. Choose a coffee supplier" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
    <Field label="Description" placeholder="Your goals, constraints, and anything to consider" multiline value={notes} onChangeText={setNotes} maxLength={2000} editable={!busy} />
    <Field label="Decision deadline (optional)" placeholder="YYYY-MM-DD" value={dueDate} onChangeText={setDueDate} maxLength={10} editable={!busy} />
    <TaskPrioritiesEntry taskId={task.id} />
    {error ? <Notice error>{error}</Notice> : null}
    <Button label="Save changes" busy={busy} onPress={() => submit()} />
    <Button secondary label={task.done ? 'Mark as to do' : 'Mark as complete'} disabled={busy} onPress={() => submit(!task.done)} />
  </Page>;
}
