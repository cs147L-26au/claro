import { Text, View } from 'react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { Factor } from '../lib/model';
import { s, theme } from './ui';

const shortFactorNames: Record<string, string> = {
  cost: 'Cost', quality: 'Quality', delivery: 'Deliv.', reliability: 'Rel.', sustainability: 'Sust.',
};

function shortFactorName(name: string) {
  const trimmed = name.trim();
  return shortFactorNames[trimmed.toLowerCase()] ?? (trimmed.length > 7 ? `${trimmed.slice(0, 6)}…` : trimmed);
}

export function PriorityChart({ factors, compact = false, chartOnly = false, centerLabel, segmentLabels = false, large = false, showLegend = true }: {
  factors: Factor[]; compact?: boolean; chartOnly?: boolean; centerLabel?: string; segmentLabels?: boolean; large?: boolean; showLegend?: boolean;
}) {
  let offset = 0;
  const size = large ? 240 : compact ? 128 : 218;
  const circumference = 2 * Math.PI * 80;
  const segments = factors.map(factor => {
    const start = offset; offset += factor.weight;
    return { ...factor, start, middle: (start + factor.weight / 2) * 3.6 - 90 };
  }).filter(factor => factor.weight > 0);
  return <View style={{ flexDirection: compact && !chartOnly ? 'row' : 'column', alignItems: 'center', gap: chartOnly ? 0 : 14, ...(chartOnly ? { width: '100%' as const } : {}) }} accessibilityLabel={factors.map(f => `${f.name} ${f.weight}%`).join(', ')}>
    <View style={chartOnly ? { width: '100%', maxWidth: 200, aspectRatio: 1 } : { width: size, height: size, flexShrink: 0 }}>
      <Svg width="100%" height="100%" viewBox="0 0 218 218">
        {segments.map(f => <Circle key={f.id} cx={109} cy={109} r={80} fill="none" stroke={f.color} strokeWidth={segmentLabels ? 48 : 35}
          strokeDasharray={`${f.weight / 100 * circumference} ${circumference}`} strokeDashoffset={-f.start / 100 * circumference} rotation={-90} origin="109,109" />)}
        {segmentLabels && segments.map(f => {
          const angle = f.middle * Math.PI / 180;
          const x = 109 + 80 * Math.cos(angle);
          const y = 109 + 80 * Math.sin(angle);
          return <G key={`label-${f.id}`}>
            <SvgText x={x} y={y - 3} fill={theme.ink} fontSize={13} fontWeight="600" textAnchor="middle">
              {shortFactorName(f.name)}
            </SvgText>
            <SvgText x={x} y={y + 13} fill={theme.ink} fontSize={14} fontWeight="700" textAnchor="middle">
              {f.weight}%
            </SvgText>
          </G>;
        })}
      </Svg>
      {centerLabel ? <View pointerEvents="none" style={{ position: 'absolute', left: segmentLabels ? '29%' : '24%', right: segmentLabels ? '29%' : '24%', top: '29%', bottom: '29%', alignItems: 'center', justifyContent: 'center' }}>
        <Text numberOfLines={3} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.8}
          style={[s.label, { fontSize: large ? 23 : 18, lineHeight: large ? 28 : 22, textAlign: 'center' }]}>{centerLabel}</Text>
      </View> : null}
    </View>
    {!chartOnly && showLegend && <View style={compact ? { flex: 1, gap: 4 } : [s.wrap, { justifyContent: 'center', columnGap: 16 }]}>{factors.map(f => <View key={f.id} style={[s.row, { gap: 5 }]}><View style={{ width: 8, height: 8, backgroundColor: f.color, borderRadius: 4 }} /><Text style={[s.small, compact && { flex: 1 }]}>{f.name} {f.weight}%</Text></View>)}</View>}
  </View>;
}
