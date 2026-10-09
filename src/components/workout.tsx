import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { MUSCLE_LABEL } from '../data/muscles';
import { formatDuration } from '../lib/dates';
import { suggestNext, incrementFor } from '../lib/progression';
import { exerciseBests } from '../lib/records';
import { exerciseHistory, previousSets } from '../lib/stats';
import { estimate1RM } from '../lib/strength';
import type { SetLog, WorkoutExercise } from '../lib/types';
import { formatNumber, parseDecimal, roundTo } from '../lib/units';
import { warmupSets } from '../lib/warmup';
import { useNow } from '../hooks/time';
import { adjustRest, beginRest, endRest } from '../services/rest';
import { useExercise } from '../store/selectors';
import { useStore } from '../store/useStore';
import { useUnits } from '../store/useUnits';
import { colors, fonts, radius, space } from '../theme';
import { ActionSheet } from './Sheet';
import { Badge, haptic, IconButton, ProgressBar, Row, T, Tap } from './ui';

const SET_TYPE_LABEL: Record<SetLog['type'], string> = { warmup: 'W', normal: '', drop: 'D', failure: 'F' };
const SET_TYPE_COLOR: Record<SetLog['type'], string> = { warmup: colors.warning, normal: colors.textDim, drop: colors.accent, failure: colors.danger };

function ExerciseCardInner({ we, index, count }: { we: WorkoutExercise; index: number; count: number }) {
  const ex = useExercise(we.exerciseId);
  const workouts = useStore((s) => s.workouts);
  const experience = useStore((s) => s.profile?.experience ?? 'intermediate');
  const { addSet, removeExercise, moveExercise, insertWarmups, updateSet, removeSet } = useStore.getState();
  const u = useUnits();
  const [menu, setMenu] = useState(false);
  const [setMenuFor, setSetMenuFor] = useState<SetLog | null>(null);
  const [rpeFor, setRpeFor] = useState<SetLog | null>(null);

  const isStrength = ex.kind === 'strength';
  const history = useMemo(() => exerciseHistory(workouts, we.exerciseId), [workouts, we.exerciseId]);
  const prev = useMemo(() => previousSets(workouts, we.exerciseId), [workouts, we.exerciseId]);
  const bests = useMemo(() => exerciseBests(workouts, we.exerciseId), [workouts, we.exerciseId]);
  const increment = incrementFor(ex, u.unit, experience);
  const suggestion = useMemo(
    () => (isStrength ? suggestNext(history, { repMin: we.repMin, repMax: we.repMax, incrementKg: increment, format: (kg) => `${u.load(kg)} ${u.unit}` }) : null),
    [history, we.repMin, we.repMax, increment, isStrength, u],
  );

  const prevWorking = prev.filter((s) => s.type !== 'warmup');
  let normalIndex = 0;
  const doneCount = we.sets.filter((s) => s.done).length;

  const placeholderFor = (s: SetLog, i: number): { weightKg: number | null; reps: number | null } => {
    if (s.type === 'warmup') return { weightKg: null, reps: null };
    const p = prevWorking[i];
    const earlier = [...we.sets.slice(0, we.sets.indexOf(s))].reverse().find((x) => x.type !== 'warmup' && x.weightKg != null);
    const weightKg = suggestion?.weightKg ?? earlier?.weightKg ?? p?.weightKg ?? null;
    const reps = suggestion ? suggestion.reps : (p?.reps ?? we.repMax);
    return { weightKg, reps };
  };

  // Round to a loadable step in the user's unit (1 kg / 2.5 lb).
  const roundLoad = (kg: number) => Math.max(0, u.fromDisplay(roundTo(u.toDisplay(kg), u.unit === 'kg' ? 1 : 2.5)));

  const addWarmups = () => {
    const firstWorking = we.sets.find((s) => s.type !== 'warmup');
    const ph = firstWorking ? placeholderFor(firstWorking, 0) : { weightKg: null };
    const target = firstWorking?.weightKg ?? ph.weightKg;
    if (!target) {
      Alert.alert('Enter a working weight first', 'Warm-ups are calculated from your first working set.');
      return;
    }
    if (ex.equipment !== 'barbell') {
      // Non-barbell: two simple ramp sets.
      insertWarmups(we.id, [
        { weightKg: roundLoad(target * 0.5), reps: 10 },
        { weightKg: roundLoad(target * 0.75), reps: 5 },
      ]);
      return;
    }
    const sets = warmupSets(target, { unit: u.unit, heavy: we.repMax <= 5 });
    if (!sets.length) {
      Alert.alert('No warm-up needed', 'Your working weight is at or below an empty bar.');
      return;
    }
    insertWarmups(we.id, sets);
  };

  const unitLabel = ex.kind === 'timed' ? 'SEC' : ex.kind === 'cardio' ? 'MIN' : 'REPS';

  return (
    <Animated.View layout={LinearTransition.springify().damping(18)} entering={FadeInDown.duration(300)} style={styles.card}>
      <Row style={{ justifyContent: 'space-between' }} align="flex-start">
        <Tap style={{ flex: 1 }} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: we.exerciseId } })} scaleTo={0.99} hapticKind="selection">
          <T variant="h3" color={colors.primaryText}>
            {ex.name}
          </T>
          <T variant="caption" color={colors.textMuted} style={{ marginTop: 2 }}>
            {ex.primary.map((m) => MUSCLE_LABEL[m]).join(' · ') || 'Cardio'}
            {isStrength ? ` · ${we.repMin === we.repMax ? we.repMin : `${we.repMin}–${we.repMax}`} reps · ${Math.round(we.restSec / 60 * 10) / 10} min rest` : ''}
          </T>
        </Tap>
        <Row gap={8}>
          {doneCount === we.sets.length && we.sets.length > 0 ? <Badge label="Done" color={colors.success} icon="checkmark" /> : null}
          <IconButton icon="ellipsis-horizontal" size={34} iconSize={18} onPress={() => setMenu(true)} accessibilityLabel="Exercise options" />
        </Row>
      </Row>

      {suggestion ? (
        <View style={styles.suggestion}>
          <Ionicons name={suggestion.kind === 'deload' || suggestion.kind === 'decrease' ? 'trending-down' : suggestion.kind === 'increase' ? 'trending-up' : 'bulb'} size={16} color={suggestion.kind === 'increase' ? colors.success : suggestion.kind === 'deload' || suggestion.kind === 'decrease' ? colors.warning : colors.primaryText} />
          <T variant="caption" color={colors.textDim} style={{ flex: 1, lineHeight: 17 }}>
            {suggestion.message}
          </T>
        </View>
      ) : null}

      <View style={styles.tableHead}>
        <T variant="overline" color={colors.textMuted} style={styles.colSet}>
          Set
        </T>
        <T variant="overline" color={colors.textMuted} style={styles.colPrev}>
          Previous
        </T>
        {isStrength ? (
          <T variant="overline" color={colors.textMuted} style={styles.colInput}>
            {u.unit}
          </T>
        ) : null}
        <T variant="overline" color={colors.textMuted} style={styles.colInput}>
          {unitLabel}
        </T>
        <View style={styles.colCheck} />
      </View>

      {we.sets.map((s, i) => {
        const label = s.type === 'normal' ? String(++normalIndex) : SET_TYPE_LABEL[s.type];
        const workIdx = s.type === 'warmup' ? -1 : normalIndex - 1;
        const p = s.type === 'warmup' ? undefined : prevWorking[workIdx];
        const ph = placeholderFor(s, Math.max(0, workIdx));
        return (
          <SetRow
            key={s.id}
            set={s}
            label={label}
            showWeight={isStrength}
            previous={p}
            placeholder={ph}
            bests={bests}
            onLongPress={() => setSetMenuFor(s)}
            onChange={(patch) => updateSet(we.id, s.id, patch)}
            onComplete={(final) => {
              updateSet(we.id, s.id, { ...final, done: true });
              const st = useStore.getState().settings;
              if (st.restTimer.autoStart) beginRest(s.type === 'warmup' ? Math.min(60, we.restSec) : we.restSec, ex.name);
            }}
            onUncomplete={() => updateSet(we.id, s.id, { done: false })}
            index={i}
          />
        );
      })}

      <Tap onPress={() => addSet(we.id)} hapticKind="light" scaleTo={0.98}>
        <View style={styles.addSet}>
          <Ionicons name="add" size={18} color={colors.textDim} />
          <T variant="bodyMedium" color={colors.textDim}>
            Add set
          </T>
        </View>
      </Tap>

      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={ex.name}
        actions={[
          ...(isStrength ? [{ label: 'Add warm-up sets', icon: 'flame-outline' as const, detail: 'Ramp-up sets based on your working weight', onPress: addWarmups }] : []),
          ...(isStrength && ex.equipment === 'barbell'
            ? [
                {
                  label: 'Plate calculator',
                  icon: 'disc-outline' as const,
                  onPress: () => {
                    const w = we.sets.find((s) => s.type !== 'warmup' && s.weightKg)?.weightKg ?? suggestion?.weightKg ?? 60;
                    router.push({ pathname: '/tools', params: { tab: 'plates', weightKg: String(w) } });
                  },
                },
              ]
            : []),
          { label: 'Add drop set', icon: 'arrow-down-circle-outline', onPress: () => addSet(we.id, 'drop') },
          { label: 'Replace exercise', icon: 'swap-horizontal', onPress: () => router.push({ pathname: '/exercises', params: { mode: 'replace', target: we.id } }) },
          ...(index > 0 ? [{ label: 'Move up', icon: 'arrow-up' as const, onPress: () => moveExercise(we.id, -1) }] : []),
          ...(index < count - 1 ? [{ label: 'Move down', icon: 'arrow-down' as const, onPress: () => moveExercise(we.id, 1) }] : []),
          {
            label: 'Remove exercise',
            icon: 'trash-outline',
            destructive: true,
            onPress: () =>
              Alert.alert('Remove exercise?', `${ex.name} and its sets will be removed from this workout.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => removeExercise(we.id) },
              ]),
          },
        ]}
      />
      <ActionSheet
        visible={!!setMenuFor}
        onClose={() => setSetMenuFor(null)}
        title="Set type"
        actions={
          setMenuFor
            ? [
                { label: 'Normal set', icon: 'ellipse-outline', onPress: () => updateSet(we.id, setMenuFor.id, { type: 'normal' }) },
                { label: 'Warm-up', icon: 'flame-outline', detail: 'Not counted in volume or records', onPress: () => updateSet(we.id, setMenuFor.id, { type: 'warmup' }) },
                { label: 'Drop set', icon: 'arrow-down-circle-outline', onPress: () => updateSet(we.id, setMenuFor.id, { type: 'drop' }) },
                { label: 'To failure', icon: 'skull-outline', onPress: () => updateSet(we.id, setMenuFor.id, { type: 'failure' }) },
                ...(isStrength
                  ? [
                      {
                        label: setMenuFor.rpe ? `RPE ${setMenuFor.rpe} — change` : 'Add RPE (effort)',
                        icon: 'speedometer-outline' as const,
                        detail: '10 = max effort, 8 = 2 reps left in the tank',
                        onPress: () => setRpeFor(setMenuFor),
                      },
                    ]
                  : []),
                { label: 'Delete set', icon: 'trash-outline', destructive: true, onPress: () => removeSet(we.id, setMenuFor.id) },
              ]
            : []
        }
      />
      <ActionSheet
        visible={!!rpeFor}
        onClose={() => setRpeFor(null)}
        title="How hard was it? (RPE)"
        actions={
          rpeFor
            ? [
                ...[10, 9.5, 9, 8.5, 8, 7, 6].map((rpe) => ({
                  label: `RPE ${rpe}`,
                  icon: (rpeFor.rpe === rpe ? 'radio-button-on' : 'radio-button-off') as 'radio-button-on' | 'radio-button-off',
                  detail: rpe === 10 ? 'Max effort — no reps left' : `${10 - rpe} rep${10 - rpe === 1 ? '' : 's'} left in the tank`,
                  onPress: () => updateSet(we.id, rpeFor.id, { rpe }),
                })),
                { label: 'Clear RPE', icon: 'close-circle-outline' as const, destructive: true, onPress: () => updateSet(we.id, rpeFor.id, { rpe: null }) },
              ]
            : []
        }
      />
    </Animated.View>
  );
}

export const ExerciseCard = React.memo(ExerciseCardInner);

function SetRow({
  set,
  label,
  showWeight,
  previous,
  placeholder,
  bests,
  onChange,
  onComplete,
  onUncomplete,
  onLongPress,
  index,
}: {
  set: SetLog;
  label: string;
  showWeight: boolean;
  previous?: SetLog;
  placeholder: { weightKg: number | null; reps: number | null };
  bests: { sessions: number; weight: number; e1rm: number };
  onChange: (patch: Partial<SetLog>) => void;
  onComplete: (final: Partial<SetLog>) => void;
  onUncomplete: () => void;
  onLongPress: () => void;
  index: number;
}) {
  const u = useUnits();
  const toText = (kg: number | null) => (kg == null ? '' : formatNumber(u.toDisplay(kg), 2));
  const [wText, setWText] = useState(toText(set.weightKg));
  const [rText, setRText] = useState(set.reps == null ? '' : String(set.reps));

  // Sync when the set changes from outside (copy previous, unit change, warm-ups), but never
  // while the text already represents the value — so typing "82." isn't snapped back to "82".
  const wKey = `${set.weightKg}|${u.unit}`;
  const [seenW, setSeenW] = useState(wKey);
  if (wKey !== seenW) {
    setSeenW(wKey);
    const typed = parseDecimal(wText);
    const same = set.weightKg == null ? wText.trim() === '' : Number.isFinite(typed) && Math.abs(u.fromDisplay(typed) - set.weightKg) < 1e-6;
    if (!same) setWText(toText(set.weightKg));
  }
  const [seenR, setSeenR] = useState(set.reps);
  if (set.reps !== seenR) {
    setSeenR(set.reps);
    if (parseInt(rText, 10) !== set.reps) setRText(set.reps == null ? '' : String(set.reps));
  }

  const isPR =
    set.done &&
    set.type !== 'warmup' &&
    bests.sessions > 0 &&
    set.weightKg != null &&
    set.reps != null &&
    set.weightKg > 0 &&
    (set.weightKg > bests.weight + 1e-6 || (bests.e1rm > 0 && estimate1RM(set.weightKg, set.reps, set.rpe).value > bests.e1rm + 1e-6));

  const prevText = previous && previous.reps != null ? (showWeight && previous.weightKg ? `${u.load(previous.weightKg)}×${previous.reps}` : `${previous.reps}`) : '—';

  const toggle = () => {
    if (set.done) {
      onUncomplete();
      haptic('light');
      return;
    }
    const weightKg = set.weightKg ?? (showWeight ? placeholder.weightKg : null);
    const reps = set.reps ?? placeholder.reps;
    if (reps == null || !(reps > 0)) {
      haptic('warning');
      return;
    }
    haptic('success');
    onComplete({ weightKg: weightKg ?? (showWeight ? 0 : null), reps });
  };

  const copyPrevious = () => {
    if (!previous || set.done) return;
    haptic('selection');
    onChange({ weightKg: previous.weightKg, reps: previous.reps });
  };

  return (
    <Animated.View entering={index > 0 ? FadeIn.duration(200) : undefined} style={[styles.row, set.done && styles.rowDone]}>
      <Tap onLongPress={onLongPress} onPress={onLongPress} hapticKind="selection" style={styles.colSet}>
        <View style={[styles.setBadge, set.type !== 'normal' && { backgroundColor: SET_TYPE_COLOR[set.type] + '22' }]}>
          <T variant="caption" color={set.type === 'normal' ? colors.text : SET_TYPE_COLOR[set.type]} style={{ fontFamily: fonts.bold }}>
            {label}
          </T>
        </View>
      </Tap>
      <Tap onPress={copyPrevious} hapticKind={null} style={styles.colPrev} scaleTo={0.95}>
        <Row gap={4}>
          <T variant="caption" color={colors.textMuted} numberOfLines={1}>
            {prevText}
          </T>
          {isPR ? <Ionicons name="trophy" size={13} color={colors.warning} /> : null}
          {set.rpe ? (
            <T variant="caption" color={colors.accent} style={{ fontSize: 10 }}>
              @{set.rpe}
            </T>
          ) : null}
        </Row>
      </Tap>
      {showWeight ? (
        <TextInput
          style={[styles.input, set.done && styles.inputDone]}
          value={wText}
          onChangeText={(t) => {
            setWText(t);
            const v = parseDecimal(t);
            onChange({ weightKg: t.trim() === '' ? null : Number.isFinite(v) && v >= 0 ? u.fromDisplay(v) : set.weightKg });
          }}
          placeholder={placeholder.weightKg != null ? formatNumber(u.toDisplay(placeholder.weightKg), 2) : '–'}
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          selectTextOnFocus
          editable={!set.done}
          maxLength={6}
        />
      ) : null}
      <TextInput
        style={[styles.input, set.done && styles.inputDone]}
        value={rText}
        onChangeText={(t) => {
          setRText(t);
          const v = parseInt(t, 10);
          onChange({ reps: t.trim() === '' ? null : Number.isFinite(v) && v >= 0 ? v : set.reps });
        }}
        placeholder={placeholder.reps != null ? String(placeholder.reps) : '–'}
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        selectTextOnFocus
        editable={!set.done}
        maxLength={4}
      />
      <Tap
        onPress={toggle}
        hapticKind={null}
        style={styles.colCheck}
        scaleTo={0.85}
        accessibilityLabel={`${set.done ? 'Undo' : 'Complete'} set ${label || set.type}`}
        accessibilityState={{ checked: set.done }}
      >
        <View style={[styles.check, set.done && styles.checkDone]}>
          <Ionicons name="checkmark" size={18} color={set.done ? '#05210F' : colors.textMuted} />
        </View>
      </Tap>
    </Animated.View>
  );
}

// ---------- Rest timer ----------

export function RestTimerBar() {
  const timer = useStore((s) => s.restTimer);
  // Expiry (vibration + clearing) is handled app-wide by useRestWatcher.
  const now = useNow(250, !!timer);
  const remaining = timer ? Math.ceil((timer.endsAt - now) / 1000) : 0;
  if (!timer || remaining <= 0) return null;
  const progress = 1 - remaining / timer.durationSec;
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.rest}>
      <Row gap={12}>
        <View style={{ flex: 1 }}>
          <T variant="overline" color={colors.textMuted}>
            Rest · {timer.label}
          </T>
          <T variant="number" style={{ fontSize: 30, lineHeight: 36 }}>
            {formatDuration(remaining)}
          </T>
        </View>
        <Tap onPress={() => adjustRest(-15)} hapticKind="selection">
          <View style={styles.restBtn}>
            <T variant="bodyMedium">−15</T>
          </View>
        </Tap>
        <Tap onPress={() => adjustRest(15)} hapticKind="selection">
          <View style={styles.restBtn}>
            <T variant="bodyMedium">+15</T>
          </View>
        </Tap>
        <Tap onPress={endRest} hapticKind="light">
          <View style={[styles.restBtn, { backgroundColor: colors.primary }]}>
            <T variant="bodyMedium" color="#fff">
              Skip
            </T>
          </View>
        </Tap>
      </Row>
      <View style={{ marginTop: 10 }}>
        <ProgressBar value={progress} color={colors.accent} height={6} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.sm },
  suggestion: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10, marginTop: space.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm, marginBottom: 4, paddingHorizontal: 2 },
  colSet: { width: 40 },
  colPrev: { flex: 1, paddingRight: 6 },
  colInput: { width: 70, textAlign: 'center', marginHorizontal: 4 },
  colCheck: { width: 44, alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 2, borderRadius: radius.sm },
  rowDone: { backgroundColor: 'rgba(52, 211, 153, 0.08)' },
  setBadge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt },
  input: { width: 70, height: 40, marginHorizontal: 4, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 16, padding: 0 },
  inputDone: { backgroundColor: 'transparent', borderColor: 'transparent' },
  check: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: colors.success },
  addSet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, marginTop: 6, borderRadius: radius.sm, backgroundColor: colors.surface },
  rest: { position: 'absolute', left: 12, right: 12, bottom: 12, backgroundColor: colors.elevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: space.md },
  restBtn: { height: 44, minWidth: 52, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
});
