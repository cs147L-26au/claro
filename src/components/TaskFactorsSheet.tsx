import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Field, Icon, Notice, Sheet, s, theme } from './ui';
import type { Factor } from '../lib/model';
import { addCustomTaskFactor, addTaskFactor, editTaskFactor, hasTaskFactor, parseFactorWeight, removeTaskFactor } from '../lib/task-factors';

type FactorView = 'list' | 'add' | 'edit' | 'universal';

export function TaskFactorsSheet({ visible, close, factors, universalFactors, onChange, disabled = false }: {
  visible: boolean; close: () => void; factors: Factor[]; universalFactors: Factor[];
  onChange: (factors: Factor[]) => void; disabled?: boolean;
}) {
  const [view, setView] = useState<FactorView>('list');
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [percentage, setPercentage] = useState('10');
  const [error, setError] = useState('');
  const current = useRef(factors); current.current = factors;
  useEffect(() => {
    if (visible) { setView('list'); setError(''); }
  }, [visible]);

  function show(next: FactorView) { setError(''); setView(next); }
  function change(update: (factors: Factor[]) => Factor[], returnToList = true) {
    if (disabled) return;
    try {
      const next = update(current.current);
      current.current = next;
      onChange(next);
      setError('');
      if (returnToList) setView('list');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update this factor.'); }
  }
  function edit(factor: Factor) {
    if (disabled) return;
    setEditingId(factor.id); setName(factor.name); setPercentage(String(factor.weight)); show('edit');
  }
  const title = view === 'universal' ? 'Universal priorities' : view === 'add' ? 'Add factor' : view === 'edit' ? 'Edit factor' : 'Factors';

  return <Sheet visible={visible} title={title} close={() => { setView('list'); setError(''); close(); }}>
    {view !== 'list' && <Pressable accessibilityRole="button" accessibilityLabel="Back to factors" onPress={() => show('list')}
      style={({ pressed }) => [s.row, { alignSelf: 'flex-start', minHeight: 44, opacity: pressed ? 0.6 : 1 }]}>
      <Icon name="back" size={18} /><Text style={[s.label, { color: theme.teal }]}>Factors</Text>
    </Pressable>}
    {view === 'list' && <>
      <View style={{ gap: 0 }}>
        {factors.map((factor, index) => <Pressable key={factor.id} accessibilityRole="button"
          accessibilityLabel={`Edit ${factor.name}, ${factor.weight}%`} accessibilityState={{ disabled }} disabled={disabled}
          onPress={() => edit(factor)} style={({ pressed }) => [s.between, {
            minHeight: 58, paddingVertical: 12, borderBottomWidth: index < factors.length - 1 ? 1 : 0,
            borderBottomColor: theme.border, opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
          }]}>
          <Text style={[s.title, { flex: 1 }]}>{factor.name}</Text><Text style={[s.label, { color: theme.teal }]}>{factor.weight}%</Text>
        </Pressable>)}
      </View>
      <Button label="Add factor" icon="plus" disabled={disabled || factors.length >= 8} onPress={() => {
        setName(''); setPercentage('10'); show('add');
      }} />
      <Button secondary label="Add from universal priorities" disabled={disabled || factors.length >= 8} onPress={() => show('universal')} />
      {factors.length >= 8 && <Text style={s.small}>8 factors maximum.</Text>}
    </>}
    {(view === 'add' || view === 'edit') && <>
      <Field label="Name" value={name} maxLength={40} editable={!disabled} autoFocus
        placeholder="e.g. Flexibility" onChangeText={value => { setName(value); setError(''); }} />
      <Field label="Percentage" value={percentage} maxLength={3} keyboardType="number-pad" editable={!disabled}
        onChangeText={value => { setPercentage(value); setError(''); }} />
      {error ? <Notice error>{error}</Notice> : null}
      <Button label={view === 'add' ? 'Add' : 'Save'} disabled={disabled} onPress={() => change(list => view === 'add'
        ? addCustomTaskFactor(list, name, parseFactorWeight(percentage))
        : editTaskFactor(list, editingId, name, parseFactorWeight(percentage)))} />
      {view === 'edit' && <Button secondary label="Remove factor" disabled={disabled || factors.length <= 2}
        onPress={() => change(list => removeTaskFactor(list, editingId))} />}
    </>}
    {view === 'universal' && <>
      <View style={{ gap: 0 }}>
        {universalFactors.map((factor, index) => {
          const added = hasTaskFactor(factors, factor);
          const unavailable = disabled || added || factors.length >= 8;
          return <View key={factor.id} style={[s.between, {
            minHeight: 64, paddingVertical: 10, borderBottomWidth: index < universalFactors.length - 1 ? 1 : 0, borderBottomColor: theme.border,
          }]}>
            <Text style={[s.title, { flex: 1 }]}>{factor.name}</Text>
            <Text style={s.small}>{factor.weight}%</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={added ? `${factor.name} added` : `Add ${factor.name}`}
              accessibilityState={{ disabled: unavailable }} disabled={unavailable}
              onPress={() => change(list => addTaskFactor(list, factor), false)}
              style={({ pressed }) => ({ minWidth: 54, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: unavailable ? 0.45 : pressed ? 0.6 : 1 })}>
              <Text style={[s.label, { color: theme.teal }]}>{added ? 'Added' : 'Add'}</Text>
            </Pressable>
          </View>;
        })}
      </View>
      {error ? <Notice error>{error}</Notice> : null}
      {!universalFactors.length && <Text style={s.body}>No universal priorities saved.</Text>}
      {factors.length >= 8 && <Text style={s.small}>8 factors maximum.</Text>}
    </>}
  </Sheet>;
}
