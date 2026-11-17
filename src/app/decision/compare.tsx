import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Field, Heading, Notice, Page, s, theme } from '../../components/ui';
import { useStore } from '../../lib/store';

export default function Compare() {
  const { data } = useStore();
  const factors = data.factors;
  const [title, setTitle] = useState(''); const [a, setA] = useState(''); const [b, setB] = useState('');
  const [scores, setScores] = useState<Record<string, [number, number]>>({});
  const [error, setError] = useState(''); const [show, setShow] = useState(false);
  const total = (side: number) => factors.reduce((sum, f) => sum + (scores[f.id]?.[side] || 0) / 5 * f.weight, 0);
  const result = [total(0), total(1)];
  function compare() {
    if (!title.trim() || !a.trim() || !b.trim()) { setError('Add a decision title and two options.'); return; }
    if (a.trim().toLowerCase() === b.trim().toLowerCase()) { setError('Give your two options different names.'); return; }
    if (factors.some(f => !scores[f.id]?.[0] || !scores[f.id]?.[1])) { setError('Rate both options for every factor to see your comparison.'); return; }
    setError(''); setShow(true);
  }
  return <Page title="Compare options" back><Heading>Put your priorities into perspective.</Heading><Body>Rate how well each option meets your needs. A higher rating means a better fit, including better value for Cost.</Body>
    <Field label="What are you deciding?" value={title} onChangeText={v => { setTitle(v); setShow(false); }} placeholder="e.g. Choose a supplier" maxLength={120} />
    <Field label="Option A" value={a} onChangeText={v => { setA(v); setShow(false); }} placeholder="First option" maxLength={120} />
    <Field label="Option B" value={b} onChangeText={v => { setB(v); setShow(false); }} placeholder="Second option" maxLength={120} />
    <Text style={s.small}>1 = poor fit · 5 = great fit · Uses your saved priorities</Text>
    {factors.map(f => <Card key={f.id}><View style={s.between}><Text style={s.title}>{f.name}</Text><Text style={s.label}>{f.weight}%</Text></View>
      {[a || 'Option A', b || 'Option B'].map((label, side) => <View key={side} style={{ gap: 6 }}><Text style={s.body}>{label}</Text><View style={s.row}>{[1, 2, 3, 4, 5].map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${label}, ${f.name}, ${value} out of 5`} accessibilityState={{ selected: scores[f.id]?.[side] === value }} onPress={() => {
        setScores(current => { const pair: [number, number] = [...(current[f.id] || [0, 0])]; pair[side] = value; return { ...current, [f.id]: pair }; }); setShow(false);
      }} style={{ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: scores[f.id]?.[side] === value ? theme.teal : theme.soft }}><Text style={{ color: scores[f.id]?.[side] === value ? 'white' : theme.teal }}>{value}</Text></Pressable>)}</View></View>)}
    </Card>)}
    {error ? <Notice error>{error}</Notice> : null}<Button label="Compare my options" onPress={compare} />
    {show && <><Card soft><Heading>{result[0] === result[1] ? 'A close call — both options tie.' : `${result[0] > result[1] ? a : b} fits your ratings best.`}</Heading>
      <Body>{a}: {result[0].toFixed(1)}/100{ '\n' }{b}: {result[1].toFixed(1)}/100</Body><Body>These scores come from your ratings and saved weights. They are a reflection tool, not an AI recommendation. The choice is yours.</Body></Card>
      {[a, b].map((option, i) => <Button key={i} secondary={result[i] < result[1-i]} label={`Choose ${option}`} onPress={() => router.push({ pathname: '/decision/new', params: {
        title, choice: option, alternatives: [a, b][1-i],
        notes: `I compared ${a} (${result[0].toFixed(1)}/100) with ${b} (${result[1].toFixed(1)}/100) using my own ratings.\n\n${factors.map(f => `${f.name} (${f.weight}%): ${a} ${scores[f.id][0]}/5; ${b} ${scores[f.id][1]}/5.`).join('\n')}`,
      } })} />)}</>}
  </Page>;
}
