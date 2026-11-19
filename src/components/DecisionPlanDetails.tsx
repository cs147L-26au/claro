import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import type { Factor } from '../lib/model';
import { dateLabel } from '../lib/model';
import { addPlanDays } from '../lib/decision-plan';
import type { PlanResource, ReadyDecisionPlan } from '../lib/decision-plan';
import { Body, Button, Card, Heading, Icon, Notice, Sheet, s, theme } from './ui';

export function PlanResources({ resources }: { resources: PlanResource[] }) {
  const [error, setError] = useState('');
  return <View style={{ gap: 10 }}>
    {resources.map((resource, index) => {
      const address = resource.kind === 'link' ? resource.value : resource.kind === 'email'
        ? `mailto:${encodeURIComponent(resource.value)}` : resource.kind === 'phone' ? `tel:${resource.value.replace(/[^+\d]/g, '')}` : null;
      return <View key={`${index}-${resource.label}`} style={{ gap: 3 }}>
        <Text style={s.small}>{resource.label}</Text>
        {address ? <Pressable accessibilityRole="link" accessibilityLabel={`${resource.label}: ${resource.value}`}
          onPress={() => { setError(''); void Linking.openURL(address).catch(() => setError('Could not open this contact. Please try again.')); }} style={{ minHeight: 36, justifyContent: 'center' }}>
          <Text selectable style={[s.label, { color: theme.teal, textDecorationLine: 'underline' }]}>{resource.kind === 'link' ? 'Open link' : resource.value}</Text>
        </Pressable> : <Text selectable style={s.body}>{resource.value}</Text>}
      </View>;
    })}
    {error ? <Notice error>{error}</Notice> : null}
  </View>;
}

export function DecisionPlanDetails({ plan, startDate, priorities }: {
  plan: ReadyDecisionPlan; startDate: string; priorities: Factor[];
}) {
  const [expanded, setExpanded] = useState<string[]>(['1-0']);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [error, setError] = useState('');
  const rec = plan.recommendation;
  const open = (url: string) => { setError(''); void Linking.openURL(url).catch(() => setError('Could not open this link. Please try again.')); };
  return <>
    <Card soft>
      <Text style={[s.label, { color: theme.teal }]}>Our recommendation</Text>
      <Heading>{rec.headline}</Heading>
      <Body>{rec.reason}</Body>
      <Button secondary label="Learn more" icon="arrow" onPress={() => open(rec.website)} />
      <PlanResources resources={rec.contacts} />
      <Pressable accessibilityRole="button" onPress={() => setSpecsOpen(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={[s.label, { color: theme.teal, textDecorationLine: 'underline' }]}>Details & sources</Text>
      </Pressable>
    </Card>
    {error ? <Notice error>{error}</Notice> : null}
    <View style={{ gap: 4 }}><Heading>Your {plan.durationDays}-day plan</Heading><Body>{plan.scheduleReason}</Body></View>
    {plan.days.map(day => <View key={day.day} style={{ gap: 10 }}>
      <Text style={[s.label, { color: theme.teal }]}>Day {day.day} · {dateLabel(addPlanDays(startDate, day.day - 1))}</Text>
      {day.actions.map((action, index) => {
        const key = `${day.day}-${index}`;
        const isOpen = expanded.includes(key);
        return <Card key={key}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }}
            onPress={() => setExpanded(current => isOpen ? current.filter(item => item !== key) : [...current, key])} style={[s.between, { minHeight: 44 }]}>
            <Text style={[s.title, { flex: 1 }]}>{action.title}</Text><Icon name={isOpen ? 'close' : 'plus'} size={17} />
          </Pressable>
          {isOpen && <><Body>{action.details}</Body><PlanResources resources={action.resources} /></>}
        </Card>;
      })}
    </View>)}
    <Sheet visible={specsOpen} title={rec.name} close={() => setSpecsOpen(false)}>
      {rec.specs.map((spec, index) => <View key={index} style={{ gap: 4 }}>
        <Text style={s.label}>{spec.label}</Text><Body>{spec.value}</Body>
        <Pressable accessibilityRole="link" onPress={() => open(spec.sourceUrl)} style={{ minHeight: 36, justifyContent: 'center' }}><Text style={[s.small, { color: theme.teal, textDecorationLine: 'underline' }]}>Source</Text></Pressable>
      </View>)}
      <Heading>Main trade-off</Heading><Body>{rec.tradeoff}</Body>
      {plan.assumptions.length > 0 && <><Heading>Before you commit</Heading>{plan.assumptions.map((item, index) => <Body key={index}>{item}</Body>)}</>}
      <Heading>Your priorities</Heading>
      {priorities.map(factor => <View key={factor.id} style={s.between}><Text style={[s.label, { flex: 1 }]}>{factor.name}</Text><Text style={s.label}>{factor.weight}%</Text></View>)}
      <Heading>Sources</Heading>
      {plan.sources.map(source => <Pressable key={source.url} accessibilityRole="link" onPress={() => open(source.url)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={[s.body, { color: theme.teal, textDecorationLine: 'underline' }]}>{source.title}</Text>
      </Pressable>)}
      {error ? <Notice error>{error}</Notice> : null}
    </Sheet>
  </>;
}
