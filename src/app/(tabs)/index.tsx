import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ProgressRing } from '../../components/charts';
import { Badge, Button, Card, haptic, IconButton, Row, Screen, SectionHeader, T, Tap } from '../../components/ui';
import { addDays, dayKey, formatShortDate, greeting, startOfWeek, WEEKDAY_LONG, WEEKDAY_SHORT } from '../../lib/dates';
import { formatNumber } from '../../lib/units';
import { expectedIntakeByNow } from '../../lib/water';
import { useCoachReport, useExerciseLookup, useTodayRoutine, useWaterGoal, useWaterToday } from '../../store/selectors';
import { useToday } from '../../hooks/time';
import { useStore } from '../../store/useStore';
import { useUnits } from '../../store/useUnits';
import { categoryColor, colors, fonts, gradients, radius, space } from '../../theme';

export default function Today() {
  const now = useToday();
  const profile = useStore((s) => s.profile);
  const active = useStore((s) => s.activeWorkout);
  const startWorkout = useStore((s) => s.startWorkout);
  const routine = useTodayRoutine(now);
  const report = useCoachReport();
  const lookup = useExerciseLookup();
  const workouts = useStore((s) => s.workouts);
  const program = useStore((s) => s.program);
  const u = useUnits();

  const doneToday = useMemo(() => workouts.some((w) => w.endedAt && dayKey(new Date(w.startedAt)) === dayKey(now)), [workouts, now]);

  const start = (routineId?: string | null) => {
    if (!active) startWorkout(routineId);
    router.push('/workout');
  };

  const estMinutes = routine ? routine.exercises.reduce((m, e) => m + e.sets * (e.restSec / 60 + 0.75), 0) + 5 : 0;

  return (
    <Screen>
      <Animated.View entering={FadeInDown.duration(400)}>
        <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
          <View style={{ flex: 1 }}>
            <T variant="caption" color={colors.textMuted}>
              {WEEKDAY_LONG[now.getDay()]}, {formatShortDate(now)}
            </T>
            <T variant="title" numberOfLines={1}>
              {greeting(now)}
              {profile?.name ? `, ${profile.name}` : ''} 👋
            </T>
          </View>
          <IconButton icon="scale-outline" onPress={() => router.push('/log-weight')} accessibilityLabel="Log weight" />
        </Row>
      </Animated.View>

      {/* Today's workout */}
      <Animated.View entering={FadeInDown.delay(60).duration(400)} style={{ marginTop: space.lg }}>
        <Card gradient={gradients.hero} padded={false}>
          <View style={{ padding: space.lg }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Badge label={active ? 'In progress' : doneToday ? 'Completed' : routine ? "Today's workout" : 'Rest day'} color={active ? colors.warning : doneToday ? colors.success : colors.primaryText} icon={active ? 'play' : doneToday ? 'checkmark-circle' : routine ? 'barbell' : 'moon'} />
              {routine && !active ? (
                <T variant="caption" color={colors.textDim}>
                  ~{Math.round(estMinutes)} min
                </T>
              ) : null}
            </Row>
            {active ? (
              <>
                <T variant="title" style={{ marginTop: 10 }}>
                  {active.name}
                </T>
                <T variant="small" color={colors.textDim} style={{ marginTop: 2 }}>
                  Your workout is still running — pick up where you left off.
                </T>
                <Button title="Resume workout" icon="play" onPress={() => router.push('/workout')} style={{ marginTop: space.md }} />
              </>
            ) : routine ? (
              <>
                <T variant="title" style={{ marginTop: 10 }}>
                  {routine.name}
                </T>
                <T variant="small" color={colors.textDim} style={{ marginTop: 2 }}>
                  {routine.focus} · {routine.exercises.length} exercises
                </T>
                <View style={styles.exList}>
                  {routine.exercises.slice(0, 6).map((e) => (
                    <View key={e.exerciseId} style={styles.exPill}>
                      <T variant="caption" color={colors.text}>
                        {lookup(e.exerciseId)?.name ?? e.exerciseId}
                      </T>
                      <T variant="caption" color={colors.textMuted}>
                        {e.sets}×{e.repMin === e.repMax ? e.repMin : `${e.repMin}–${e.repMax}`}
                      </T>
                    </View>
                  ))}
                </View>
                <Button title={doneToday ? 'Train again' : 'Start workout'} icon="play" onPress={() => start(routine.id)} style={{ marginTop: space.md }} variant={doneToday ? 'secondary' : 'primary'} />
              </>
            ) : (
              <>
                <T variant="title" style={{ marginTop: 10 }}>
                  Recover & grow 😌
                </T>
                <T variant="small" color={colors.textDim} style={{ marginTop: 2 }}>
                  Muscles grow between sessions. Go for a walk, stretch, hit your protein and water.
                </T>
                <Row gap={10} style={{ marginTop: space.md }}>
                  <Button title="Quick workout" icon="flash" variant="secondary" size="md" full={false} style={{ flex: 1 }} onPress={() => start(null)} />
                  <Button title="See plan" icon="calendar" variant="ghost" size="md" full={false} onPress={() => router.push('/train')} />
                </Row>
              </>
            )}
          </View>
        </Card>
      </Animated.View>

      {/* Week strip */}
      <Animated.View entering={FadeInDown.delay(120).duration(400)}>
        <WeekStrip now={now} schedule={program?.schedule ?? []} />
      </Animated.View>

      {/* Water */}
      <Animated.View entering={FadeInDown.delay(180).duration(400)}>
        <SectionHeader title="Hydration" action="History" onAction={() => router.push('/progress')} />
        <WaterCard />
      </Animated.View>

      {/* Nutrition snapshot */}
      {report ? (
        <Animated.View entering={FadeInDown.delay(240).duration(400)}>
          <SectionHeader title="Today's targets" action="Details" onAction={() => router.push('/coach')} />
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <T variant="overline" color={colors.textMuted}>
                  Calories
                </T>
                <Row gap={4} align="flex-end">
                  <T variant="number">{formatNumber(report.target.calories, 0)}</T>
                  <T variant="caption" color={colors.textMuted} style={{ marginBottom: 6 }}>
                    kcal
                  </T>
                </Row>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T variant="overline" color={colors.textMuted}>
                  Weight
                </T>
                <Row gap={4} align="flex-end">
                  <T variant="number">{formatNumber(u.toDisplay(report.trendWeightKg ?? report.weightKg), 1)}</T>
                  <T variant="caption" color={colors.textMuted} style={{ marginBottom: 6 }}>
                    {u.unit}
                  </T>
                </Row>
              </View>
            </Row>
            <Row gap={8} style={{ marginTop: space.sm }}>
              <Macro label="Protein" grams={report.macros.proteinG} color={colors.orange} />
              <Macro label="Carbs" grams={report.macros.carbsG} color={colors.accent} />
              <Macro label="Fat" grams={report.macros.fatG} color={colors.pink} />
            </Row>
          </Card>
        </Animated.View>
      ) : null}

      {/* Coach tips */}
      {report ? (
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <SectionHeader title="Your coach says" action="Full plan" onAction={() => router.push('/coach')} />
          <View style={{ gap: 10 }}>
            {report.actions.slice(0, 3).map((a) => (
              <Card key={a.id} onPress={() => router.push('/coach')}>
                <Row gap={12} align="flex-start">
                  <View style={[styles.dot, { backgroundColor: categoryColor[a.category] }]} />
                  <View style={{ flex: 1 }}>
                    <T variant="h3">{a.title}</T>
                    <T variant="small" color={colors.textDim} style={{ marginTop: 2 }}>
                      {a.detail}
                    </T>
                  </View>
                </Row>
              </Card>
            ))}
          </View>
        </Animated.View>
      ) : null}
    </Screen>
  );
}

function Macro({ label, grams, color }: { label: string; grams: number; color: string }) {
  return (
    <View style={[styles.macro, { borderColor: color + '44' }]}>
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: color }} />
      <View>
        <T variant="h3">{Number.isFinite(grams) ? grams : '—'} g</T>
        <T variant="caption" color={colors.textMuted}>
          {label}
        </T>
      </View>
    </View>
  );
}

function WeekStrip({ now, schedule }: { now: Date; schedule: (string | null)[] }) {
  const workouts = useStore((s) => s.workouts);
  // Days before the plan existed can't be "missed".
  const planStart = useStore((s) => (s.program ? dayKey(new Date(s.program.createdAt)) : null));
  const start = startOfWeek(now);
  const doneDays = useMemo(() => new Set(workouts.filter((w) => w.endedAt).map((w) => dayKey(new Date(w.startedAt)))), [workouts]);
  const todayKey = dayKey(now);
  return (
    <Row gap={6} style={{ marginTop: space.md }}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i);
        const key = dayKey(d);
        const planned = !!schedule[d.getDay()] && (planStart == null || key >= planStart);
        const done = doneDays.has(key);
        const isToday = key === todayKey;
        const past = key < todayKey;
        return (
          <View key={key} style={[styles.day, isToday && styles.dayToday]}>
            <T variant="caption" color={isToday ? colors.text : colors.textMuted} style={{ fontSize: 11 }}>
              {WEEKDAY_SHORT[d.getDay()].slice(0, 1)}
            </T>
            <View style={[styles.dayCircle, done && { backgroundColor: colors.success }, !done && planned && { borderColor: past ? colors.danger + '88' : colors.primary, borderWidth: 1.5 }]}>
              {done ? <Ionicons name="checkmark" size={14} color="#05210F" /> : <T variant="caption" color={isToday ? colors.text : colors.textDim} style={{ fontFamily: fonts.semibold }}>{d.getDate()}</T>}
            </View>
          </View>
        );
      })}
    </Row>
  );
}

const NO_ENTRIES: never[] = [];

function WaterCard() {
  const goal = useWaterGoal();
  const intake = useWaterToday();
  const addWater = useStore((s) => s.addWater);
  const removeWater = useStore((s) => s.removeWater);
  const todayEntries = useStore((s) => s.water[dayKey()]);
  const entries = todayEntries ?? NO_ENTRIES;
  const settings = useStore((s) => s.settings.water);
  const u = useUnits();
  const pct = goal > 0 ? intake / goal : 0;
  const expected = expectedIntakeByNow(goal, new Date(), { startHour: settings.startHour, endHour: settings.endHour, intervalMin: settings.intervalMin });
  const behind = expected - intake;
  const status =
    intake >= goal ? { text: 'Goal reached — great job! 🎉', color: colors.success } : behind > 250 ? { text: `${u.water(behind)} behind schedule`, color: colors.warning } : { text: 'On track', color: colors.success };

  const add = (ml: number) => {
    const before = intake;
    addWater(ml);
    haptic(before < goal && before + ml >= goal ? 'success' : 'light');
  };

  const undo = () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    Alert.alert('Undo last drink?', `Remove ${u.water(last.ml)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeWater(dayKey(), last.id) },
    ]);
  };

  return (
    <Card>
      <Row gap={space.md}>
        <ProgressRing progress={pct} size={118} stroke={11} color="#38BDF8" colorEnd="#2563EB">
          <Ionicons name="water" size={18} color={colors.water} />
          <T variant="h2">{Math.round(pct * 100)}%</T>
        </ProgressRing>
        <View style={{ flex: 1 }}>
          <T variant="number">{u.water(intake)}</T>
          <T variant="small" color={colors.textDim}>
            of {u.water(goal)} goal
          </T>
          <Row gap={6} style={{ marginTop: 8 }}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <T variant="caption" color={status.color}>
              {status.text}
            </T>
          </Row>
        </View>
      </Row>
      <Row gap={8} style={{ marginTop: space.md }}>
        {[250, 500, 750].map((ml) => (
          <Tap key={ml} onPress={() => add(ml)} style={{ flex: 1 }} hapticKind={null} guard={false} accessibilityLabel={`Add ${u.water(ml)} of water`}>
            <View style={styles.waterBtn}>
              <Ionicons name="add" size={16} color={colors.water} />
              <T variant="bodyMedium" color={colors.text}>
                {u.water(ml)}
              </T>
            </View>
          </Tap>
        ))}
        <Tap onPress={undo} hapticKind="selection" disabled={entries.length === 0}>
          <View style={[styles.waterBtn, { paddingHorizontal: 14 }]}>
            <Ionicons name="arrow-undo" size={16} color={colors.textDim} />
          </View>
        </Tap>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  exList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.sm },
  exPill: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  day: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm, gap: 6 },
  dayToday: { backgroundColor: colors.card },
  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
  waterBtn: { height: 44, borderRadius: radius.sm, backgroundColor: colors.waterSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  macro: { flex: 1, flexDirection: 'row', gap: 8, padding: 10, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});
