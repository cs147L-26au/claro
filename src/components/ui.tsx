import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { router } from 'expo-router';

export const theme = { bg: '#FBF7ED', teal: '#105B56', ink: '#293F3D', muted: '#737871', border: '#D6DAD1', soft: '#EAEEE3', white: '#FFFFFF', gold: '#F2BE63', error: '#9B4039' };
export type IconName = 'home' | 'tasks' | 'priorities' | 'decision' | 'plus' | 'arrow' | 'back' | 'check' | 'search' | 'close' | 'archive' | 'sparkles' | 'layers' | 'edit' | 'account' | 'history' | 'calendar';
const paths: Record<IconName, string> = {
  calendar: 'M4 5H20V21H4ZM8 2V8M16 2V8M4 10H20M8 14H10M14 14H16M8 18H10',
  history: 'M3 11A9 9 0 1 1 5.5 18M3 4V11H10M12 7V12L16 14',
  account: 'M16 7A4 4 0 1 1 8 7 4 4 0 0 1 16 7ZM4 22V19A8 8 0 0 1 20 19V22',
  home: 'M3 10 12 3 21 10V21H15V14H9V21H3Z',
  tasks: 'M10 5H21M10 12H21M10 19H21M3 4H6V7H3ZM3 11H6V14H3ZM2 19 4 21 7 17',
  priorities: 'M4 3V8M4 12V21M12 3V14M12 18V21M20 3V5M20 9V21M1 8H7M9 14H15M17 5H23',
  decision: 'M12 22V13M12 13 4 5M4 5V11M4 5H10M12 13 20 5M20 5V11M20 5H14',
  plus: 'M12 5V19M5 12H19', arrow: 'M4 12H20M14 6 20 12 14 18', back: 'M20 12H4M10 6 4 12 10 18',
  check: 'M4 12 9 17 20 6', search: 'M16 16 22 22M18 10A8 8 0 1 1 2 10 8 8 0 0 1 18 10', close: 'M6 6 18 18M6 18 18 6',
  archive: 'M3 3H21V8H3ZM5 8V21H19V8M9 12H15', sparkles: 'M12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9ZM21 2V6M19 4H23',
  layers: 'M12 3 22 8 12 13 2 8ZM2 12 12 17 22 12M2 16 12 21 22 16', edit: 'M15 4 20 9M4 16 17 3 22 8 9 21 3 22ZM3 22 4 16',
};
export function Icon({ name, size = 22, color = theme.teal }: { name: IconName; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d={paths[name]} stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
export function Brand({ title = 'Claro' }: { title?: string }) {
  return <View style={s.brand}><Svg width={39} height={39} viewBox="0 0 40 40">
    <Path d="M26 9A14 14 0 1 0 26 31" stroke={theme.teal} strokeWidth={7} fill="none" />
    <Circle cx={22} cy={20} r={5} fill={theme.gold} />
    <Path d="M28 11 32 5M31 16 38 13M32 22H39M29 28 35 33M25 7 26 2" stroke={theme.gold} strokeWidth={2.8} strokeLinecap="round" />
  </Svg><Text style={s.brandText}>{title}</Text></View>;
}
export function Page({ children, title, back, action, onBack }: { children: React.ReactNode; title: string; back?: boolean; action?: React.ReactNode; onBack?: () => void }) {
  return <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <View style={s.headerSide}>{back && <IconButton name="back" label="Go back" onPress={onBack || (() => router.canGoBack() ? router.back() : router.replace('/'))} />}</View>
        {back ? <Text numberOfLines={2} style={[s.heading, { flex: 1, textAlign: 'center', paddingHorizontal: 4 }]}>{title}</Text> : <Brand title={title} />}<View style={s.headerSide}>{action}</View>
      </View>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function Heading({ children }: { children: React.ReactNode }) { return <Text style={s.heading} accessibilityRole="header">{children}</Text>; }
export function Body({ children }: { children: React.ReactNode }) { return <Text style={s.body}>{children}</Text>; }
export function Card({ children, soft = false }: { children: React.ReactNode; soft?: boolean }) { return <View style={[s.card, soft && s.soft]}>{children}</View>; }
export function Button({ label, onPress, secondary, busy, disabled, icon }: { label: string; onPress: () => void; secondary?: boolean; busy?: boolean; disabled?: boolean; icon?: IconName }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, (disabled || busy) && { opacity: 0.5 }, pressed && { opacity: 0.75 }]}>
    {busy ? <ActivityIndicator color={secondary ? theme.teal : theme.white} /> : icon && <Icon name={icon} color={secondary ? theme.teal : theme.white} size={20} />}
    <Text style={[s.buttonText, secondary && { color: theme.teal }]}>{label}</Text>
  </Pressable>;
}
export function IconButton({ name, label, onPress, disabled }: { name: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.iconButton, { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}><Icon name={name} /></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 8 }}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#858A81" {...props} style={[s.input, props.multiline && { minHeight: 112, textAlignVertical: 'top' }, props.style]} /></View>;
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[s.notice, error && { color: theme.error, backgroundColor: '#F8E9E3' }]}>{children}</Text>;
}
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return <Pressable accessibilityRole={onPress ? 'button' : 'text'} accessibilityState={{ selected }} onPress={onPress} style={[s.chip, selected && { backgroundColor: theme.teal }]}><Text style={[s.chipText, selected && { color: 'white' }]}>{label}</Text></Pressable>;
}
export function Empty({ title, text, icon = 'layers' }: { title: string; text: string; icon?: IconName }) {
  return <View style={s.empty}><View style={s.emptyIcon}><Icon name={icon} size={30} /></View><Heading>{title}</Heading><Text style={[s.body, { textAlign: 'center' }]}>{text}</Text></View>;
}
export function Sheet({ visible, title, close, children }: { visible: boolean; title: string; close: () => void; children: React.ReactNode }) {
  return <Modal visible={visible} animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
    <SafeAreaView style={s.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.header, { paddingVertical: 12 }]}><View style={{ flex: 1 }}><Heading>{title}</Heading></View><IconButton name="close" label="Close" onPress={close} /></View>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={s.page}>{children}</ScrollView>
    </KeyboardAvoidingView></SafeAreaView>
  </Modal>;
}
export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  header: { width: '100%', maxWidth: 640, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 20 },
  headerSide: { width: 44, alignItems: 'center' }, brand: { flexDirection: 'row', alignItems: 'center', gap: 3 }, brandText: { fontSize: 27, fontWeight: '600', color: '#152824', letterSpacing: -0.7 },
  page: { width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 10, paddingBottom: 40, gap: 20 },
  heading: { fontSize: 22, fontWeight: '600', color: theme.teal, lineHeight: 29, letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 23, color: theme.muted }, label: { fontSize: 15, fontWeight: '600', color: theme.ink },
  card: { borderRadius: 22, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.white, padding: 18, gap: 12 }, soft: { backgroundColor: theme.soft, borderColor: theme.soft },
  button: { minHeight: 54, borderRadius: 28, backgroundColor: theme.teal, paddingHorizontal: 22, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  secondary: { backgroundColor: theme.white, borderColor: theme.border, borderWidth: 1 }, buttonText: { color: 'white', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 15, minHeight: 52, backgroundColor: 'white', color: theme.ink, fontSize: 16, lineHeight: 23 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, title: { fontSize: 17, lineHeight: 24, color: theme.ink, fontWeight: '600' },
  small: { fontSize: 12, color: theme.muted, lineHeight: 18 }, divider: { height: 1, backgroundColor: '#ECEEE7' },
  notice: { color: theme.teal, backgroundColor: theme.soft, padding: 14, borderRadius: 14, fontSize: 14, lineHeight: 21 },
  chip: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 22, backgroundColor: theme.soft, minHeight: 40, justifyContent: 'center' },
  chipText: { color: theme.teal, fontSize: 13, fontWeight: '500' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 24, paddingHorizontal: 12 }, emptyIcon: { padding: 18, borderRadius: 40, backgroundColor: theme.soft, marginBottom: 6 },
});
