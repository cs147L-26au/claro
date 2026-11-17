import { useLocalSearchParams } from 'expo-router';
import { DecisionForm } from '../../components/DecisionForm';
import { Empty, Page } from '../../components/ui';
import { useStore } from '../../lib/store';
export default function EditDecision() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useStore(); const decision = data.decisions.find(d => d.id === id);
  return decision ? <DecisionForm decision={decision} /> : <Page title="Decision" back><Empty title="Decision not found" text="Return to your decision set to find a saved choice." /></Page>;
}
