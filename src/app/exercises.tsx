import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sheet } from '../components/Sheet';
import { Badge, Button, Chip, Field, haptic, IconButton, Row, T, Tap } from '../components/ui';
import { EQUIPMENT_LABEL } from '../data/exercises';
import { MUSCLE_GROUP, MUSCLE_LABEL, MUSCLES, MuscleGroup } from '../data/muscles';
import type { Equipment, Exercise, ExerciseKind, Muscle } from '../lib/types';
import { useAllExercises } from '../store/selectors';
import { useStore } from '../store/useStore';
import { colors, fonts, radius, space } from '../theme';

type Mode = 'browse' | 'add' | 'replace' | 'routine';
const GROUPS: (MuscleGroup | 'All' | 'Cardio')[] = ['All', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Cardio'];

export default function ExercisesScreen() {
  const params = useLocalSearchParams<{ mode?: Mode; target?: string }>();
  const mode: Mode = params.mode ?? 'browse';
  const all = useAllExercises();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('All');
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((e) => {
      if (group === 'Cardio' && e.kind !== 'cardio') return false;
      if (group !== 'All' && group !== 'Cardio' && !e.primary.some((m) => MUSCLE_GROUP[m] === group)) return false;
      if (!q) return true;
      return e.name.toLowerCase().includes(q) || e.primary.some((m) => MUSCLE_LABEL[m].toLowerCase().includes(q)) || EQUIPMENT_LABEL[e.equipment].toLowerCase().includes(q);
    });
  }, [all, query, group]);

  const pick = (ex: Exercise) => {
    const s = useStore.getState();
    haptic('selection');
    if (mode === 'add') {
      s.addExercise(ex.id);
      router.back();
    } else if (mode === 'replace' && params.target) {
      s.replaceExercise(params.target, ex.id);
      router.back();
    } else if (mode === 'routine' && params.target) {
      const routine = s.program?.routines.find((r) => r.id === params.target);
      if (routine) {
        const cardio = ex.kind === 'cardio';
        const timed = ex.kind === 'timed';
        s.upsertRoutine({
          ...routine,
          exercises: [
            ...routine.exercises,
            {
              exerciseId: ex.id,
              sets: cardio ? 1 : 3,
              repMin: cardio ? 20 : timed ? 30 : ex.category === 'compound' ? 6 : 10,
              repMax: cardio ? 30 : timed ? 60 : ex.category === 'compound' ? 10 : 15,
              restSec: cardio ? 0 : ex.category === 'compound' ? 150 : 75,
            },
          ],
        });
      }
      router.back();
    } else {
      router.push({ pathname: '/exercise/[id]', params: { id: ex.id } });
    }
  };

  const title = mode === 'add' ? 'Add exercise' : mode === 'replace' ? 'Replace with…' : mode === 'routine' ? 'Add to routine' : 'Exercise library';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Row style={{ paddingHorizontal: space.md, paddingVertical: space.xs }}>
        <IconButton icon={mode === 'browse' ? 'chevron-back' : 'close'} onPress={() => router.back()} accessibilityLabel="Close" />
        <T variant="h2" style={{ flex: 1, textAlign: 'center' }}>
          {title}
        </T>
        <IconButton icon="add" onPress={() => setCreating(true)} accessibilityLabel="Create custom exercise" />
      </Row>
      <View style={{ paddingHorizontal: space.md }}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search exercises, muscles, equipment" placeholderTextColor={colors.textMuted} style={styles.searchInput} autoCorrect={false} />
          {query ? <IconButton icon="close-circle" bg="transparent" color={colors.textMuted} size={28} onPress={() => setQuery('')} /> : null}
        </View>
      </View>
      <FlatList
        horizontal
        data={GROUPS}
        keyExtractor={(g) => g}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: space.md, paddingVertical: space.sm }}
        style={{ flexGrow: 0 }}
        renderItem={({ item }) => <Chip label={item} active={group === item} onPress={() => setGroup(item)} />}
      />
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: space.xl, gap: 8 }}>
            <T variant="h3">No exercises found</T>
            <Button title="Create custom exercise" size="md" full={false} onPress={() => setCreating(true)} />
          </View>
        }
        renderItem={({ item }) => (
          <Tap onPress={() => pick(item)} scaleTo={0.985} hapticKind={null}>
            <View style={styles.row}>
              <View style={styles.icon}>
                <T variant="h3" color={colors.primaryText}>
                  {item.name.slice(0, 1)}
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <T variant="bodyMedium">{item.name}</T>
                <T variant="caption" color={colors.textMuted} numberOfLines={1}>
                  {item.kind === 'cardio' ? 'Cardio' : item.primary.map((m) => MUSCLE_LABEL[m]).join(', ')} · {EQUIPMENT_LABEL[item.equipment]}
                </T>
              </View>
              {item.custom ? <Badge label="Custom" color={colors.accent} /> : null}
              <Ionicons name={mode === 'browse' ? 'chevron-forward' : 'add-circle'} size={mode === 'browse' ? 18 : 24} color={mode === 'browse' ? colors.textMuted : colors.primary} />
            </View>
          </Tap>
        )}
      />
      <CreateExercise
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          const ex = useStore.getState().customExercises.find((e) => e.id === id);
          if (ex && mode !== 'browse') pick(ex);
        }}
      />
    </SafeAreaView>
  );
}

function CreateExercise({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState<Muscle>('chest');
  const [equipment, setEquipment] = useState<Equipment>('dumbbell');
  const [kind, setKind] = useState<ExerciseKind>('strength');
  const save = () => {
    const n = name.trim();
    if (!n) return;
    const id = useStore.getState().addCustomExercise({
      name: n,
      primary: kind === 'cardio' ? [] : [muscle],
      secondary: [],
      equipment,
      category: 'isolation',
      kind,
      lowerBody: ['quads', 'hamstrings', 'glutes', 'calves'].includes(muscle),
      met: kind === 'cardio' ? 7 : 4,
      tips: [],
    });
    setName('');
    onClose();
    setTimeout(() => onCreated(id), 200);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="New exercise">
      <Field placeholder="Exercise name" value={name} onChangeText={setName} maxLength={40} />
      <T variant="overline" color={colors.textMuted} style={styles.label}>
        Type
      </T>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {(['strength', 'timed', 'cardio'] as ExerciseKind[]).map((k) => (
          <Chip key={k} label={k === 'strength' ? 'Weight × reps' : k === 'timed' ? 'Timed hold' : 'Cardio (min)'} active={kind === k} onPress={() => setKind(k)} />
        ))}
      </Row>
      {kind !== 'cardio' ? (
        <>
          <T variant="overline" color={colors.textMuted} style={styles.label}>
            Main muscle
          </T>
          <FlatList horizontal data={MUSCLES} keyExtractor={(m) => m} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} renderItem={({ item }) => <Chip label={MUSCLE_LABEL[item]} active={muscle === item} onPress={() => setMuscle(item)} />} />
        </>
      ) : null}
      <T variant="overline" color={colors.textMuted} style={styles.label}>
        Equipment
      </T>
      <FlatList
        horizontal
        data={Object.keys(EQUIPMENT_LABEL) as Equipment[]}
        keyExtractor={(m) => m}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item }) => <Chip label={EQUIPMENT_LABEL[item]} active={equipment === item} onPress={() => setEquipment(item)} />}
      />
      <Button title="Create exercise" onPress={save} disabled={!name.trim()} style={{ marginTop: space.lg }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, height: 48, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  label: { marginTop: space.md, marginBottom: 8 },
});
