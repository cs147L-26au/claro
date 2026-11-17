import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Body, Button, Card, Field, Heading, Icon, IconButton, Notice, Page, Sheet, s, theme } from '../../components/ui';
import { PriorityChart } from '../../components/PriorityChart';
import { colors, Factor, normalize, rebalance, uid } from '../../lib/model';
import { useStore } from '../../lib/store';
import { suggestPriorities, Suggestion } from '../../lib/ai';

export default function Priorities() {
  const { data, save } = useStore();
  const [draft, setDraft] = useState(data.factors);
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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setDraft(data.factors); }, [data.factors]);
  useEffect(() => () => { requestId.current++; }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.factors);
  function change(id: string, value: number) { setDraft(f => rebalance(f, id, value)); setNotice(''); setError(''); }
  async function update() {
    setBusy(true); setError('');
    try { await save(d => ({ ...d, factors: draft })); setNotice('Priorities updated. Your saved decisions keep their original priorities.'); }
    catch { setError('Could not save priorities. Please try again.'); }
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
  return <Page title="Priorities">
    <View style={{ gap: 6 }}><Heading>Your business, your priorities.</Heading><Body>Slide to set what matters most. Your shares rebalance automatically.</Body></View>
    <PriorityChart factors={draft} />
    <Card>{draft.map((f, i) => <View key={f.id} style={{ gap: 8 }}>
      {i > 0 && <View style={s.divider} />}
      <View style={s.row}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: f.color }} /><View style={{ flex: 1, gap: 2 }}><Text style={s.title}>{f.name}</Text><Text style={s.small}>{f.description}</Text></View><Text style={[s.title, { color: theme.teal }]}>{f.weight}%</Text></View>
      <Slider accessibilityLabel={`${f.name} priority`} accessibilityValue={{ min: 0, max: 100, now: f.weight, text: `${f.weight} percent` }}
        minimumValue={0} maximumValue={100} step={1} value={f.weight} onValueChange={value => change(f.id, value)}
        minimumTrackTintColor={f.color} maximumTrackTintColor={theme.soft} thumbTintColor={theme.teal} disabled={busy} style={{ height: 35, width: '100%' }} />
    </View>)}</Card>
    <Button secondary label="Edit your factors" icon="edit" disabled={busy} onPress={() => { setEditDraft(draft.map(f => ({ ...f }))); setExpandedId(draft[0].id); setEditError(''); setEditing(true); }} />
    <Card soft><View style={s.row}><Icon name="sparkles" /><View style={{ flex: 1 }}><Heading>A little help finding balance</Heading></View></View><Body>Tell Claro what matters to your business. Get an AI suggestion, then make it your own.</Body><Button secondary label="Help me set priorities" icon="sparkles" disabled={busy} onPress={() => { setSuggestion(null); setAiError(''); setAiOpen(true); }} /></Card>
    {notice ? <Notice>{notice}</Notice> : null}{error ? <Notice error>{error}</Notice> : null}
    <Button label={dirty ? 'Update priorities' : 'Priorities up to date'} onPress={update} busy={busy} disabled={!dirty} />
    {dirty && <Button secondary label="Discard changes" disabled={busy} onPress={() => { setDraft(data.factors); setNotice(''); setError(''); }} />}
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
      <Text style={s.small}>{context.length}/2,000 · Only this description and your current factors are sent to Groq when you ask. Saved decisions stay on your device.</Text>
      {aiError ? <Notice error>{aiError}</Notice> : null}
      <Button icon="sparkles" label={aiBusy ? 'Thinking through your priorities…' : suggestion ? 'Try another suggestion' : 'Suggest my priorities'} busy={aiBusy} disabled={context.trim().length < 15} onPress={ask} />
      {suggestion && <>
        <View style={{ gap: 8 }}><Heading>A starting point for you</Heading><Body>{suggestion.summary}</Body></View>
        {draft.map(f => { const proposed = suggestion.factors.find(x => x.id === f.id)!; return <Card key={f.id}>
          <View style={s.between}><Text style={s.title}>{f.name}</Text><Text style={[s.title, { color: theme.teal }]}>{f.weight}% → {proposed.weight}%</Text></View><Body>{proposed.reason}</Body>
        </Card>; })}
        <Text style={s.small}>AI suggestions can miss context. Review the tradeoffs and adjust any share before saving.</Text>
        <Button label="Use this suggestion" onPress={() => { setDraft(draft.map(f => ({ ...f, weight: suggestion.factors.find(x => x.id === f.id)!.weight }))); setNotice('Suggestion applied to your draft. Adjust anything, then update priorities to save.'); closeAi(); }} />
      </>}
      <Button secondary label="Keep my priorities" onPress={closeAi} />
    </Sheet>
  </Page>;
}
