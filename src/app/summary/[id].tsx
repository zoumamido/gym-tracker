import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { HBar } from '../../components/charts';
import { Button, Card, EmptyState, IconButton, Row, Screen, SectionHeader, Stat, T } from '../../components/ui';
import { MUSCLE_LABEL } from '../../data/muscles';
import { formatLongDate, formatMinutes } from '../../lib/dates';
import { detectPRs, PR_LABEL } from '../../lib/records';
import { finishedWorkouts, workingSets, workoutDurationSec, workoutSetCount, workoutVolume } from '../../lib/stats';
import { estimate1RM } from '../../lib/strength';
import type { Muscle } from '../../lib/types';
import { formatInt, formatNumber } from '../../lib/units';
import { setsPerMuscle } from '../../lib/volume';
import { useExerciseLookup } from '../../store/selectors';
import { useStore } from '../../store/useStore';
import { useUnits } from '../../store/useUnits';
import { colors, gradients, space } from '../../theme';

export default function Summary() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const workouts = useStore((s) => s.workouts);
  const deleteWorkout = useStore((s) => s.deleteWorkout);
  const lookup = useExerciseLookup();
  const u = useUnits();
  const workout = workouts.find((w) => w.id === id);

  const data = useMemo(() => {
    if (!workout) return null;
    const prs = detectPRs(workout, workouts);
    const muscles = setsPerMuscle([workout], lookup, workout.startedAt, workout.startedAt + 1);
    const muscleList = (Object.keys(muscles) as Muscle[]).filter((m) => muscles[m] > 0).sort((a, b) => muscles[b] - muscles[a]);
    const previous = workout.routineId
      ? finishedWorkouts(workouts)
          .filter((w) => w.routineId === workout.routineId && w.startedAt < workout.startedAt)
          .pop()
      : undefined;
    return { prs, muscles, muscleList, previous };
  }, [workout, workouts, lookup]);

  // The summary replaced the workout modal, so going back always lands on the tabs.
  const done = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!workout || !data) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title="Workout not found" action="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const volume = workoutVolume(workout);
  const prevVolume = data.previous ? workoutVolume(data.previous) : null;
  const volDelta = prevVolume ? ((volume - prevVolume) / prevVolume) * 100 : null;
  const maxMuscle = Math.max(1, ...data.muscleList.map((m) => data.muscles[m]));

  return (
    <Screen edges={['top', 'bottom']}>
      <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
        <IconButton icon={fresh ? 'close' : 'chevron-back'} onPress={done} accessibilityLabel={fresh ? 'Close' : 'Back'} />
        <IconButton
          icon="trash-outline"
          accessibilityLabel="Delete workout"
          color={colors.danger}
          onPress={() =>
            Alert.alert('Delete workout?', 'This removes it from your history and stats.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  deleteWorkout(workout.id);
                  done();
                },
              },
            ])
          }
        />
      </Row>

      <Animated.View entering={ZoomIn.springify().damping(14)} style={{ alignItems: 'center', marginTop: space.md }}>
        <LinearGradient colors={data.prs.length ? gradients.gold : gradients.success} style={styles.medal}>
          <Ionicons name={data.prs.length ? 'trophy' : 'checkmark-done'} size={42} color={data.prs.length ? '#5B3A00' : '#05210F'} />
        </LinearGradient>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(150)} style={{ alignItems: 'center', marginTop: space.md }}>
        <T variant="title" style={{ textAlign: 'center' }}>
          {fresh ? (data.prs.length ? `${data.prs.length} new record${data.prs.length > 1 ? 's' : ''}! 🔥` : 'Workout complete! 💪') : workout.name}
        </T>
        <T variant="small" color={colors.textDim} style={{ marginTop: 4 }}>
          {fresh ? workout.name + ' · ' : ''}
          {formatLongDate(new Date(workout.startedAt))}
        </T>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(250)}>
        <Row gap={8} style={{ marginTop: space.lg }}>
          <Stat label="Time" value={formatMinutes(workoutDurationSec(workout) / 60)} icon="time-outline" />
          <Stat label="Volume" value={formatInt(u.toDisplay(volume))} unit={u.unit} icon="barbell-outline" />
          <Stat label="Sets" value={String(workoutSetCount(workout))} icon="layers-outline" />
        </Row>
        {volDelta != null && Number.isFinite(volDelta) ? (
          <Card style={{ marginTop: space.sm }}>
            <Row gap={10}>
              <Ionicons name={volDelta >= 0 ? 'trending-up' : 'trending-down'} size={20} color={volDelta >= 0 ? colors.success : colors.warning} />
              <T variant="small" color={colors.textDim} style={{ flex: 1 }}>
                {volDelta >= 0 ? 'Up' : 'Down'} {formatNumber(Math.abs(volDelta), 0)}% volume vs your last {workout.name} session.
              </T>
            </Row>
          </Card>
        ) : null}
      </Animated.View>

      {data.prs.length ? (
        <Animated.View entering={FadeInDown.delay(320)}>
          <SectionHeader title="Personal records" />
          <Card gradient={['#3A2A08', '#1A1608']}>
            {data.prs.map((pr, i) => (
              <Row key={i} gap={12} style={{ paddingVertical: 8 }}>
                <Ionicons name="trophy" size={18} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <T variant="bodyMedium">{lookup(pr.exerciseId)?.name}</T>
                  <T variant="caption" color={colors.textDim}>
                    {PR_LABEL[pr.type]}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T variant="h3" color={colors.warning}>
                    {pr.type === 'reps' ? `${pr.value} reps` : u.w(pr.value)}
                  </T>
                  <T variant="caption" color={colors.textMuted}>
                    was {pr.type === 'reps' ? pr.previous : u.w(pr.previous)}
                  </T>
                </View>
              </Row>
            ))}
          </Card>
        </Animated.View>
      ) : null}

      <SectionHeader title="Exercises" />
      <Card>
        {workout.exercises.map((we, i) => {
          const ex = lookup(we.exerciseId);
          const sets = workingSets(we);
          const best = sets.reduce<{ w: number; r: number; e: number } | null>((b, s) => {
            const e = estimate1RM(s.weightKg ?? 0, s.reps ?? 0, s.rpe).value;
            return !b || e > b.e ? { w: s.weightKg ?? 0, r: s.reps ?? 0, e } : b;
          }, null);
          return (
            <View key={we.id} style={[styles.exRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <T variant="bodyMedium">{ex?.name ?? 'Exercise'}</T>
                <T variant="caption" color={colors.textMuted}>
                  {sets.map((s) => (ex?.kind === 'strength' && s.weightKg ? `${u.load(s.weightKg)}×${s.reps}` : `${s.reps}${ex?.kind === 'timed' ? 's' : ex?.kind === 'cardio' ? ' min' : ''}`)).join('  ·  ')}
                </T>
              </View>
              {best && best.w > 0 ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <T variant="caption" color={colors.textMuted}>
                    e1RM
                  </T>
                  <T variant="h3">
                    {u.load(best.e)} {u.unit}
                  </T>
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      {data.muscleList.length ? (
        <>
          <SectionHeader title="Muscles worked" />
          <Card>
            {data.muscleList.map((m) => (
              <HBar key={m} label={MUSCLE_LABEL[m]} value={data.muscles[m]} max={maxMuscle} color={colors.primary} right={`${formatNumber(data.muscles[m], 1)} sets`} />
            ))}
          </Card>
        </>
      ) : null}

      {workout.notes ? (
        <>
          <SectionHeader title="Notes" />
          <Card>
            <T variant="body" color={colors.textDim}>
              {workout.notes}
            </T>
          </Card>
        </>
      ) : null}

      <Button title={fresh ? 'Done' : 'Back'} onPress={done} style={{ marginTop: space.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  medal: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
});
