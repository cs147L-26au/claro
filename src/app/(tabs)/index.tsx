import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Heading, Icon, IconButton, Page, s, theme } from '../../components/ui';
import { useStore } from '../../lib/store';
import { today } from '../../lib/model';
import { UpcomingFollowUps } from '../../components/UpcomingFollowUps';

export default function Home() {
  const { data } = useStore();
  const open = data.tasks.filter(t => !t.done);
  const upcoming = data.decisions.filter(d => d.status === 'active' && d.reviewDate).sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
  const due = upcoming.filter(d => d.reviewDate <= today()).length + open.filter(t => t.dueDate && t.dueDate <= today()).length;
  return <Page title="Claro" action={<IconButton name="account" label="Account" onPress={() => router.push('/account')} />}>
    <Card soft><View style={[s.row, { alignItems: 'flex-start' }]}><View style={{ backgroundColor: theme.teal, padding: 10, borderRadius: 24 }}><Icon name="check" color="white" /></View><View style={{ flex: 1, gap: 6 }}><Heading>{due ? `${due} ${due === 1 ? 'thing needs' : 'things need'} a little attention` : 'All good for now'}</Heading><Body>{due ? 'A small step today can make tomorrow easier.' : 'Nothing needs your attention today.'}</Body></View></View></Card>
    <View style={[s.between, { marginTop: 8 }]}><Heading>Upcoming decisions</Heading><Text style={s.small}>{new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</Text></View>
    <Card>{upcoming.length ? upcoming.slice(0, 3).map((d, index) => <View key={d.id} style={{ gap: 16 }}>
      {index > 0 && <View style={s.divider} />}<Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/decision/[id]', params: { id: d.id } })} style={s.row}>
        <View style={{ backgroundColor: theme.soft, borderRadius: 14, padding: 10, minWidth: 52, alignItems: 'center' }}><Text style={s.small}>{new Date(`${d.reviewDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</Text><Text style={[s.heading, { fontSize: 24 }]}>{d.reviewDate.slice(8)}</Text></View>
        <View style={{ flex: 1, gap: 4 }}><Text style={s.title}>{d.title}</Text><Body>{d.reviewDate <= today() ? 'Ready for your review' : d.choice}</Body></View><Icon name="arrow" size={18} />
      </Pressable></View>) : <><Text style={s.title}>A little space to think ahead.</Text><Body>Add a review date when you save a decision. It will appear here when you need it.</Body></>}</Card>
    <Pressable accessibilityRole="button" onPress={() => router.push('/decisions')}><Card soft><View style={s.row}><Icon name="layers" size={27} /><View style={{ flex: 1, gap: 4 }}><Text style={[s.title, { color: theme.teal }]}>Decision set</Text><Body>Review and talk through decisions</Body></View><Icon name="arrow" /></View></Card></Pressable>
    <View style={{ gap: 10, marginTop: 8 }}><Heading>{open.length ? 'One thing at a time.' : 'A next step, when you’re ready.'}</Heading><Body>{open.length ? `${open.length} ${open.length === 1 ? 'task is' : 'tasks are'} waiting. Choose a small place to start.` : 'Add your first task. We’ll take it from there.'}</Body>
      {open.slice(0, 2).map(t => <Pressable key={t.id} onPress={() => router.push({ pathname: '/task/[id]', params: { id: t.id } })} accessibilityRole="button"><Card><View style={s.between}><Text style={[s.title, { flex: 1 }]}>{t.title}</Text><Icon name="arrow" size={18} /></View></Card></Pressable>)}
      <Button icon="plus" label="Add task" onPress={() => router.push('/task/new')} /></View>
    <UpcomingFollowUps />
    <Pressable accessibilityRole="button" onPress={() => router.push('/priorities')} style={[s.row, { justifyContent: 'center', padding: 8 }]}><Icon name="priorities" size={18} /><Text style={[s.label, { color: theme.teal }]}>Make room for what matters</Text></Pressable>
  </Page>;
}
