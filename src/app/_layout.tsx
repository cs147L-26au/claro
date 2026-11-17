import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '../lib/store';

export default function RootLayout() {
  return <SafeAreaProvider><StoreProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FBF7ED' } }} /></StoreProvider></SafeAreaProvider>;
}
