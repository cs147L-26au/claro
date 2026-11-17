import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, Empty, Field, Heading, Notice, Page } from '../../components/ui';
import { useStore } from '../../lib/store';
import { uid, validDate } from '../../lib/model';

export default function TaskForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, save } = useStore(); const task = data.tasks.find(t => t.id === id);
  const [title, setTitle] = useState(task?.title || ''); const [notes, setNotes] = useState(task?.notes || '');
  const [dueDate, setDueDate] = useState(task?.dueDate || ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (id !== 'new' && !task) return <Page title="Task" back><Empty title="Task not found" text="Return to Tasks to find your next step." /></Page>;
  async function submit(done = task?.done || false) {
    if (!title.trim()) { setError('Give your task a title.'); return; }
    if (!validDate(dueDate)) { setError('Use a real date in YYYY-MM-DD format, or leave it empty.'); return; }
    setBusy(true); setError('');
    const record = { id: task?.id || uid(), title: title.trim(), notes: notes.trim(), dueDate, done };
    try { await save(d => ({ ...d, tasks: task ? d.tasks.map(t => t.id === task.id ? record : t) : [...d.tasks, record] })); router.replace('/tasks'); }
    catch { setError('Could not save this task. Please try again.'); } finally { setBusy(false); }
  }
  return <Page title={task ? 'Your task' : 'Add a task'} back><Heading>What’s your next step?</Heading><Body>Make it small enough to start.</Body>
    <Field label="Task title *" placeholder="e.g. Ask for a new supplier quote" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
    <Field label="Notes (optional)" placeholder="Anything you’d like to remember" multiline value={notes} onChangeText={setNotes} maxLength={2000} editable={!busy} />
    <Field label="Due date (optional)" placeholder="YYYY-MM-DD" value={dueDate} onChangeText={setDueDate} maxLength={10} editable={!busy} />
    {error ? <Notice error>{error}</Notice> : null}
    <Button label={task ? 'Save changes' : 'Add task'} busy={busy} onPress={() => submit()} />
    {task && <Button secondary label={task.done ? 'Mark as to do' : 'Mark as complete'} disabled={busy} onPress={() => submit(!task.done)} />}
  </Page>;
}
