import { useLocalSearchParams } from 'expo-router';
import { DecisionForm } from '../../components/DecisionForm';
export default function NewDecision() {
  const params = useLocalSearchParams<{ title?: string; choice?: string; notes?: string; alternatives?: string }>();
  return <DecisionForm initialTitle={typeof params.title === 'string' ? params.title : ''} initialChoice={typeof params.choice === 'string' ? params.choice : ''} initialNotes={typeof params.notes === 'string' ? params.notes : ''} initialAlternatives={typeof params.alternatives === 'string' ? params.alternatives : ''} />;
}
