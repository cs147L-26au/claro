import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, Card, Empty, Field, Heading, Notice, Page, Sheet } from '../../components/ui';
import { useStore } from '../../lib/store';
import { Factor, uid, validDate } from '../../lib/model';
import { TaskPrioritiesEntry } from '../../components/TaskPrioritiesEntry';
import { PriorityEditor } from '../../components/PriorityEditor';
import { createTaskWithPriorities } from '../../lib/priorities';
import { useAuth } from '../../lib/auth';

export default function TaskForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, save, refresh } = useStore(); const task = data.tasks.find(t => t.id === id);
  const { session } = useAuth();
  const [newId] = useState(uid);
  const [customPriorities, setCustomPriorities] = useState<Factor[] | null>(null);
  const [prioritiesOpen, setPrioritiesOpen] = useState(false);
  const [title, setTitle] = useState(task?.title || ''); const [notes, setNotes] = useState(task?.notes || '');
  const [dueDate, setDueDate] = useState(task?.dueDate || ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (id !== 'new' && !task) return <Page title="Task" back><Empty title="Task not found" text="Return to Tasks to find your next step." /></Page>;
  async function submit(done = task?.done || false) {
    if (!title.trim()) { setError('Give your task a title.'); return; }
    if (!validDate(dueDate)) { setError('Use a real date in YYYY-MM-DD format, or leave it empty.'); return; }
    setBusy(true); setError('');
    const record = { id: task?.id || newId, title: title.trim(), notes: notes.trim(), dueDate, done };
    try {
      if (task) await save(d => ({ ...d, tasks: d.tasks.map(t => t.id === task.id ? record : t) }));
      else {
        await createTaskWithPriorities(record, customPriorities || undefined, session?.user.id);
        // The task team's option generator should run after this atomic save resolves.
        await refresh();
      }
      if (task) router.replace('/tasks'); else router.replace({ pathname: '/task/[id]/priorities', params: { id: record.id } });
    }
    catch (e) { setError((e as { message?: string })?.message || 'Could not save this task. Please try again.'); } finally { setBusy(false); }
  }
  return <Page title={task ? 'Your task' : 'Add a task'} back><Heading>What are you deciding?</Heading><Body>Give this decision a name and describe what you need.</Body>
    <Field label="Decision name *" placeholder="e.g. Choose a coffee supplier" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
    <Field label="Description" placeholder="Your goals, constraints, and anything to consider" multiline value={notes} onChangeText={setNotes} maxLength={2000} editable={!busy} />
    <Field label="Decision deadline (optional)" placeholder="YYYY-MM-DD" value={dueDate} onChangeText={setDueDate} maxLength={10} editable={!busy} />
    {task && <TaskPrioritiesEntry taskId={task.id} />}
    {!task && <Card>
      <Heading>Priorities for this decision</Heading>
      <Body>{customPriorities ? 'Custom priorities · Saved with this task when you add it.' : 'Using universal priorities · Start with your business balance, or adjust it for this decision.'}</Body>
      <Body>{(customPriorities || data.factors).map(f => `${f.name} ${f.weight}%`).join(' · ')}</Body>
      <Button secondary label="Adjust priorities for this task" disabled={busy} onPress={() => setPrioritiesOpen(true)} />
      {customPriorities && <Button secondary label="Use universal priorities" disabled={busy} onPress={() => setCustomPriorities(null)} />}
    </Card>}
    {error ? <Notice error>{error}</Notice> : null}
    <Button label={task ? 'Save changes' : 'Add task'} busy={busy} onPress={() => submit()} />
    {task && <Button secondary label={task.done ? 'Mark as to do' : 'Mark as complete'} disabled={busy} onPress={() => submit(!task.done)} />}
    <Sheet visible={prioritiesOpen} title="Priorities for this task" close={() => setPrioritiesOpen(false)}>
      <Body>Start from your universal balance. These changes apply only to this decision.</Body>
      {prioritiesOpen && <PriorityEditor task title={title.trim() || 'New decision'} factors={customPriorities || data.factors} forceSave saveLabel="Use for this task" savedMessage="Task balance updated."
        onSave={async factors => { setCustomPriorities(factors.map(f => ({ ...f }))); setPrioritiesOpen(false); }} />}
    </Sheet>
  </Page>;
}
