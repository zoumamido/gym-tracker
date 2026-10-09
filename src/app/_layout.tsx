import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initNotifications } from '../services/notifications';
import { useReminderSync } from '../services/useReminderSync';
import { useRestWatcher } from '../services/useRestWatcher';
import { useStore } from '../store/useStore';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  const hydrated = useStore((s) => s.hydrated);
  const ready = (fontsLoaded || !!fontError) && hydrated;

  useEffect(() => {
    initNotifications().catch(() => {});
  }, []);

  useReminderSync();
  useRestWatcher();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="workout" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="summary/[id]" options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="exercises" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="exercise/[id]" />
        <Stack.Screen name="routine/[id]" />
        <Stack.Screen name="log-weight" options={{ presentation: 'transparentModal', animation: 'fade' }} />
        <Stack.Screen name="tools" />
      </Stack>
    </SafeAreaProvider>
  );
}
