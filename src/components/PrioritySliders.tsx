import { Pressable, Text, View } from 'react-native';
import type { Factor } from '../lib/model';
import VerticalPrioritySlider from './VerticalPrioritySlider';
import { PriorityChart } from './PriorityChart';
import { Icon, s, theme } from './ui';

export function PrioritySliders({ factors, disabled, onChange, title, showLegend = true, onExplain, onManageFactors }: {
  factors: Factor[]; disabled?: boolean; onChange: (id: string, weight: number) => void; title: string;
  showLegend?: boolean; onExplain?: (factor: Factor) => void;
  onManageFactors?: () => void;
}) {
  const columns = factors.length <= 5 ? factors.length : 4;
  return <View style={[s.card, { paddingHorizontal: 8, gap: 16 }]}>
    <View style={{ alignItems: 'center' }}><PriorityChart factors={factors} large centerLabel={title} showLegend={showLegend} /></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
      {factors.map(f => <View key={f.id} style={{ width: `${100 / columns}%`, alignSelf: 'stretch', alignItems: 'center', gap: 10 }}>
        <Text style={[s.title, { color: theme.teal }]}>{f.weight}%</Text>
        <VerticalPrioritySlider label={`${f.name} priority`} value={f.weight} color={f.color} disabled={disabled} onChange={weight => onChange(f.id, weight)} />
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: f.color }} />
        <Text accessibilityLabel={f.name} style={{ alignSelf: 'stretch', color: theme.ink, fontSize: 11, lineHeight: 15, fontWeight: '600', textAlign: 'center', paddingHorizontal: 2 }}>
          {f.name === 'Sustainability' ? 'Sustain\u00adability' : f.name}
        </Text>
        {onExplain && <Pressable accessibilityRole="button" accessibilityLabel={`Why we suggest ${f.name}`} disabled={disabled}
          onPress={() => onExplain(f)} style={({ pressed }) => ({ marginTop: 'auto', minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}>
          <Text style={[s.small, { color: theme.teal, textDecorationLine: 'underline' }]}>Why?</Text>
        </Pressable>}
      </View>)}
    </View>
    {onManageFactors && <Pressable accessibilityRole="button" accessibilityLabel="Add or edit task factors" disabled={disabled}
      onPress={onManageFactors} style={({ pressed }) => ({ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
        minHeight: 44, paddingHorizontal: 12, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}>
      <Icon name="plus" size={16} /><Text style={[s.label, { color: theme.teal }]}>Add factors</Text>
    </Pressable>}
  </View>;
}
