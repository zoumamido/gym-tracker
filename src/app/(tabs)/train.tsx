import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ActionSheet } from '../../components/Sheet';
import { Badge, Button, Card, EmptyState, IconButton, Row, Screen, SectionHeader, T, Tap } from '../../components/ui';
import { formatShortDate, formatMinutes, WEEKDAY_LONG } from '../../lib/dates';
import { uid } from '../../lib/ids';
import { exercisesForMinutes, generateProgram } from '../../lib/program';
import { finishedWorkouts, workoutDurationSec, workoutSetCount, workoutVolume } from '../../lib/stats';
import { formatInt } from '../../lib/units';
import { useExerciseLookup } from '../../store/selectors';
import { useStore } from '../../store/useStore';
import { useUnits } from '../../store/useUnits';
import { colors, gradients, radius, space } from '../../theme';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function Train() {
  const program = useStore((s) => s.program);
  const profile = useStore((s) => s.profile);
  const workouts = useStore((s) => s.workouts);
  const active = useStore((s) => s.activeWorkout);
  const { startWorkout, setScheduleDay, setProgram, upsertRoutine } = useStore.getState();
  const lookup = useExerciseLookup();
  const u = useUnits();
  const [dayPicker, setDayPicker] = useState<number | null>(null);
  const history = useMemo(() => finishedWorkouts(workouts).reverse().slice(0, 25), [workouts]);
  const today = new Date().getDay();

  const start = (routineId: string | null) => {
    if (active) {
      Alert.alert('Workout in progress', 'Finish or discard your current workout first.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open it', onPress: () => router.push('/workout') },
      ]);
      return;
    }
    startWorkout(routineId);
    router.push('/workout');
  };

  const regenerate = () => {
    if (!profile) return;
    Alert.alert('Generate a new program?', 'Your routines and schedule will be replaced with a fresh plan based on your profile. Workout history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Generate',
        onPress: () =>
          setProgram(
            generateProgram({
              daysPerWeek: profile.daysPerWeek,
              experience: profile.experience,
              trainingGoal: profile.trainingGoal,
              equipment: profile.equipment,
              maxExercises: exercisesForMinutes(profile.sessionMinutes),
            }),
          ),
      },
    ]);
  };

  const newRoutine = () => {
    const id = uid('r_');
    upsertRoutine({ id, name: 'New routine', focus: 'Custom', exercises: [] });
    // `fresh` lets the editor remove the routine again if the user leaves it empty.
    router.push({ pathname: '/routine/[id]', params: { id, fresh: '1' } });
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <T variant="title">Train</T>
        <Row gap={8}>
          <IconButton icon="calculator-outline" onPress={() => router.push('/tools')} accessibilityLabel="Tools" />
          <IconButton icon="library-outline" onPress={() => router.push('/exercises')} accessibilityLabel="Exercise library" />
        </Row>
      </Row>

      {program ? (
        <Card gradient={gradients.hero} style={{ marginTop: space.md }}>
          <Badge label={`${program.schedule.filter(Boolean).length} days / week`} color={colors.primaryText} icon="calendar" />
          <T variant="h2" style={{ marginTop: 10 }}>
            {program.name}
          </T>
          <T variant="small" color={colors.textDim} style={{ marginTop: 4 }}>
            {program.description}
          </T>
          <Row gap={10} style={{ marginTop: space.md }}>
            <Button title="Quick start" icon="flash" variant="secondary" size="md" full={false} style={{ flex: 1 }} onPress={() => start(null)} />
            <Button title="Regenerate" icon="refresh" variant="ghost" size="md" full={false} onPress={regenerate} />
          </Row>
        </Card>
      ) : (
        <Card style={{ marginTop: space.md }}>
          <EmptyState icon="barbell-outline" title="No program yet" detail="Generate a plan from your profile." action="Generate program" onAction={regenerate} />
        </Card>
      )}

      {program ? (
        <>
          <SectionHeader title="Weekly schedule" />
          <Card padded={false}>
            {WEEK_ORDER.map((d, i) => {
              const r = program.routines.find((x) => x.id === program.schedule[d]);
              return (
                <Tap key={d} onPress={() => setDayPicker(d)} hapticKind="selection" scaleTo={0.99}>
                  <View style={[styles.dayRow, i > 0 && styles.divider, d === today && { backgroundColor: colors.primarySoft }]}>
                    <T variant="bodyMedium" color={d === today ? colors.text : colors.textDim} style={{ width: 96 }}>
                      {WEEKDAY_LONG[d]}
                    </T>
                    <View style={{ flex: 1 }}>
                      <T variant="bodyMedium" color={r ? colors.text : colors.textMuted}>
                        {r ? r.name : 'Rest'}
                      </T>
                    </View>
                    <Ionicons name={r ? 'barbell' : 'moon-outline'} size={16} color={r ? colors.primaryText : colors.textMuted} />
                  </View>
                </Tap>
              );
            })}
          </Card>

          <SectionHeader title="Routines" action="+ New" onAction={newRoutine} />
          <View style={{ gap: 10 }}>
            {program.routines.map((r) => (
              <Card key={r.id} onPress={() => router.push({ pathname: '/routine/[id]', params: { id: r.id } })}>
                <Row style={{ justifyContent: 'space-between' }} align="flex-start">
                  <View style={{ flex: 1 }}>
                    <T variant="h3">{r.name}</T>
                    <T variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>
                      {r.focus} · {r.exercises.length} exercises · {r.exercises.reduce((n, e) => n + e.sets, 0)} sets
                    </T>
                  </View>
                  <Button title="Start" icon="play" size="sm" full={false} onPress={() => start(r.id)} />
                </Row>
                <T variant="small" color={colors.textDim} style={{ marginTop: 8 }} numberOfLines={2}>
                  {r.exercises.map((e) => lookup(e.exerciseId)?.name ?? '?').join(' · ') || 'No exercises yet — tap to add'}
                </T>
              </Card>
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader title="History" />
      {history.length === 0 ? (
        <Card>
          <EmptyState icon="time-outline" title="No workouts yet" detail="Finished workouts appear here with volume, sets and records." />
        </Card>
      ) : (
        <View style={{ gap: 10 }}>
          {history.map((w) => (
            <Card key={w.id} onPress={() => router.push({ pathname: '/summary/[id]', params: { id: w.id } })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T variant="h3">{w.name}</T>
                  <T variant="caption" color={colors.textMuted}>
                    {formatShortDate(new Date(w.startedAt))} · {formatMinutes(workoutDurationSec(w) / 60)}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T variant="bodyMedium">
                    {formatInt(u.toDisplay(workoutVolume(w)))} {u.unit}
                  </T>
                  <T variant="caption" color={colors.textMuted}>
                    {workoutSetCount(w)} sets
                  </T>
                </View>
              </Row>
            </Card>
          ))}
        </View>
      )}

      <ActionSheet
        visible={dayPicker != null}
        onClose={() => setDayPicker(null)}
        title={dayPicker != null ? WEEKDAY_LONG[dayPicker] : ''}
        actions={
          program && dayPicker != null
            ? [
                ...program.routines.map((r) => ({ label: r.name, icon: 'barbell-outline' as const, detail: r.focus, onPress: () => setScheduleDay(dayPicker, r.id) })),
                { label: 'Rest day', icon: 'moon-outline' as const, onPress: () => setScheduleDay(dayPicker, null) },
              ]
            : []
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 14, gap: 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
});
