import { detectPRs, exerciseBests, PR_LABEL } from '../records';
import type { SetLog, SetType, Workout, WorkoutExercise } from '../types';

let n = 0;
const set = (weightKg: number | null, reps: number | null, o: { type?: SetType; done?: boolean; rpe?: number | null } = {}): SetLog => ({
  id: `s${++n}`,
  type: o.type ?? 'normal',
  weightKg,
  reps,
  rpe: o.rpe ?? null,
  done: o.done ?? true,
});
const ex = (exerciseId: string, sets: SetLog[]): WorkoutExercise => ({ id: `e${++n}`, exerciseId, sets, repMin: 6, repMax: 10, restSec: 120 });
const workout = (id: string, day: number, exercises: WorkoutExercise[], finished = true): Workout => {
  const start = new Date(2026, 8, day, 18).getTime();
  return { id, name: id, startedAt: start, endedAt: finished ? start + 3_600_000 : null, exercises };
};

const e1 = (w: number, r: number) => (w * (1 + r / 30) + (w * 36) / (37 - r)) / 2;

const W1 = workout('w1', 1, [ex('bench_press', [set(40, 10, { type: 'warmup' }), set(80, 8), set(80, 8), set(80, 7)])]);
const W2 = workout('w2', 3, [ex('bench_press', [set(82.5, 6), set(82.5, 6), set(82.5, 6)]), ex('squat', [set(100, 5)])]);
const W3 = workout('w3', 5, [ex('bench_press', [set(85, 5, { rpe: 8 }), set(85, 5, { rpe: 8 }), set(85, 5, { rpe: 8 })])]);

describe('exerciseBests', () => {
  it('aggregates all-time bests across finished workouts', () => {
    const b = exerciseBests([W1, W2, W3], 'bench_press');
    expect(b.sessions).toBe(3);
    expect(b.weight).toBe(85);
    expect(b.e1rm).toBeCloseTo(85 / 0.811, 6);
    expect(b.volume).toBe(1840);
    expect(b.reps).toBe(8);
  });
  it('warm-ups and unfinished sets are ignored', () => {
    const w = workout('w', 1, [ex('bench_press', [set(200, 1, { type: 'warmup' }), set(150, 1, { done: false }), set(60, 5)])]);
    const b = exerciseBests([w], 'bench_press');
    expect(b.weight).toBe(60);
    expect(b.volume).toBe(300);
  });
  it('skips unfinished workouts and excluded id', () => {
    const open = workout('open', 9, [ex('bench_press', [set(200, 5)])], false);
    expect(exerciseBests([W1, open], 'bench_press').weight).toBe(80);
    expect(exerciseBests([W1, W3], 'bench_press', 'w3').weight).toBe(80);
  });
  it('e1rm counts 13–15 rep sets (Wathan) but not > 15 reps', () => {
    const w15 = workout('w', 1, [ex('bench_press', [set(50, 15)])]);
    expect(exerciseBests([w15], 'bench_press').e1rm).toBeCloseTo(5000 / (48.8 + 53.8 * Math.exp(-0.075 * 15)), 6);
    const w13 = workout('w', 1, [ex('bench_press', [set(50, 13)])]);
    expect(exerciseBests([w13], 'bench_press').e1rm).toBeCloseTo(5000 / (48.8 + 53.8 * Math.exp(-0.075 * 13)), 6);
    const w25 = workout('w', 1, [ex('bench_press', [set(50, 25)])]);
    const b = exerciseBests([w25], 'bench_press');
    expect(b.e1rm).toBe(0);
    expect(b.reps).toBe(25);
    expect(b.volume).toBe(1250);
  });
  it('a high-rep set does not produce an e1rm PR but can produce a volume PR', () => {
    const base = workout('b', 1, [ex('bench_press', [set(60, 10)])]);
    const hi = workout('h', 3, [ex('bench_press', [set(40, 25), set(40, 25)])]);
    const prs = detectPRs(hi, [base, hi]);
    expect(prs.map((p) => p.type)).toEqual(['volume']);
  });
  it('empty for unknown exercise', () => {
    expect(exerciseBests([W1], 'nope')).toEqual({ sessions: 0, weight: 0, e1rm: 0, volume: 0, reps: 0 });
  });
  it('volume sums the same exercise logged twice in one workout', () => {
    const w = workout('w', 1, [ex('bench_press', [set(60, 10)]), ex('bench_press', [set(60, 10)])]);
    const b = exerciseBests([w], 'bench_press');
    expect(b.volume).toBe(1200);
    expect(b.sessions).toBe(1);
  });
});

describe('detectPRs', () => {
  it('first ever session is a baseline, not a PR', () => {
    expect(detectPRs(W1, [W1])).toEqual([]);
    expect(detectPRs(W1, [])).toEqual([]);
    // squat appears first in W2 -> no squat PR
    expect(detectPRs(W2, [W1, W2]).filter((p) => p.exerciseId === 'squat')).toEqual([]);
  });
  it('weight PR without e1rm/volume PR', () => {
    const prs = detectPRs(W2, [W1, W2, W3]);
    expect(prs).toEqual([{ exerciseId: 'bench_press', type: 'weight', value: 82.5, previous: 80 }]);
  });
  it('weight + e1rm PR', () => {
    const prs = detectPRs(W3, [W1, W2, W3]);
    expect(prs.map((p) => p.type).sort()).toEqual(['e1rm', 'weight']);
    const e = prs.find((p) => p.type === 'e1rm')!;
    expect(e.value).toBeCloseTo(85 / 0.811, 6);
    expect(e.previous).toBeCloseTo(e1(80, 8), 6);
    expect(prs.find((p) => p.type === 'weight')!.previous).toBe(82.5);
  });
  it('volume PR at the same weight', () => {
    const w = workout('w4', 7, [ex('bench_press', [set(80, 8), set(80, 8), set(80, 8)])]);
    const prs = detectPRs(w, [W1, w]);
    // same top weight and same best set -> only volume (1920 > 1840)
    expect(prs.map((p) => p.type)).toEqual(['volume']);
    expect(prs.find((p) => p.type === 'volume')).toEqual({ exerciseId: 'bench_press', type: 'volume', value: 1920, previous: 1840 });
  });
  it('matching (not beating) a record is not a PR', () => {
    const same = workout('w4', 7, [ex('bench_press', [set(80, 8), set(80, 8), set(80, 7)])]);
    expect(detectPRs(same, [W1, same])).toEqual([]);
  });
  it('warm-up sets cannot set a weight PR', () => {
    const w = workout('w4', 7, [ex('bench_press', [set(120, 1, { type: 'warmup' }), set(70, 5)])]);
    expect(detectPRs(w, [W1, w])).toEqual([]);
  });
  it('only compares with workouts that started earlier', () => {
    // W1 compared against later W3 -> W3 ignored; W1 is still the first session
    expect(detectPRs(W1, [W1, W2, W3])).toEqual([]);
  });
  it('unfinished earlier workouts are ignored', () => {
    const open = workout('open', 2, [ex('bench_press', [set(150, 5)])], false);
    const prs = detectPRs(W2, [W1, open, W2]);
    expect(prs.find((p) => p.type === 'weight')).toEqual({ exerciseId: 'bench_press', type: 'weight', value: 82.5, previous: 80 });
  });
  it('bodyweight exercise: reps PR', () => {
    const p1 = workout('p1', 1, [ex('pull_up', [set(0, 8), set(0, 10)])]);
    const p2 = workout('p2', 3, [ex('pull_up', [set(null, 12), set(null, 9)])]);
    expect(detectPRs(p2, [p1, p2])).toEqual([{ exerciseId: 'pull_up', type: 'reps', value: 12, previous: 10 }]);
    const p3 = workout('p3', 5, [ex('pull_up', [set(0, 12)])]);
    expect(detectPRs(p3, [p1, p2, p3])).toEqual([]);
  });
  it('an exercise listed twice is only reported once', () => {
    const w = workout('w4', 7, [ex('bench_press', [set(90, 3)]), ex('bench_press', [set(90, 3)])]);
    const prs = detectPRs(w, [W1, w]);
    expect(prs.filter((p) => p.type === 'weight')).toHaveLength(1);
  });
  it('labels exist for every PR type', () => {
    expect(Object.keys(PR_LABEL).sort()).toEqual(['e1rm', 'reps', 'volume', 'weight']);
  });
});
