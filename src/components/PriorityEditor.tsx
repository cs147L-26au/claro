import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Body, Button, Card, Field, Heading, Icon, IconButton, Notice, Sheet, s, theme } from './ui';
import { PrioritySliders } from './PrioritySliders';
import { TaskPriorityCard } from './TaskPriorityCard';
import { colors, defaultFactors, Factor, normalize, rebalance, uid, validateFactors } from '../lib/model';
import { suggestPriorities, Suggestion } from '../lib/ai';

export function PriorityEditor({ factors, onSave, task = false, forceSave = false, disabled = false, autoSave = false, onDirtyChange, onBusyChange, saveLabel, savedMessage, title, universalFactors = [] }: {
  factors: Factor[]; onSave: (factors: Factor[]) => Promise<void>; task?: boolean; forceSave?: boolean; disabled?: boolean; autoSave?: boolean;
  onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void;
  saveLabel?: string; savedMessage?: string; title?: string;
  universalFactors?: Factor[];
}) {
  const [draft, setDraft] = useState(factors);
  const previous = useRef(JSON.stringify(factors));
  const recommended = useRef(factors.map(f => ({ ...f })));
  const [acknowledged, setAcknowledged] = useState(JSON.stringify(factors));
  const draftRef = useRef(draft); draftRef.current = draft;
  const acknowledgedRef = useRef(acknowledged); acknowledgedRef.current = acknowledged;
  const saveRef = useRef(onSave); saveRef.current = onSave;
  const writing = useRef(false);
  const mounted = useRef(true);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Factor[]>([]);
  const [editError, setEditError] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [aiOpen, setAiOpen] = useState(false);
  const [context, setContext] = useState('');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const requestId = useRef(0);
  const [saving, setBusy] = useState(false);
  const busy = disabled || (!autoSave && saving);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const before = previous.current;
    const incoming = JSON.stringify(factors);
    if (incoming === before) return;
    if (autoSave) {
      // An invalidation refresh must not replace newer local slider changes.
      if (!writing.current && JSON.stringify(draftRef.current) === acknowledgedRef.current) {
        setDraft(factors); setAcknowledged(incoming);
      }
    } else setDraft(current => JSON.stringify(current) === before ? factors : current);
    previous.current = incoming;
  }, [factors, autoSave]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current++; }; }, []);
  const dirty = JSON.stringify(draft) !== (autoSave ? acknowledged : JSON.stringify(factors));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const pending = saving || (autoSave && dirty && !error);
  useEffect(() => { onBusyChange?.(pending); }, [pending, onBusyChange]);
  useEffect(() => {
    if (!autoSave || !dirty || saving || disabled || error) return;
    // Coalesce slider movement and serialize writes. A newer draft waits until
    // the current save finishes, so an older request can never win afterward.
    const timer = setTimeout(async () => {
      if (writing.current || !mounted.current) return;
      const next = draftRef.current.map(f => ({ ...f }));
      if (!validateFactors(next)) { setError('Keep 2–8 priorities totaling 100%.'); return; }
      writing.current = true; setBusy(true);
      try {
        await saveRef.current(next);
        if (mounted.current) setAcknowledged(JSON.stringify(next));
      } catch (e) {
        if (mounted.current) setError((e as { message?: string })?.message || 'Could not save your priorities. Please retry.');
      } finally {
        writing.current = false;
        if (mounted.current) setBusy(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [autoSave, draft, dirty, saving, disabled, error]);
  function change(id: string, value: number) { setDraft(f => rebalance(f, id, value)); setNotice(''); setError(''); }
  async function update() {
    setBusy(true); setError('');
    try {
      if (!validateFactors(draft)) throw new Error('Keep 2–8 factors and a total of exactly 100 points.');
      await onSave(draft);
      setNotice(savedMessage || (task ? 'Task priorities saved. Ranking is being refreshed.' : 'Universal priorities saved. Task rankings now use these weights where no override exists.'));
    } catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string })?.message || 'Could not save priorities. Please try again.'); }
    finally { setBusy(false); }
  }
  async function ask() {
    const request = ++requestId.current;
    setAiBusy(true); setAiError(''); setSuggestion(null);
    try { const result = await suggestPriorities(context, draft); if (request === requestId.current) setSuggestion(result); }
    catch (e) { if (request === requestId.current) setAiError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { if (request === requestId.current) setAiBusy(false); }
  }
  function closeAi() { requestId.current++; setAiOpen(false); setAiBusy(false); }
  return <>
    {task ? <TaskPriorityCard factors={draft} disabled={busy} title={title || 'Decision'} universalFactors={universalFactors}
      onChange={next => { setDraft(next); setNotice(''); setError(''); }} /> :
      <PrioritySliders factors={draft} disabled={busy} onChange={change} title={title || 'Universal'} />}
    {notice ? <Notice>{notice}</Notice> : null}{error ? <Notice error>{error}</Notice> : null}
    {autoSave ? error && <Button label="Retry saving" busy={saving} onPress={() => setError('')} /> :
      <Button label={saveLabel || (task ? 'Save priorities' : dirty ? 'Update priorities' : 'Priorities up to date')} onPress={update} busy={busy} disabled={(!dirty && !forceSave) || !validateFactors(draft)} />}
    {!task && <Button secondary label="Edit your factors" icon="edit" disabled={busy} onPress={() => { setEditDraft(draft.map(f => ({ ...f }))); setExpandedId(draft[0].id); setEditError(''); setEditing(true); }} />}
    {!task && <Card soft><View style={s.row}><Icon name="sparkles" /><View style={{ flex: 1 }}><Heading>Find your balance</Heading></View></View><Body>Get our suggestions, then make them yours.</Body><Button secondary label="Help me set priorities" icon="sparkles" disabled={busy} onPress={() => { setSuggestion(null); setAiError(''); setAiOpen(true); }} /></Card>}
    <Button secondary label="Reset to recommended" disabled={busy} onPress={() => {
      setDraft((task ? recommended.current : defaultFactors).map(f => ({ ...f })));
      setNotice(''); setError('');
    }} />
    <Sheet visible={editing} title="Your decision factors" close={() => setEditing(false)}>
      <Body>Keep 2–8 factors that reflect how you make decisions. Shares rebalance when you remove a factor.</Body>
      <View style={s.between}><Heading>Your factors</Heading><Text style={s.small}>{editDraft.length} factors · 100%</Text></View>
      {editDraft.map((f, i) => <Card key={f.id}><View style={s.row}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: f.color }} /><View style={{ flex: 1 }}><Text style={s.label}>{f.name || `New factor ${i + 1}`}</Text>{expandedId !== f.id && <Text style={s.small}>{f.description}</Text>}</View><Text style={s.label}>{f.weight}%</Text><IconButton name="edit" label={`Edit ${f.name || 'new factor'}`} onPress={() => setExpandedId(expandedId === f.id ? '' : f.id)} /></View>
        {expandedId === f.id && <>
        <Field label={`Factor ${i + 1} name`} value={f.name} maxLength={40} onChangeText={name => setEditDraft(editDraft.map(x => x.id === f.id ? { ...x, name } : x))} />
        <Field label={`Factor ${i + 1} description`} value={f.description} maxLength={140} onChangeText={description => setEditDraft(editDraft.map(x => x.id === f.id ? { ...x, description } : x))} />
        <Text style={s.label}>Importance · {f.weight}%</Text><Slider accessibilityLabel={`${f.name || 'New factor'} importance`} minimumValue={0} maximumValue={100} step={1} value={f.weight} minimumTrackTintColor={theme.teal} maximumTrackTintColor={theme.soft} thumbTintColor={theme.teal} onValueChange={value => setEditDraft(current => rebalance(current, f.id, value))} style={{ height: 35 }} />
        <Button secondary label="Remove factor" disabled={editDraft.length <= 2} onPress={() => setEditDraft(normalize(editDraft.filter(x => x.id !== f.id)))} />
        </>}
      </Card>)}
      <Button secondary icon="plus" label="Add factor" disabled={editDraft.length >= 8} onPress={() => { const id = uid(); setEditDraft([...editDraft, { id, name: '', description: '', weight: 0, color: colors.find(c => !editDraft.some(f => f.color === c)) || colors[0] }]); setExpandedId(id); }} />
      {editError ? <Notice error>{editError}</Notice> : null}
      <Button label="Use these factors" onPress={() => {
        if (editDraft.some(f => !f.name.trim()) || new Set(editDraft.map(f => f.name.trim().toLowerCase())).size !== editDraft.length) { setEditError('Give each factor a different, non-empty name.'); return; }
        setDraft(normalize(editDraft.map(f => ({ ...f, name: f.name.trim(), description: f.description.trim() })))); setEditing(false); setNotice('');
      }} />
    </Sheet>
    <Sheet visible={aiOpen} title="Let’s find your balance" close={closeAi}>
      <Card soft><Body>What does your business need right now? Mention your goals, constraints, and any tradeoffs you’re willing to make.</Body></Card>
      <Field label="About your business" placeholder="For example: I run a small café. Keeping coffee quality high matters most, but rising costs are squeezing our budget. Deliveries must arrive before we open." multiline maxLength={2000} value={context} editable={!aiBusy} onChangeText={value => { setContext(value); setSuggestion(null); }} />
      <Text style={s.small}>{context.length}/2,000</Text>
      {aiError ? <Notice error>{aiError}</Notice> : null}
      <Button icon="sparkles" label={aiBusy ? 'Thinking through your priorities…' : suggestion ? 'Try another suggestion' : 'Suggest my priorities'} busy={aiBusy} disabled={context.trim().length < 15} onPress={ask} />
      {suggestion && <>
        <View style={{ gap: 8 }}><Heading>A starting point for you</Heading><Body>{suggestion.summary}</Body></View>
        {draft.map(f => { const proposed = suggestion.factors.find(x => x.id === f.id)!; return <Card key={f.id}>
          <View style={s.between}><Text style={s.title}>{f.name}</Text><Text style={[s.title, { color: theme.teal }]}>{f.weight}% → {proposed.weight}%</Text></View><Body>{proposed.reason}</Body>
        </Card>; })}
        <Text style={s.small}>Adjust our suggestions to fit your business.</Text>
        <Button label="Use this suggestion" onPress={() => { setDraft(draft.map(f => ({ ...f, weight: suggestion.factors.find(x => x.id === f.id)!.weight }))); setNotice('Suggestion applied to your draft. Adjust anything, then update priorities to save.'); closeAi(); }} />
      </>}
      <Button secondary label="Keep my priorities" onPress={closeAi} />
    </Sheet>
  </>;
}
