import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { Button, Card, EmptyState, IconButton, Row, Screen, T, Tap } from '../../components/ui';
import type { Routine, RoutineExercise } from '../../lib/types';
import { useExerciseLookup } from '../../store/selectors';
import { useStore } from '../../store/useStore';
import { colors, fonts, radius, space } from '../../theme';

export default function RoutineEditor() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const routine = useStore((s) => s.program?.routines.find((r) => r.id === id));
  const { upsertRoutine, deleteRoutine } = useStore.getState();
  const lookup = useExerciseLookup();

  // A routine created via "+ New" and left without exercises is discarded on leave.
  useEffect(() => {
    if (!fresh) return;
    return () => {
      const r = useStore.getState().program?.routines.find((x) => x.id === id);
      if (r && r.exercises.length === 0) useStore.getState().deleteRoutine(id);
    };
  }, [fresh, id]);

  if (!routine) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" title="Routine not found" action="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const save = (patch: Partial<Routine>) => upsertRoutine({ ...routine, ...patch });
  const updateEx = (i: number, patch: Partial<RoutineExercise>) => {
    const exercises = routine.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e));
    save({ exercises });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= routine.exercises.length) return;
    const exercises = [...routine.exercises];
    [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
    save({ exercises });
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginTop: space.xs }}>
        <IconButton icon="chevron-back" onPress={() => router.back()} accessibilityLabel="Back" />
        <IconButton
          icon="trash-outline"
          accessibilityLabel="Delete routine"
          color={colors.danger}
          onPress={() =>
            Alert.alert('Delete routine?', `"${routine.name}" will be removed from your program and schedule.`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  router.back();
                  deleteRoutine(routine.id);
                },
              },
            ])
          }
        />
      </Row>
      <TextInput defaultValue={routine.name} onChangeText={(t) => t.trim() && save({ name: t.trim() })} style={styles.title} maxLength={40} selectionColor={colors.primary} accessibilityLabel="Routine name" />
      <TextInput defaultValue={routine.focus} onChangeText={(t) => save({ focus: t.trim() })} style={styles.focus} accessibilityLabel="Routine focus" placeholder="Focus (e.g. Chest · Triceps)" placeholderTextColor={colors.textMuted} maxLength={60} />

      <View style={{ gap: 10, marginTop: space.md }}>
        {routine.exercises.map((e, i) => {
          const ex = lookup(e.exerciseId);
          const unit = ex?.kind === 'timed' ? 'sec' : ex?.kind === 'cardio' ? 'min' : 'reps';
          return (
            <Card key={`${e.exerciseId}-${i}`}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="h3" style={{ flex: 1 }}>
                  {ex?.name ?? e.exerciseId}
                </T>
                <Row gap={6}>
                  <IconButton icon="arrow-up" size={32} iconSize={16} onPress={() => move(i, -1)} accessibilityLabel={`Move ${ex?.name ?? 'exercise'} up`} />
                  <IconButton icon="arrow-down" size={32} iconSize={16} onPress={() => move(i, 1)} accessibilityLabel={`Move ${ex?.name ?? 'exercise'} down`} />
                  <IconButton icon="close" size={32} iconSize={16} color={colors.danger} onPress={() => save({ exercises: routine.exercises.filter((_, j) => j !== i) })} accessibilityLabel={`Remove ${ex?.name ?? 'exercise'}`} />
                </Row>
              </Row>
              <Row gap={8} style={{ marginTop: space.sm }}>
                <Mini label="Sets" value={e.sets} onChange={(v) => updateEx(i, { sets: v })} min={1} max={10} />
                <Mini label={`Min ${unit}`} value={e.repMin} onChange={(v) => updateEx(i, { repMin: v, repMax: Math.max(v, e.repMax) })} min={1} max={300} step={ex?.kind === 'timed' ? 5 : 1} />
                <Mini label={`Max ${unit}`} value={e.repMax} onChange={(v) => updateEx(i, { repMax: v, repMin: Math.min(v, e.repMin) })} min={1} max={300} step={ex?.kind === 'timed' ? 5 : 1} />
                <Mini label="Rest s" value={e.restSec} onChange={(v) => updateEx(i, { restSec: v })} min={0} max={600} step={15} />
              </Row>
            </Card>
          );
        })}
      </View>
      {routine.exercises.length === 0 ? <EmptyState icon="add-circle-outline" title="No exercises" detail="Add exercises to build this routine." /> : null}
      <Button title="Add exercise" icon="add" variant="secondary" style={{ marginTop: space.md }} onPress={() => router.push({ pathname: '/exercises', params: { mode: 'routine', target: routine.id } })} />
    </Screen>
  );
}

function Mini({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <View style={styles.mini}>
      <T variant="caption" color={colors.textMuted} style={{ fontSize: 10 }}>
        {label}
      </T>
      <Row gap={2} style={{ justifyContent: 'space-between', width: '100%' }}>
        <Tap onPress={() => set(value - step)} hapticKind="selection" style={styles.miniBtn} guard={false} hitSlop={12} accessibilityLabel={`Decrease ${label}`}>
          <Ionicons name="remove" size={14} color={colors.textDim} />
        </Tap>
        <T variant="bodyMedium" style={{ fontFamily: fonts.bold }}>
          {value}
        </T>
        <Tap onPress={() => set(value + step)} hapticKind="selection" style={styles.miniBtn} guard={false} hitSlop={12} accessibilityLabel={`Increase ${label}`}>
          <Ionicons name="add" size={14} color={colors.textDim} />
        </Tap>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 26, marginTop: space.md, paddingVertical: 4 },
  focus: { color: colors.textDim, fontFamily: fonts.medium, fontSize: 15, paddingVertical: 4 },
  mini: { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 4, gap: 2, borderWidth: 1, borderColor: colors.border },
  miniBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
});
