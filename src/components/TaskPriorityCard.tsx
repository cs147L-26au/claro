import { useState } from 'react';
import { Text } from 'react-native';
import type { Factor } from '../lib/model';
import { rebalance } from '../lib/model';
import { Body, Sheet, s, theme } from './ui';
import { PrioritySliders } from './PrioritySliders';
import { TaskFactorsSheet } from './TaskFactorsSheet';

/** The same task balance and factor controls are used before and after saving. */
export function TaskPriorityCard({ title, factors, universalFactors, suggestions = [], disabled, onChange }: {
  title: string; factors: Factor[]; universalFactors: Factor[];
  suggestions?: (Factor & { reason: string })[]; disabled?: boolean; onChange: (factors: Factor[]) => void;
}) {
  const [factorsOpen, setFactorsOpen] = useState(false);
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const factor = factors.find(item => item.id === explainingId);
  const suggested = suggestions.find(item => item.id === explainingId);
  const universal = universalFactors.find(item => item.id === explainingId);
  return <>
    <PrioritySliders factors={factors} title={title} disabled={disabled} showLegend={false}
      onChange={(id, weight) => onChange(rebalance(factors, id, weight))}
      onExplain={item => setExplainingId(item.id)} onManageFactors={() => setFactorsOpen(true)} />
    <TaskFactorsSheet visible={factorsOpen} close={() => setFactorsOpen(false)} factors={factors}
      universalFactors={universalFactors} onChange={onChange} disabled={disabled} />
    <Sheet visible={Boolean(factor)} title={factor?.name || 'Your priority'} close={() => setExplainingId(null)}>
      {factor && <>
        {suggested && <Text style={[s.label, { color: theme.teal }]}>Our suggestion · {suggested.weight}%</Text>}
        {factor.description ? <Body>{factor.description}</Body> : null}
        <Body>{suggested?.reason || (universal ? 'Added from your universal priorities.' : 'A factor you chose for this decision.')}</Body>
      </>}
    </Sheet>
  </>;
}
