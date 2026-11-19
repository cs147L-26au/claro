import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Empty, Icon, Notice, Page, s, theme } from '../components/ui';
import { useStore } from '../lib/store';
import { useAcceptedTaskPlans } from '../lib/decision-plans';
import { decisionDate, decisionsByDate, decisionSummary } from '../lib/decision-history';
import type { Decision } from '../lib/model';

export default function DecisionsMade() {
  const { data } = useStore();
  const plans = useAcceptedTaskPlans();
  const detailsPending = plans.loading || Boolean(plans.error);
  const decisions = decisionsByDate(data.decisions);
  const groups = new Map<string, Decision[]>();
  decisions.forEach(decision => {
    const date = decisionDate(decision);
    const group = groups.get(date) || [];
    group.push(decision); groups.set(date, group);
  });

  function openDecision(decision: Decision) {
    if (detailsPending) return;
    const plan = plans.data.find(item => item.decisionId === decision.id);
    if (plan) router.push({ pathname: '/task/[id]/decision', params: { id: plan.taskId } });
    else router.push({ pathname: '/decision/[id]', params: { id: decision.id } });
  }

  return <Page title="Decisions made" back onBack={() => router.canGoBack() ? router.back() : router.replace('/tasks')}>
    {decisions.length > 0 && <View style={s.between}>
      <Body>Newest first.</Body>
      {plans.loading && <ActivityIndicator color={theme.teal} accessibilityLabel="Loading decision details" />}
    </View>}
    {plans.error && decisions.length > 0 && <>
      <Notice error>Could not load decision details. Please try again.</Notice>
      <Button secondary label="Try again" onPress={plans.refresh} />
    </>}
    {[...groups].map(([date, group]) => <View key={date} style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[s.small, { color: theme.teal, fontWeight: '600' }]}>{date}</Text>
      <View style={[s.card, { paddingHorizontal: 16, paddingVertical: 0, gap: 0 }]}>
        {group.map((decision, index) => <Pressable key={decision.id} accessibilityRole="button"
          accessibilityLabel={`${decision.title}. ${decisionSummary(decision)}. ${date}`}
          accessibilityHint="Opens the full decision"
          accessibilityState={{ disabled: detailsPending }} disabled={detailsPending}
          onPress={() => openDecision(decision)}
          style={({ pressed }) => [s.between, { minHeight: 56, paddingVertical: 14,
            borderTopWidth: index ? 1 : 0, borderTopColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
          <Text numberOfLines={1} style={[s.label, { flex: 1 }]}>{decisionSummary(decision)}</Text>
          <Icon name="arrow" size={17} />
        </Pressable>)}
      </View>
    </View>)}
    {!decisions.length && <Empty icon="history" title="No decisions yet" text="Your saved choices will appear here." />}
  </Page>;
}
