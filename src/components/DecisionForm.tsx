import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Chip, Field, Heading, Notice, Page, s } from './ui';
import { Decision, uid, validDate } from '../lib/model';
import { useStore } from '../lib/store';

export function DecisionForm({ decision, initialTitle = '', initialChoice = '', initialNotes = '', initialAlternatives = '' }: { decision?: Decision; initialTitle?: string; initialChoice?: string; initialNotes?: string; initialAlternatives?: string }) {
  const { data, save } = useStore();
  const [title, setTitle] = useState(decision?.title || initialTitle);
  const [choice, setChoice] = useState(decision?.choice || initialChoice);
  const [notes, setNotes] = useState(decision?.notes || initialNotes);
  const [category, setCategory] = useState(decision?.category || 'Business');
  const [alternatives, setAlternatives] = useState(decision?.alternatives.join('\n') || initialAlternatives);
  const [reviewDate, setReviewDate] = useState(decision?.reviewDate || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!title.trim() || !choice.trim()) { setError('Add a decision title and what you chose.'); return; }
    if (!validDate(reviewDate)) { setError('Use a real review date in YYYY-MM-DD format, or leave it empty.'); return; }
    setBusy(true); setError('');
    const now = new Date().toISOString();
    const record: Decision = { id: decision?.id || uid(), title: title.trim(), choice: choice.trim(), notes: notes.trim(), category,
      alternatives: alternatives.split('\n').map(a => a.trim()).filter(Boolean), reviewDate, status: decision?.status || 'active',
      createdAt: decision?.createdAt || now, updatedAt: now, priorities: decision?.priorities || data.factors.map(f => ({ ...f })) };
    try {
      await save(d => ({ ...d, decisions: decision ? d.decisions.map(v => v.id === decision.id ? record : v) : [record, ...d.decisions] }));
      if (decision) router.back(); else router.replace({ pathname: '/decision/[id]', params: { id: record.id, saved: '1' } });
    } catch { setError('Could not save your decision. Your draft is still here; please try again.'); }
    finally { setBusy(false); }
  }
  return <Page title={decision ? 'Edit decision' : 'Store a decision'} back>
    <View style={{ gap: 6 }}><Heading>Remember the choice. Keep the why.</Heading><Body>A few details now make it easier to reflect later.</Body></View>
    <Field label="Decision title *" placeholder="e.g. Choose our coffee supplier" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} />
    <View style={{ gap: 10 }}><Text style={s.label}>Category</Text><View style={s.wrap}>{['Business', 'Suppliers', 'Budget', 'Team', 'Other'].map(c => <Chip key={c} label={c} selected={c === category} onPress={() => !busy && setCategory(c)} />)}</View></View>
    <Field label="What did you choose? *" placeholder="The option you’re moving forward with" value={choice} onChangeText={setChoice} maxLength={300} editable={!busy} />
    <Field label="Why this choice?" placeholder="What mattered most? What tradeoffs did you make?" multiline value={notes} onChangeText={setNotes} maxLength={3000} editable={!busy} />
    <Field label="Other options you considered" placeholder="One option per line (optional)" multiline value={alternatives} onChangeText={setAlternatives} maxLength={1500} editable={!busy} />
    <Field label="Review date (optional)" placeholder="YYYY-MM-DD" value={reviewDate} onChangeText={setReviewDate} maxLength={10} autoCapitalize="none" editable={!busy} />
    <Body>The review date appears on your Home screen. No push notification is scheduled.</Body>
    <Notice>{decision ? 'The original priority snapshot will be preserved.' : 'Your current priorities will be saved with this decision, so you can see what mattered at the time.'}</Notice>
    {error ? <Notice error>{error}</Notice> : null}
    <Button label={decision ? 'Save changes' : 'Save decision'} icon="check" busy={busy} onPress={submit} />
  </Page>;
}
