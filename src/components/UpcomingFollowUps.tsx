import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { usePostDecisionTasks } from '../lib/followups';
import { dateLabel } from '../lib/model';
import { Body, Card, Heading, Notice, s } from './ui';

export function UpcomingFollowUps() {
  const followups = usePostDecisionTasks();
  const open = followups.data.filter(row => !row.done).slice(0, 3);
  return <>
    <Heading>Post-decision tasks</Heading>
    {followups.error ? <Notice error>{followups.error}</Notice> : null}
    {open.map(row => <Pressable key={row.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/calendar', params: { date: row.due_date } })}>
      <Card><Text style={s.title}>{row.title}</Text><Body>{dateLabel(row.due_date)}</Body></Card>
    </Pressable>)}
    {!followups.loading && !followups.error && !open.length ? <Body>No pending follow-ups.</Body> : null}
  </>;
}
