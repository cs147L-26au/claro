import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '../lib/store';
import { AuthProvider, useAuth } from '../lib/auth';

function AppNavigation() {
  const { session, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, backgroundColor: '#FBF7ED', justifyContent: 'center' }}><ActivityIndicator accessibilityLabel="Restoring your account" color="#105B56" /></View>;
  return <StoreProvider><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FBF7ED' } }}>
    <Stack.Protected guard={!session}><Stack.Screen name="login" /></Stack.Protected>
    <Stack.Protected guard={Boolean(session)}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="account" />
      <Stack.Screen name="saved-priorities" />
      <Stack.Screen name="task/[id]" />
      <Stack.Screen name="task/[id]/priorities" />
      <Stack.Screen name="decision/[id]" />
      <Stack.Screen name="decision/new" />
      <Stack.Screen name="decision/edit" />
      <Stack.Screen name="decision/compare" />
    </Stack.Protected>
  </Stack></StoreProvider>;
}

export default function RootLayout() {
  return <SafeAreaProvider><AuthProvider><StatusBar style="dark" /><AppNavigation /></AuthProvider></SafeAreaProvider>;
}
