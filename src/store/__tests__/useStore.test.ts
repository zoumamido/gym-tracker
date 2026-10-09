import { DEFAULT_SETTINGS, exportData, useStore } from '../useStore';
import type { Profile, Program, Routine, Settings } from '../../lib/types';

const NOW = new Date(2026, 9, 9, 10, 0);
const TODAY = '2026-10-09';

const profile: Profile = {
  name: 'Test',
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  goalWeightKg: 75,
  bodyFatPct: null,
  waistCm: 85,
  neckCm: 38,
  hipCm: null,
  activity: 'moderate',
  goal: 'lose',
  pace: 'moderate',
  experience: 'intermediate',
  trainingGoal: 'hypertrophy',
  daysPerWeek: 3,
  equipment: 'gym',
  sessionMinutes: 60,
};

const routineA: Routine = {
  id: 'rA',
  name: 'Push',
  focus: 'chest',
  exercises: [
    { exerciseId: 'bench', sets: 3, repMin: 6, repMax: 10, restSec: 150 },
    { exerciseId: 'ohp', sets: 0, repMin: 8, repMax: 12, restSec: 90 },
  ],
};
const routineB: Routine = { id: 'rB', name: 'Pull', focus: 'back', exercises: [] };

const makeProgram = (): Program => ({
  id: 'p1',
  name: 'PPL',
  description: '',
  daysPerWeek: 3,
  schedule: [null, 'rA', null, 'rB', null, 'rA', null],
  routines: [routineA, routineB],
  createdAt: 0,
});

const S = () => useStore.getState();

function resetStore() {
  S().resetAll();
  useStore.setState({ hydrated: true });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  resetStore();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('onboarding / profile / settings', () => {
  it('completeOnboarding sets profile, program and seeds a weigh-in for today', () => {
    S().completeOnboarding(profile, makeProgram());
    expect(S().onboarded).toBe(true);
    expect(S().profile).toEqual(profile);
    expect(S().program?.id).toBe('p1');
    expect(S().weighIns).toEqual([{ date: TODAY, weightKg: 80 }]);
  });

  it('completeOnboarding keeps existing weigh-ins', () => {
    S().logWeight(90, '2026-10-01');
    S().completeOnboarding(profile, makeProgram());
    expect(S().weighIns).toEqual([{ date: '2026-10-01', weightKg: 90 }]);
  });

  it('updateProfile is a no-op without profile and merges with one', () => {
    S().updateProfile({ age: 40 });
    expect(S().profile).toBeNull();
    S().completeOnboarding(profile, makeProgram());
    S().updateProfile({ age: 40 });
    expect(S().profile).toEqual({ ...profile, age: 40 });
  });

  it('updateSettings shallow-merges', () => {
    S().updateSettings({ unit: 'lb', haptics: false });
    expect(S().settings.unit).toBe('lb');
    expect(S().settings.haptics).toBe(false);
    expect(S().settings.water).toEqual(DEFAULT_SETTINGS.water);
  });
});

describe('program / routines', () => {
  beforeEach(() => S().setProgram(makeProgram()));

  it('upsertRoutine is a no-op without program', () => {
    S().resetAll();
    S().upsertRoutine(routineA);
    expect(S().program).toBeNull();
  });

  it('upsertRoutine replaces existing and appends new', () => {
    S().upsertRoutine({ ...routineA, name: 'Push 2' });
    expect(S().program!.routines.map((r) => r.name)).toEqual(['Push 2', 'Pull']);
    S().upsertRoutine({ id: 'rC', name: 'Legs', focus: 'legs', exercises: [] });
    expect(S().program!.routines.map((r) => r.id)).toEqual(['rA', 'rB', 'rC']);
  });

  it('deleteRoutine removes routine and clears its schedule slots', () => {
    S().deleteRoutine('rA');
    expect(S().program!.routines.map((r) => r.id)).toEqual(['rB']);
    expect(S().program!.schedule).toEqual([null, null, null, 'rB', null, null, null]);
  });

  it('setScheduleDay validates bounds and recounts daysPerWeek', () => {
    const before = S().program;
    S().setScheduleDay(-1, 'rB');
    S().setScheduleDay(7, 'rB');
    expect(S().program).toBe(before);
    S().setScheduleDay(0, 'rB');
    expect(S().program!.schedule[0]).toBe('rB');
    expect(S().program!.daysPerWeek).toBe(4);
    S().setScheduleDay(1, null);
    S().setScheduleDay(5, null);
    expect(S().program!.daysPerWeek).toBe(2);
  });
});

describe('workout lifecycle', () => {
  beforeEach(() => S().setProgram(makeProgram()));

  const we = (i = 0) => S().activeWorkout!.exercises[i];

  it('startWorkout from routine creates exercises and sets (min 1 set)', () => {
    S().startWorkout('rA');
    const w = S().activeWorkout!;
    expect(w.name).toBe('Push');
    expect(w.routineId).toBe('rA');
    expect(w.startedAt).toBe(NOW.getTime());
    expect(w.endedAt).toBeNull();
    expect(w.exercises.map((e) => e.exerciseId)).toEqual(['bench', 'ohp']);
    expect(w.exercises[0].sets).toHaveLength(3);
    expect(w.exercises[1].sets).toHaveLength(1);
    expect(w.exercises[0]).toMatchObject({ repMin: 6, repMax: 10, restSec: 150 });
    expect(w.exercises[0].sets[0]).toMatchObject({ type: 'normal', weightKg: null, reps: null, done: false, completedAt: null });
  });

  it('startWorkout without routine (or unknown id) creates a quick workout', () => {
    S().startWorkout('nope');
    expect(S().activeWorkout).toMatchObject({ name: 'Quick workout', routineId: null, exercises: [] });
  });

  it('second startWorkout is a no-op while active', () => {
    S().startWorkout('rA');
    const first = S().activeWorkout;
    S().startWorkout('rB');
    expect(S().activeWorkout).toBe(first);
  });

  it('edits are no-ops without active workout', () => {
    S().addExercise('bench');
    S().renameWorkout('x');
    expect(S().activeWorkout).toBeNull();
  });

  it('renameWorkout trims and ignores blank names; setWorkoutNotes', () => {
    S().startWorkout();
    S().renameWorkout('  Leg day ');
    expect(S().activeWorkout!.name).toBe('Leg day');
    S().renameWorkout('   ');
    expect(S().activeWorkout!.name).toBe('Leg day');
    S().setWorkoutNotes('good');
    expect(S().activeWorkout!.notes).toBe('good');
  });

  it('addExercise adds with 3 empty sets and defaults', () => {
    S().startWorkout();
    S().addExercise('squat');
    expect(we()).toMatchObject({ exerciseId: 'squat', repMin: 8, repMax: 12, restSec: 120 });
    expect(we().sets).toHaveLength(3);
  });

  it('removeExercise removes by id', () => {
    S().startWorkout('rA');
    S().removeExercise(we(0).id);
    expect(S().activeWorkout!.exercises.map((e) => e.exerciseId)).toEqual(['ohp']);
  });

  const isFresh = (s: { type: string; weightKg: number | null; reps: number | null; done: boolean }) =>
    s.type === 'normal' && s.weightKg === null && s.reps === null && s.done === false;

  it('replaceExercise with nothing done swaps in place with fresh non-warmup-count sets', () => {
    S().startWorkout('rA');
    const e = we(0);
    S().insertWarmups(e.id, [{ weightKg: 20, reps: 10 }]);
    S().updateSet(e.id, we(0).sets[1].id, { weightKg: 100, reps: 5 }); // typed but not done
    const oldIds = we(0).sets.map((s) => s.id);
    S().replaceExercise(e.id, 'incline');
    const exs = S().activeWorkout!.exercises;
    expect(exs).toHaveLength(2);
    expect(exs[0]).toMatchObject({ id: e.id, exerciseId: 'incline', repMin: 6, repMax: 10, restSec: 150 });
    expect(exs[0].sets).toHaveLength(3); // 3 normal sets, warmup not counted
    expect(exs[0].sets.every(isFresh)).toBe(true);
    expect(exs[0].sets.some((s) => oldIds.includes(s.id))).toBe(false);
  });

  it('replaceExercise with only warmups / no sets yields at least 1 set', () => {
    S().startWorkout('rA');
    const e = we(0);
    e.sets.forEach((s) => S().removeSet(e.id, s.id));
    S().replaceExercise(e.id, 'incline');
    expect(we(0).sets).toHaveLength(1);
    S().insertWarmups(e.id, [{ weightKg: 20, reps: 10 }]);
    S().removeSet(e.id, we(0).sets[1].id);
    expect(we(0).sets.map((s) => s.type)).toEqual(['warmup']);
    S().replaceExercise(e.id, 'dips');
    expect(we(0).sets).toHaveLength(1);
    expect(isFresh(we(0).sets[0])).toBe(true);
  });

  it('replaceExercise with done sets keeps them and inserts a new entry right after', () => {
    S().startWorkout('rA');
    const [e, other] = S().activeWorkout!.exercises;
    S().insertWarmups(e.id, [{ weightKg: 20, reps: 10 }, { weightKg: 40, reps: 5 }]);
    const sets = we(0).sets; // [wu, wu, n, n, n]
    S().updateSet(e.id, sets[0].id, { done: true }); // done warmup
    S().updateSet(e.id, sets[2].id, { weightKg: 100, reps: 5, done: true });
    S().replaceExercise(e.id, 'incline');
    const exs = S().activeWorkout!.exercises;
    expect(exs.map((x) => x.exerciseId)).toEqual(['bench', 'incline', 'ohp']);
    expect(exs[0].id).toBe(e.id);
    expect(exs[0].sets.map((s) => s.id)).toEqual([sets[0].id, sets[2].id]);
    expect(exs[1].id).not.toBe(e.id);
    expect(exs[1].id).not.toBe(other.id);
    expect(exs[1]).toMatchObject({ repMin: 6, repMax: 10, restSec: 150 });
    expect(exs[1].sets).toHaveLength(2); // 2 undone non-warmup sets
    expect(exs[1].sets.every(isFresh)).toBe(true);
    expect(exs[2].id).toBe(other.id);
  });

  it('replaceExercise with all non-warmup sets done gives the new entry 3 sets', () => {
    S().startWorkout('rA');
    const e = we(0);
    e.sets.forEach((s) => S().updateSet(e.id, s.id, { reps: 5, done: true }));
    S().replaceExercise(e.id, 'incline');
    const exs = S().activeWorkout!.exercises;
    expect(exs[0].sets).toHaveLength(3);
    expect(exs[1].exerciseId).toBe('incline');
    expect(exs[1].sets).toHaveLength(3);
  });

  it('replaceExercise with unknown id is a no-op', () => {
    S().startWorkout('rA');
    const w = S().activeWorkout;
    S().replaceExercise('missing', 'x');
    expect(S().activeWorkout!.exercises).toBe(w!.exercises);
  });

  it('moveExercise swaps and respects bounds', () => {
    S().startWorkout('rA');
    const [a, b] = S().activeWorkout!.exercises;
    const w0 = S().activeWorkout;
    S().moveExercise(a.id, -1);
    S().moveExercise(b.id, 1);
    S().moveExercise('missing', 1);
    expect(S().activeWorkout!.exercises.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(S().activeWorkout).toBe(w0);
    S().moveExercise(a.id, 1);
    expect(S().activeWorkout!.exercises.map((e) => e.id)).toEqual([b.id, a.id]);
    S().moveExercise(a.id, -1);
    expect(S().activeWorkout!.exercises.map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it('addSet copies weight/reps from last non-warmup set', () => {
    S().startWorkout();
    S().addExercise('bench');
    const e = we();
    S().updateSet(e.id, e.sets[2].id, { weightKg: 60, reps: 8 });
    S().insertWarmups(e.id, [{ weightKg: 20, reps: 10 }]);
    // warmups are prepended; last non-warmup is still sets[last]
    S().addSet(e.id);
    const sets = we().sets;
    expect(sets[sets.length - 1]).toMatchObject({ type: 'normal', weightKg: 60, reps: 8, done: false, rpe: null });
    S().addSet(e.id, 'drop');
    expect(we().sets[we().sets.length - 1]).toMatchObject({ type: 'drop', weightKg: 60, reps: 8 });
  });

  it('addSet with only warmups yields empty set', () => {
    S().startWorkout();
    S().addExercise('bench');
    const e = we();
    e.sets.forEach((s) => S().removeSet(e.id, s.id));
    expect(we().sets).toHaveLength(0);
    S().insertWarmups(e.id, [{ weightKg: 20, reps: 10 }]);
    S().addSet(e.id);
    expect(we().sets[1]).toMatchObject({ type: 'normal', weightKg: null, reps: null });
  });

  it('insertWarmups replaces undone warmups but keeps done ones', () => {
    S().startWorkout();
    S().addExercise('bench');
    const id = we().id;
    S().insertWarmups(id, [
      { weightKg: 20, reps: 10 },
      { weightKg: 40, reps: 5 },
    ]);
    expect(we().sets.map((s) => s.type)).toEqual(['warmup', 'warmup', 'normal', 'normal', 'normal']);
    S().updateSet(id, we().sets[0].id, { done: true });
    S().insertWarmups(id, [{ weightKg: 50, reps: 3 }]);
    const sets = we().sets;
    expect(sets.map((s) => [s.type, s.weightKg])).toEqual([
      ['warmup', 50],
      ['warmup', 20],
      ['normal', null],
      ['normal', null],
      ['normal', null],
    ]);
    expect(sets[1].done).toBe(true);
  });

  it('updateSet sets completedAt on done and clears on undo', () => {
    S().startWorkout('rA');
    const e = we();
    S().updateSet(e.id, e.sets[0].id, { done: true });
    expect(we().sets[0].completedAt).toBe(NOW.getTime());
    jest.setSystemTime(NOW.getTime() + 5000);
    S().updateSet(e.id, e.sets[0].id, { done: true });
    expect(we().sets[0].completedAt).toBe(NOW.getTime()); // not re-stamped
    S().updateSet(e.id, e.sets[0].id, { done: false });
    expect(we().sets[0].completedAt).toBeNull();
    S().updateSet(e.id, e.sets[0].id, { reps: 7 });
    expect(we().sets[0]).toMatchObject({ reps: 7, done: false, completedAt: null });
  });

  it('removeSet removes by id', () => {
    S().startWorkout('rA');
    const e = we();
    S().removeSet(e.id, e.sets[1].id);
    expect(we().sets.map((s) => s.id)).toEqual([e.sets[0].id, e.sets[2].id]);
  });

  it('finishWorkout drops undone/empty sets and empty exercises, stores bodyweight from latest weigh-in', () => {
    S().completeOnboarding(profile, makeProgram());
    S().logWeight(79, '2026-10-08');
    S().logWeight(81, '2026-10-01');
    S().startWorkout('rA');
    const e = we(0);
    S().updateSet(e.id, e.sets[0].id, { weightKg: 100, reps: 5, done: true });
    S().updateSet(e.id, e.sets[1].id, { weightKg: 100, reps: 0, done: true });
    S().updateSet(e.id, e.sets[2].id, { weightKg: 100, reps: 5 }); // not done
    S().startRest(60, 'x');
    jest.setSystemTime(NOW.getTime() + 3600_000);
    const id = S().finishWorkout();
    expect(id).toBeTruthy();
    expect(S().activeWorkout).toBeNull();
    expect(S().restTimer).toBeNull();
    const w = S().workouts[0];
    expect(w.id).toBe(id);
    expect(w.exercises).toHaveLength(1);
    expect(w.exercises[0].sets).toHaveLength(1);
    expect(w.exercises[0].sets[0].reps).toBe(5);
    expect(w.endedAt).toBe(NOW.getTime() + 3600_000);
    expect(w.bodyweightKg).toBe(80); // today's weigh-in (2026-10-09) is latest
  });

  it('finishWorkout falls back to profile weight, then null', () => {
    S().startWorkout('rA');
    let e = we(0);
    S().updateSet(e.id, e.sets[0].id, { reps: 5, done: true });
    S().finishWorkout();
    expect(S().workouts[0].bodyweightKg).toBeNull();

    S().completeOnboarding(profile, makeProgram());
    useStore.setState({ weighIns: [] });
    S().startWorkout('rA');
    e = we(0);
    S().updateSet(e.id, e.sets[0].id, { reps: 5, done: true });
    S().finishWorkout();
    expect(S().workouts[1].bodyweightKg).toBe(80);
  });

  it('finishWorkout returns null and clears when nothing done', () => {
    S().startWorkout('rA');
    S().startRest(30, 'x');
    expect(S().finishWorkout()).toBeNull();
    expect(S().activeWorkout).toBeNull();
    expect(S().restTimer).toBeNull();
    expect(S().workouts).toEqual([]);
    expect(S().finishWorkout()).toBeNull();
  });

  it('discardWorkout and deleteWorkout', () => {
    S().startWorkout('rA');
    S().startRest(30, 'x');
    S().discardWorkout();
    expect(S().activeWorkout).toBeNull();
    expect(S().restTimer).toBeNull();
    useStore.setState({ workouts: [{ id: 'w1', name: 'a', startedAt: 0, exercises: [] }, { id: 'w2', name: 'b', startedAt: 0, exercises: [] }] });
    S().deleteWorkout('w1');
    expect(S().workouts.map((w) => w.id)).toEqual(['w2']);
  });
});

describe('body tracking', () => {
  it('logWeight validates input', () => {
    for (const v of [0, -5, 501, NaN, Infinity]) S().logWeight(v);
    expect(S().weighIns).toEqual([]);
    S().logWeight(500);
    expect(S().weighIns).toEqual([{ date: TODAY, weightKg: 500 }]);
  });

  it('logWeight keeps one entry per day and stays sorted', () => {
    S().logWeight(80, '2026-10-05');
    S().logWeight(82, '2026-10-01');
    S().logWeight(81, '2026-10-03');
    S().logWeight(79, '2026-10-03');
    expect(S().weighIns).toEqual([
      { date: '2026-10-01', weightKg: 82 },
      { date: '2026-10-03', weightKg: 79 },
      { date: '2026-10-05', weightKg: 80 },
    ]);
    S().deleteWeighIn('2026-10-03');
    expect(S().weighIns.map((w) => w.date)).toEqual(['2026-10-01', '2026-10-05']);
  });

  it('addWater validates and groups by local day', () => {
    for (const v of [0, -1, 5001, NaN]) S().addWater(v);
    expect(S().water).toEqual({});
    S().addWater(250);
    S().addWater(5000);
    S().addWater(300, new Date(2026, 9, 8, 23, 59));
    expect(S().water[TODAY].map((e) => e.ml)).toEqual([250, 5000]);
    expect(S().water[TODAY][0].at).toBe(NOW.getTime());
    expect(S().water['2026-10-08'].map((e) => e.ml)).toEqual([300]);
  });

  it('removeWater removes entry; unknown date yields empty list', () => {
    S().addWater(250);
    S().addWater(300);
    const [a, b] = S().water[TODAY];
    S().removeWater(TODAY, a.id);
    expect(S().water[TODAY]).toEqual([b]);
    S().removeWater('2020-01-01', 'x');
    expect(S().water['2020-01-01']).toEqual([]);
  });

  it('addMeasurement sorts, replaces same date and updates profile from latest', () => {
    S().completeOnboarding(profile, makeProgram());
    S().addMeasurement({ date: '2026-10-05', waistCm: 84, bodyFatPct: 18 });
    S().addMeasurement({ date: '2026-10-01', waistCm: 90, hipCm: 99 });
    expect(S().measurements.map((m) => m.date)).toEqual(['2026-10-01', '2026-10-05']);
    expect(S().profile).toMatchObject({ waistCm: 84, neckCm: 38, hipCm: null, bodyFatPct: 18 });
    S().addMeasurement({ date: '2026-10-05', waistCm: 83 });
    expect(S().measurements).toHaveLength(2);
    expect(S().profile).toMatchObject({ waistCm: 83, bodyFatPct: 18 });
  });

  it('addMeasurement without profile keeps profile null', () => {
    S().addMeasurement({ date: TODAY, waistCm: 80 });
    expect(S().profile).toBeNull();
    expect(S().measurements).toHaveLength(1);
  });

  it('addCustomExercise returns id and flags custom', () => {
    const id = S().addCustomExercise({
      name: 'Thing', primary: ['chest'], secondary: [], equipment: 'cable', category: 'isolation', kind: 'strength', lowerBody: false, met: 3, tips: [],
    });
    expect(id.startsWith('custom_')).toBe(true);
    expect(S().customExercises[0]).toMatchObject({ id, custom: true, name: 'Thing' });
  });
});

describe('rest timer', () => {
  it('startRest ignores non-positive and sets endsAt', () => {
    S().startRest(0, 'x');
    S().startRest(-3, 'x');
    expect(S().restTimer).toBeNull();
    S().startRest(90, 'Bench');
    expect(S().restTimer).toEqual({ endsAt: NOW.getTime() + 90_000, durationSec: 90, label: 'Bench' });
  });

  it('adjustRest extends/shortens and clears when it would end in the past', () => {
    S().adjustRest(30);
    expect(S().restTimer).toBeNull();
    S().startRest(60, 'x');
    S().adjustRest(30);
    expect(S().restTimer).toMatchObject({ endsAt: NOW.getTime() + 90_000, durationSec: 90 });
    jest.setSystemTime(NOW.getTime() + 50_000);
    S().adjustRest(-30);
    expect(S().restTimer).toMatchObject({ endsAt: NOW.getTime() + 60_000, durationSec: 60 });
    S().adjustRest(-10);
    expect(S().restTimer).toBeNull();
  });

  it('adjustRest keeps durationSec >= 1', () => {
    S().startRest(10, 'x');
    useStore.setState({ restTimer: { endsAt: NOW.getTime() + 100_000, durationSec: 10, label: 'x' } });
    S().adjustRest(-20);
    expect(S().restTimer!.durationSec).toBe(1);
  });

  it('stopRest clears', () => {
    S().startRest(10, 'x');
    S().stopRest();
    expect(S().restTimer).toBeNull();
  });
});

describe('reset / import / export', () => {
  it('resetAll restores initial data but keeps actions', () => {
    S().completeOnboarding(profile, makeProgram());
    S().addWater(200);
    S().resetAll();
    expect(S()).toMatchObject({ onboarded: false, profile: null, program: null, weighIns: [], water: {}, settings: DEFAULT_SETTINGS });
    expect(typeof S().logWeight).toBe('function');
  });

  it('importData replaces data and merges default settings', () => {
    S().addWater(200);
    S().importData({ onboarded: true, profile, settings: { unit: 'lb' } as Settings });
    expect(S().onboarded).toBe(true);
    expect(S().water).toEqual({});
    expect(S().settings).toEqual({ ...DEFAULT_SETTINGS, unit: 'lb' });
    S().importData({});
    expect(S().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('importData deep-merges nested settings missing keys (like persist merge)', () => {
    S().importData({ settings: { water: { remindersEnabled: false } } as unknown as Settings });
    expect(S().settings.water).toEqual({ ...DEFAULT_SETTINGS.water, remindersEnabled: false });
    expect(S().settings.workoutReminder).toEqual(DEFAULT_SETTINGS.workoutReminder);
    expect(S().settings.restTimer).toEqual(DEFAULT_SETTINGS.restTimer);
  });

  it('importData forces restTimer to null', () => {
    S().startRest(60, 'x');
    S().importData({ restTimer: { endsAt: Date.now() + 1e6, durationSec: 60, label: 'y' } });
    expect(S().restTimer).toBeNull();
  });

  it('exportData omits restTimer and actions', () => {
    S().startRest(30, 'x');
    const d = exportData();
    expect(d.restTimer).toBeNull();
    expect(Object.values(d).some((v) => typeof v === 'function')).toBe(false);
    expect('hydrated' in d).toBe(false);
  });
});

describe('persist config', () => {
  const opts = () => useStore.persist.getOptions();

  it('partialize excludes hydrated and actions', () => {
    S().completeOnboarding(profile, makeProgram());
    const p = opts().partialize!(S()) as Record<string, unknown>;
    expect('hydrated' in p).toBe(false);
    expect(Object.values(p).some((v) => typeof v === 'function')).toBe(false);
    expect(Object.keys(p).sort()).toEqual(
      ['onboarded', 'profile', 'settings', 'program', 'workouts', 'activeWorkout', 'weighIns', 'water', 'measurements', 'customExercises', 'restTimer'].sort(),
    );
    expect(p.profile).toEqual(profile);
  });

  it('merge deep-merges nested settings when persisted data lacks new keys', () => {
    const persisted = {
      onboarded: true,
      settings: { unit: 'lb', water: { remindersEnabled: false, startHour: 9 }, workoutReminder: { enabled: false } },
    };
    const merged = opts().merge!(persisted, S()) as ReturnType<typeof S>;
    expect(merged.onboarded).toBe(true);
    expect(merged.settings).toEqual({
      ...DEFAULT_SETTINGS,
      unit: 'lb',
      water: { ...DEFAULT_SETTINGS.water, remindersEnabled: false, startHour: 9 },
      workoutReminder: { ...DEFAULT_SETTINGS.workoutReminder, enabled: false },
    });
    expect(typeof merged.logWeight).toBe('function');
  });

  it('merge handles undefined persisted state', () => {
    const merged = opts().merge!(undefined, S()) as ReturnType<typeof S>;
    expect(merged.settings).toEqual(DEFAULT_SETTINGS);
    expect(merged.hydrated).toBe(true);
  });

  it('uses versioned storage key', () => {
    expect(opts().name).toBe('gym-tracker-v1');
    expect(opts().version).toBe(1);
  });
});
