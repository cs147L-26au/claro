import { Tabs } from 'expo-router';
import { Icon, IconName, theme } from '../../components/ui';

export default function TabLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.teal, tabBarInactiveTintColor: theme.muted,
    tabBarStyle: { backgroundColor: theme.bg, borderTopColor: theme.border, paddingTop: 8, height: 85, paddingBottom: 20 },
    tabBarLabelStyle: { fontSize: 12, marginTop: 3 }, tabBarItemStyle: { maxWidth: 180 },
    tabBarHideOnKeyboard: true,
  }}>
    {([['index', 'Home', 'home'], ['tasks', 'Task', 'tasks'], ['priorities', 'Priorities', 'priorities'], ['calendar', 'Calendar', 'calendar']] as const).map(([name, title, icon]) =>
      <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color }) => <Icon name={icon as IconName} color={typeof color === 'string' ? color : theme.teal} /> }} />)}
    <Tabs.Screen name="decisions" options={{ href: null }} />
  </Tabs>;
}
