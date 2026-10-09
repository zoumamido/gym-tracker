import { emptyMuscleMap, setsPerMuscle, volumeStatus, VOLUME_STATUS_LABEL, ExerciseLookup } from '../volume';
import { EXERCISE_MAP } from '../../data/exercises';
import { MUSCLES } from '../../data/muscles';
import type { Exercise, SetLog, SetType, Workout, WorkoutExercise } from '../types';

let n = 0;
const set = (weightKg: number | null, reps: number | null, o: { type?: SetType; done?: boolean } = {}): SetLog => ({
  id: `s${++n}`,
  type: o.type ?? 'normal',
  weightKg,
  reps,
  done: o.done ?? true,
});
const ex = (exerciseId: string, sets: SetLog[]): WorkoutExercise => ({ id: `e${++n}`, exerciseId, sets, repMin: 6, repMax: 10, restSec: 120 });
const workout = (id: string, start: number, exercises: WorkoutExercise[], finished = true): Workout => ({
  id,
  name: id,
  startedAt: start,
  endedAt: finished ? start + 3_600_000 : null,
  exercises,
});
const lookup: ExerciseLookup = (id) => EXERCISE_MAP[id];

const FROM = new Date(2026, 9, 5, 0, 0).getTime();
const TO = new Date(2026, 9, 12, 0, 0).getTime();
const MID = new Date(2026, 9, 7, 18, 0).getTime();

describe('emptyMuscleMap', () => {
  it('has every muscle at 0', () => {
    const m = emptyMuscleMap();
    expect(Object.keys(m).sort()).toEqual([...MUSCLES].sort());
    expect(Object.values(m).every((v) => v === 0)).toBe(true);
  });
  it('returns a fresh object each time', () => {
    const a = emptyMuscleMap();
    a.chest = 5;
    expect(emptyMuscleMap().chest).toBe(0);
  });
});

describe('setsPerMuscle', () => {
  it('primary = 1, secondary = 0.5 per working set; warm-ups excluded', () => {
    const w = workout('w', MID, [ex('bench_press', [set(40, 10, { type: 'warmup' }), set(80, 8), set(80, 8), set(80, 8), set(80, 8, { done: false })])]);
    const m = setsPerMuscle([w], lookup, FROM, TO);
    const def = EXERCISE_MAP.bench_press;
    for (const p of def.primary) expect(m[p]).toBe(3);
    for (const s of def.secondary) if (!def.primary.includes(s)) expect(m[s]).toBe(1.5);
    expect(m.quads).toBe(0);
  });
  it('a muscle listed as both primary and secondary is counted once', () => {
    const custom: Exercise = { ...EXERCISE_MAP.bench_press, id: 'c', primary: ['chest'], secondary: ['chest', 'triceps'] };
    const m = setsPerMuscle([workout('w', MID, [ex('c', [set(50, 10), set(50, 10)])])], (id) => (id === 'c' ? custom : undefined), FROM, TO);
    expect(m.chest).toBe(2);
    expect(m.triceps).toBe(1);
  });
  it('sums across workouts and exercises', () => {
    const a = workout('a', MID, [ex('bench_press', [set(80, 8), set(80, 8)])]);
    const b = workout('b', MID + 86_400_000, [ex('bench_press', [set(80, 8)])]);
    expect(setsPerMuscle([a, b], lookup, FROM, TO).chest).toBe(3);
  });
  it('window is [from, to): start included, end excluded', () => {
    const atFrom = workout('f', FROM, [ex('bench_press', [set(80, 8)])]);
    const atTo = workout('t', TO, [ex('bench_press', [set(80, 8)])]);
    const before = workout('b', FROM - 1, [ex('bench_press', [set(80, 8)])]);
    expect(setsPerMuscle([atFrom, atTo, before], lookup, FROM, TO).chest).toBe(1);
  });
  it('ignores unfinished workouts, cardio and unknown exercises', () => {
    const open = workout('o', MID, [ex('bench_press', [set(80, 8)])], false);
    const cardio = workout('c', MID, [ex('treadmill_walk', [set(null, 30)]), ex('does_not_exist', [set(10, 10)])]);
    const m = setsPerMuscle([open, cardio], lookup, FROM, TO);
    expect(Object.values(m).every((v) => v === 0)).toBe(true);
  });
  it('empty input', () => {
    expect(setsPerMuscle([], lookup, FROM, TO)).toEqual(emptyMuscleMap());
  });
});

describe('volumeStatus', () => {
  it('chest landmarks (MEV 8, MAV 12–20, MRV 22)', () => {
    expect(volumeStatus('chest', 0)).toBe('none');
    expect(volumeStatus('chest', -1)).toBe('none');
    expect(volumeStatus('chest', 0.5)).toBe('low');
    expect(volumeStatus('chest', 7.5)).toBe('low');
    expect(volumeStatus('chest', 8)).toBe('maintenance');
    expect(volumeStatus('chest', 11.5)).toBe('maintenance');
    expect(volumeStatus('chest', 12)).toBe('optimal');
    expect(volumeStatus('chest', 20)).toBe('optimal');
    expect(volumeStatus('chest', 20.5)).toBe('high');
    expect(volumeStatus('chest', 22)).toBe('high');
    expect(volumeStatus('chest', 22.5)).toBe('excessive');
  });
  it('front delts (MEV 0) treat < 1 set as low', () => {
    expect(volumeStatus('front_delts', 0.5)).toBe('low');
    expect(volumeStatus('front_delts', 1)).toBe('maintenance');
    expect(volumeStatus('front_delts', 6)).toBe('optimal');
    expect(volumeStatus('front_delts', 13)).toBe('excessive');
  });
  it("'maintenance' status is labelled 'Effective'", () => {
    expect(VOLUME_STATUS_LABEL.maintenance).toBe('Effective');
  });
  it('labels for every status', () => {
    expect(Object.keys(VOLUME_STATUS_LABEL).sort()).toEqual(['excessive', 'high', 'low', 'maintenance', 'none', 'optimal']);
  });
});
