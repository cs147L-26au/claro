import { Text, View } from 'react-native';
import type { Factor } from '../lib/model';
import VerticalPrioritySlider from './VerticalPrioritySlider';
import { PriorityChart } from './PriorityChart';
import { s, theme } from './ui';

export function PrioritySliders({ factors, disabled, onChange, title }: {
  factors: Factor[]; disabled?: boolean; onChange: (id: string, weight: number) => void; title: string;
}) {
  const columns = factors.length <= 5 ? factors.length : 4;
  return <View style={[s.card, { paddingHorizontal: 8, gap: 16 }]}>
    <View style={{ alignItems: 'center' }}><PriorityChart factors={factors} large centerLabel={title} /></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
      {factors.map(f => <View key={f.id} style={{ width: `${100 / columns}%`, alignItems: 'center', gap: 10 }}>
        <Text style={[s.title, { color: theme.teal }]}>{f.weight}%</Text>
        <VerticalPrioritySlider label={`${f.name} priority`} value={f.weight} color={f.color} disabled={disabled} onChange={weight => onChange(f.id, weight)} />
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: f.color }} />
        <Text accessibilityLabel={f.name} style={{ alignSelf: 'stretch', color: theme.ink, fontSize: 11, lineHeight: 15, fontWeight: '600', textAlign: 'center', paddingHorizontal: 2 }}>
          {f.name === 'Sustainability' ? 'Sustain\u00adability' : f.name}
        </Text>
      </View>)}
    </View>
  </View>;
}
