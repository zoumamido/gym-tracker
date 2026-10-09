import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionSheet } from '../components/Sheet';
import { Button, EmptyState, haptic, IconButton, Row, T } from '../components/ui';
import { ExerciseCard, RestTimerBar } from '../components/workout';
import { formatDuration } from '../lib/dates';
import { workoutVolume } from '../lib/stats';
import { formatInt } from '../lib/units';
import { useNow } from '../hooks/time';
import { endRest } from '../services/rest';
import { useStore } from '../store/useStore';
import { useUnits } from '../store/useUnits';
import { colors, fonts, radius, space } from '../theme';

export default function WorkoutScreen() {
  const workout = useStore((s) => s.activeWorkout);
  const restActive = useStore((s) => !!s.restTimer);
  const { finishWorkout, discardWorkout, renameWorkout, setWorkoutNotes } = useStore.getState();
  const [menu, setMenu] = useState(false);
  const u = useUnits();
  const leaving = useRef(false);

  useEffect(() => {
    if (!workout && !leaving.current && router.canGoBack()) router.back();
  }, [workout]);

  if (!workout) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const allSets = workout.exercises.flatMap((e) => e.sets);
  const done = allSets.filter((s) => s.done).length;
  const volume = workoutVolume({ ...workout, endedAt: null });

  const finish = () => {
    const incomplete = allSets.length - done;
    const doFinish = () => {
      endRest();
      leaving.current = true;
      const id = finishWorkout();
      if (id) {
        haptic('success');
        router.replace({ pathname: '/summary/[id]', params: { id, fresh: '1' } });
      } else {
        Alert.alert('Workout discarded', 'No completed sets were logged, so nothing was saved.');
        router.back();
      }
    };
    if (done === 0) {
      Alert.alert('No sets completed', 'Tick the ✓ on each set you finish. Discard this workout?', [
        { text: 'Keep training', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: doFinish },
      ]);
      return;
    }
    Alert.alert(
      'Finish workout?',
      incomplete > 0 ? `${incomplete} unfinished set${incomplete === 1 ? '' : 's'} will be dropped.` : 'Great session — all sets completed! 💪',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Finish', onPress: doFinish },
      ],
    );
  };

  const discard = () =>
    Alert.alert('Discard workout?', 'All sets from this session will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          endRest();
          discardWorkout();
        },
      },
    ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <IconButton icon="chevron-down" onPress={() => router.back()} accessibilityLabel="Minimise workout" />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Elapsed startedAt={workout.startedAt} />
          <T variant="caption" color={colors.textMuted}>
            {done}/{allSets.length} sets · {formatInt(u.toDisplay(volume))} {u.unit}
          </T>
        </View>
        <Button title="Finish" variant="success" size="sm" full={false} onPress={finish} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
        <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: restActive ? 180 : 60 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
            <TextInput
              defaultValue={workout.name}
              onChangeText={renameWorkout}
              accessibilityLabel="Workout name"
              style={styles.title}
              selectionColor={colors.primary}
              maxLength={40}
            />
            <IconButton icon="ellipsis-horizontal" onPress={() => setMenu(true)} accessibilityLabel="Workout options" />
          </Row>
          {workout.exercises.length === 0 ? (
            <EmptyState icon="barbell-outline" title="Empty workout" detail="Add your first exercise to start logging sets." />
          ) : (
            workout.exercises.map((we, i) => <ExerciseCard key={we.id} we={we} index={i} count={workout.exercises.length} />)
          )}
          <Button title="Add exercise" icon="add" variant="secondary" onPress={() => router.push({ pathname: '/exercises', params: { mode: 'add' } })} style={{ marginTop: space.xs }} />
          <TextInput
            placeholder="Workout notes (how did it feel?)"
            placeholderTextColor={colors.textMuted}
            defaultValue={workout.notes}
            onChangeText={setWorkoutNotes}
            multiline
            style={styles.notes}
          />
          <Button title="Discard workout" variant="danger" size="md" onPress={discard} style={{ marginTop: space.md }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <RestTimerBar />
      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title="Workout"
        actions={[
          { label: 'Add exercise', icon: 'add-circle-outline', onPress: () => router.push({ pathname: '/exercises', params: { mode: 'add' } }) },
          { label: 'Plate calculator', icon: 'disc-outline', onPress: () => router.push({ pathname: '/tools', params: { tab: 'plates' } }) },
          { label: 'Finish workout', icon: 'checkmark-done', onPress: finish },
          { label: 'Discard workout', icon: 'trash-outline', destructive: true, onPress: discard },
        ]}
      />
    </SafeAreaView>
  );
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const now = useNow(1000);
  return (
    <Row gap={6}>
      <Ionicons name="time-outline" size={16} color={colors.accent} />
      <T variant="h3" style={{ fontVariant: ['tabular-nums'] }}>
        {formatDuration((now - startedAt) / 1000)}
      </T>
    </Row>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.md, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { flex: 1, minWidth: 0, marginRight: space.sm, color: colors.text, fontFamily: fonts.bold, fontSize: 24, paddingVertical: 4 },
  notes: { marginTop: space.md, minHeight: 80, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, fontFamily: fonts.regular, fontSize: 15, padding: space.md, textAlignVertical: 'top' },
});
