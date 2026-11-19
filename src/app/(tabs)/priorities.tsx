import { ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Heading, IconButton, Notice, Page, theme } from '../../components/ui';
import { PriorityEditor } from '../../components/PriorityEditor';
import { useUniversalPriorities } from '../../lib/priorities/hooks';

export default function Priorities() {
  const priorities = useUniversalPriorities();
  return <Page title="Priorities" action={<IconButton name="history" label="Saved task priorities" onPress={() => router.push('/saved-priorities')} />}>
    <Heading>Universal Priorities</Heading>
    <Body>Applies to all decisions.</Body>
    {priorities.error ? <><Notice error>{priorities.error}</Notice><Button secondary label="Try again" onPress={priorities.refresh} /></> : null}
    {!priorities.priorities && priorities.loading ? <ActivityIndicator accessibilityLabel="Loading priorities" color={theme.teal} /> : null}
    {priorities.priorities && <PriorityEditor factors={priorities.priorities} onSave={priorities.save} />}
  </Page>;
}
