import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { useNow } from '../../hooks/time';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Row, T, Tap } from '../../components/ui';
import { formatDuration } from '../../lib/dates';
import { useStore } from '../../store/useStore';
import { colors, fonts, gradients } from '../../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', title: 'Today', icon: 'today-outline', iconActive: 'today' },
  { name: 'train', title: 'Train', icon: 'barbell-outline', iconActive: 'barbell' },
  { name: 'progress', title: 'Progress', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { name: 'coach', title: 'Coach', icon: 'sparkles-outline', iconActive: 'sparkles' },
  { name: 'profile', title: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

const TAB_BAR_HEIGHT = 70;

export default function TabsLayout() {
  const onboarded = useStore((s) => s.onboarded);
  const insets = useSafeAreaInsets();
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingTop: 6,
            paddingBottom: Math.max(insets.bottom, 10),
          },
          tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
          sceneStyle: { backgroundColor: colors.bg },
        }}
      >
        {TABS.map((t) => (
          <Tabs.Screen
            key={t.name}
            name={t.name}
            options={{
              title: t.title,
              tabBarIcon: ({ focused, color }) => (
                <View style={focused ? styles.activeIcon : undefined}>
                  <Ionicons name={focused ? t.iconActive : t.icon} size={22} color={focused ? colors.primaryText : color} />
                </View>
              ),
            }}
          />
        ))}
      </Tabs>
      <ActiveWorkoutBanner bottom={TAB_BAR_HEIGHT + insets.bottom + 8} />
    </View>
  );
}

function ActiveWorkoutBanner({ bottom }: { bottom: number }) {
  const active = useStore((s) => s.activeWorkout);
  const now = useNow(1000, !!active);
  if (!active) return null;
  const done = active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const total = active.exercises.reduce((n, e) => n + e.sets.length, 0);
  return (
    <Animated.View entering={FadeInDown} style={[styles.banner, { bottom }]}>
      <Tap onPress={() => router.push('/workout')} scaleTo={0.98}>
        <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bannerInner}>
          <View style={styles.pulse} />
          <View style={{ flex: 1 }}>
            <T variant="h3" color="#fff" numberOfLines={1}>
              {active.name}
            </T>
            <T variant="caption" color="rgba(255,255,255,0.8)">
              {formatDuration((now - active.startedAt) / 1000)} · {done}/{total} sets
            </T>
          </View>
          <Row gap={4}>
            <T variant="caption" color="#fff" style={{ fontFamily: fonts.semibold }}>
              Resume
            </T>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </Row>
        </LinearGradient>
      </Tap>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  activeIcon: { backgroundColor: colors.primarySoft, paddingHorizontal: 14, paddingVertical: 3, borderRadius: 999 },
  banner: { position: 'absolute', left: 12, right: 12 },
  bannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    ...Platform.select({ android: { elevation: 8 }, default: { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } } }),
  },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
});
