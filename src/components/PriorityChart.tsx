import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Factor } from '../lib/model';
import { s, theme } from './ui';

export function PriorityChart({ factors }: { factors: Factor[] }) {
  let offset = 0;
  const circumference = 2 * Math.PI * 80;
  return <View style={{ alignItems: 'center', gap: 14 }} accessibilityLabel={factors.map(f => `${f.name} ${f.weight}%`).join(', ')}>
    <View style={{ width: 218, height: 218, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={218} height={218} viewBox="0 0 218 218" style={{ position: 'absolute' }}>
        {factors.map(f => {
          const start = offset; offset += f.weight;
          return f.weight > 0 ? <Circle key={f.id} cx={109} cy={109} r={80} fill="none" stroke={f.color} strokeWidth={35}
            strokeDasharray={`${f.weight / 100 * circumference} ${circumference}`} strokeDashoffset={-start / 100 * circumference} rotation={-90} origin="109,109" /> : null;
        })}
      </Svg>
      <Text style={{ fontSize: 34, color: theme.teal, fontWeight: '600', letterSpacing: -1 }}>100%</Text>
      <Text style={[s.small, { textAlign: 'center' }]}>total share</Text>
    </View>
    <View style={[s.wrap, { justifyContent: 'center', columnGap: 16 }]}>{factors.map(f => <View key={f.id} style={[s.row, { gap: 5 }]}><View style={{ width: 8, height: 8, backgroundColor: f.color, borderRadius: 4 }} /><Text style={s.small}>{f.name} {f.weight}%</Text></View>)}</View>
  </View>;
}
