import {
  isWorkingSet,
  workingSets,
  setVolume,
  workoutVolume,
  workoutSetCount,
  workoutDurationSec,
  finishedWorkouts,
  workoutsByDay,
  weeklyStreak,
  workoutsThisWeek,
  exerciseHistory,
  e1rmSeries,
  latestE1rm,
  previousSets,
  totalStats,
  weeksSinceDeload,
} from '../stats';
import type { SetLog, SetType, Workout, WorkoutExercise } from '../types';

const NOW = new Date(2026, 9, 9, 10, 0); // Fri

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
const workout = (id: string, start: Date, exercises: WorkoutExercise[], minutes: number | null = 60): Workout => ({
  id,
  name: id,
  startedAt: start.getTime(),
  endedAt: minutes == null ? null : start.getTime() + minutes * 60_000,
  exercises,
});

const W1 = workout('w1', new Date(2026, 8, 28, 18), [
  ex('bench_press', [set(40, 10, { type: 'warmup' }), set(80, 8), set(80, 8), set(80, 7), set(80, 5, { done: false })]),
]);
const W2 = workout('w2', new Date(2026, 9, 1, 18), [ex('bench_press', [set(82.5, 6), set(82.5, 6), set(82.5, 6)]), ex('squat', [set(100, 5), set(100, 5), set(100, 5)])]);
const W3 = workout('w3', new Date(2026, 9, 5, 18), [ex('bench_press', [set(85, 5, { rpe: 8 }), set(85, 5, { rpe: 8 }), set(85, 5, { rpe: 8 })])]);
const W4_OPEN = workout('w4', new Date(2026, 9, 9, 9), [ex('bench_press', [set(200, 1)])], null);
const ALL = [W3, W4_OPEN, W1, W2]; // deliberately unsorted

describe('set helpers', () => {
  it('isWorkingSet', () => {
    expect(isWorkingSet(set(80, 8))).toBe(true);
    expect(isWorkingSet(set(80, 8, { type: 'drop' }))).toBe(true);
    expect(isWorkingSet(set(80, 8, { type: 'failure' }))).toBe(true);
    expect(isWorkingSet(set(0, 8))).toBe(true); // bodyweight
    expect(isWorkingSet(set(80, 8, { type: 'warmup' }))).toBe(false);
    expect(isWorkingSet(set(80, 8, { done: false }))).toBe(false);
    expect(isWorkingSet(set(80, 0))).toBe(false);
    expect(isWorkingSet(set(80, null))).toBe(false);
    expect(isWorkingSet(set(80, -2))).toBe(false);
  });
  it('workingSets / setVolume', () => {
    expect(workingSets(W1.exercises[0])).toHaveLength(3);
    expect(setVolume(set(80, 8))).toBe(640);
    expect(setVolume(set(null, 8))).toBe(0);
    expect(setVolume(set(80, null))).toBe(0);
  });
});

describe('workout aggregates', () => {
  it('volume and set count ignore warm-ups and unfinished sets', () => {
    expect(workoutVolume(W1)).toBe(1840);
    expect(workoutSetCount(W1)).toBe(3);
    expect(workoutVolume(W2)).toBe(2985);
    expect(workoutSetCount(W2)).toBe(6);
    expect(workoutVolume({ ...W1, exercises: [] })).toBe(0);
  });
  it('duration', () => {
    expect(workoutDurationSec(W1)).toBe(3600);
    expect(workoutDurationSec(W4_OPEN, NOW.getTime())).toBe(3600);
    expect(workoutDurationSec({ ...W1, endedAt: W1.startedAt - 1000 })).toBe(0);
  });
  it('finishedWorkouts filters and sorts oldest first', () => {
    expect(finishedWorkouts(ALL).map((w) => w.id)).toEqual(['w1', 'w2', 'w3']);
    expect(finishedWorkouts([])).toEqual([]);
  });
  it('workoutsByDay counts finished workouts per local day', () => {
    const extra = workout('w5', new Date(2026, 9, 5, 7), []);
    const m = workoutsByDay([...ALL, extra]);
    expect(m.get('2026-10-05')).toBe(2);
    expect(m.get('2026-09-28')).toBe(1);
    expect(m.has('2026-10-09')).toBe(false);
  });
  it('totalStats', () => {
    expect(totalStats(ALL)).toEqual({ count: 3, volumeKg: 1840 + 2985 + 1275, sets: 12, minutes: 180 });
    expect(totalStats([])).toEqual({ count: 0, volumeKg: 0, sets: 0, minutes: 0 });
  });
});

describe('weeks', () => {
  it('weeklyStreak counts consecutive Monday-based weeks', () => {
    expect(weeklyStreak(ALL, NOW)).toBe(2);
  });
  it('an empty current week does not break the streak', () => {
    expect(weeklyStreak(ALL, new Date(2026, 9, 12, 10))).toBe(2);
  });
  it('a gap week ends the streak', () => {
    expect(weeklyStreak(ALL, new Date(2026, 9, 20, 10))).toBe(0);
    const older = workout('old', new Date(2026, 8, 14, 18), []);
    expect(weeklyStreak([...ALL, older], NOW)).toBe(2);
  });
  it('minPerWeek', () => {
    // current week has 1 (< 2) but does not break; previous week has 2
    expect(weeklyStreak(ALL, NOW, 2)).toBe(1);
    expect(weeklyStreak(ALL, NOW, 3)).toBe(0);
  });
  it('unfinished workouts never count', () => {
    expect(weeklyStreak([W4_OPEN], NOW)).toBe(0);
    expect(weeklyStreak([], NOW)).toBe(0);
  });
  it('streak spans a DST change', () => {
    const ws = [new Date(2026, 2, 24, 18), new Date(2026, 2, 31, 18), new Date(2026, 3, 7, 18)].map((d, i) => workout(`d${i}`, d, []));
    expect(weeklyStreak(ws, new Date(2026, 3, 8, 12))).toBe(3);
  });
  it('workoutsThisWeek: [Mon 00:00, next Mon 00:00), finished only', () => {
    expect(workoutsThisWeek(ALL, NOW).map((w) => w.id)).toEqual(['w3']);
    const sunLate = workout('sun', new Date(2026, 9, 11, 23, 59), []);
    const nextMon = workout('mon', new Date(2026, 9, 12, 0, 0), []);
    const thisMon = workout('mon0', new Date(2026, 9, 5, 0, 0), []);
    const ids = workoutsThisWeek([sunLate, nextMon, thisMon], NOW).map((w) => w.id);
    expect(ids.sort()).toEqual(['mon0', 'sun']);
  });
});

describe('exercise history', () => {
  it('per-session working sets, oldest first', () => {
    const h = exerciseHistory(ALL, 'bench_press');
    expect(h.map((s) => s.workoutId)).toEqual(['w1', 'w2', 'w3']);
    expect(h[0].sets).toEqual([
      { weightKg: 80, reps: 8, rpe: null },
      { weightKg: 80, reps: 8, rpe: null },
      { weightKg: 80, reps: 7, rpe: null },
    ]);
    expect(h[2].sets[0].rpe).toBe(8);
    expect(exerciseHistory(ALL, 'bench_press', 'w3').map((s) => s.workoutId)).toEqual(['w1', 'w2']);
    expect(exerciseHistory(ALL, 'squat').map((s) => s.workoutId)).toEqual(['w2']);
    expect(exerciseHistory(ALL, 'nope')).toEqual([]);
  });
  it('e1rmSeries uses the best set per session', () => {
    const s = e1rmSeries(ALL, 'bench_press');
    expect(s).toHaveLength(3);
    expect(s[0].e1rm).toBeCloseTo((80 * (1 + 8 / 30) + (80 * 36) / 29) / 2, 6); // 100.32
    expect(s[0].best).toEqual({ weightKg: 80, reps: 8 });
    expect(s[1].e1rm).toBeCloseTo((82.5 * (1 + 6 / 30) + (82.5 * 36) / 31) / 2, 6); // 97.40
    expect(s[2].e1rm).toBeCloseTo(85 / 0.811, 6); // RPE chart, 104.81
  });
  it('latestE1rm = best of last 3 sessions', () => {
    expect(latestE1rm(ALL, 'bench_press')).toBeCloseTo(85 / 0.811, 6);
    expect(latestE1rm(ALL, 'nope')).toBeNull();
    const drop = workout('w6', new Date(2026, 9, 7, 18), [ex('bench_press', [set(60, 5)])]);
    const drop2 = workout('w7', new Date(2026, 9, 8, 18), [ex('bench_press', [set(60, 5)])]);
    // last 3 = w3, w6, w7 -> still w3's value
    expect(latestE1rm([...ALL, drop, drop2], 'bench_press')).toBeCloseTo(85 / 0.811, 6);
    const drop3 = workout('w8', new Date(2026, 9, 8, 19), [ex('bench_press', [set(60, 5)])]);
    expect(latestE1rm([...ALL, drop, drop2, drop3], 'bench_press')).toBeCloseTo((60 * (1 + 5 / 30) + (60 * 36) / 32) / 2, 6);
  });
  it('previousSets returns the most recent completed sets', () => {
    expect(previousSets(ALL, 'bench_press').map((s) => s.weightKg)).toEqual([85, 85, 85]);
    expect(previousSets(ALL, 'bench_press', 'w3').map((s) => s.weightKg)).toEqual([82.5, 82.5, 82.5]);
    // W1 includes the done warm-up but not the undone set
    expect(previousSets([W1], 'bench_press').map((s) => s.weightKg)).toEqual([40, 80, 80, 80]);
    expect(previousSets(ALL, 'deadlift')).toEqual([]);
  });
});

describe('weeksSinceDeload', () => {
  // weekly working-set totals, index 0 = week of NOW (Mon Oct 5), 1 = Sep 28, ...
  const weeks = (sets: (number | null)[], now = NOW) =>
    sets.flatMap((k, i) => {
      if (k == null) return [];
      const start = new Date(2026, 9, 6 - 7 * i, 18); // Tuesday of week i
      return [workout(`wk${i}`, start, k === 0 ? [] : [ex('bench_press', Array.from({ length: k }, () => set(60, 10)))])];
    });

  it('0 with no workouts', () => {
    expect(weeksSinceDeload([], NOW)).toBe(0);
  });
  it('counts consecutive training weeks ending this week', () => {
    expect(weeksSinceDeload(weeks([10, 10, 10]), NOW)).toBe(3);
  });
  it('starts from last week when this week has no workout yet', () => {
    expect(weeksSinceDeload(weeks([null, 10, 10, 10]), NOW)).toBe(3);
    expect(weeksSinceDeload(weeks([10, 10, 10]), new Date(2026, 9, 12, 8))).toBe(3); // next Monday
  });
  it('a week with no workouts ends the count', () => {
    expect(weeksSinceDeload(weeks([10, 10, null, 10, 10]), NOW)).toBe(2);
    expect(weeksSinceDeload(weeks([null, null, 10, 10]), NOW)).toBe(0);
  });
  it('a completed light week (≤ 60% of prior average) counts as a deload and ends the count', () => {
    expect(weeksSinceDeload(weeks([10, 10, 5, 10, 10, 10]), NOW)).toBe(2);
    expect(weeksSinceDeload(weeks([10, 10, 6, 10, 10]), NOW)).toBe(2); // exactly 60%
    expect(weeksSinceDeload(weeks([10, 10, 7, 10, 10]), NOW)).toBe(5); // 70% is not a deload
  });
  it('prior average uses up to 4 earlier training weeks', () => {
    // week 1 (5 sets) vs weeks 2–5 average (10+10+10+10)/4 = 10 -> deload; week 6 (100) ignored
    expect(weeksSinceDeload(weeks([10, 5, 10, 10, 10, 10, 100]), NOW)).toBe(1);
  });
  it('needs ≥ 2 prior training weeks to judge a deload', () => {
    expect(weeksSinceDeload(weeks([10, 3, 10]), NOW)).toBe(3);
  });
  it('the current (partial) week is never judged a deload', () => {
    expect(weeksSinceDeload(weeks([1, 10, 10, 10]), NOW)).toBe(4);
  });
  it('a workout with no working sets counts as 1 set', () => {
    expect(weeksSinceDeload(weeks([10, 0, 10, 10]), NOW)).toBe(1);
  });
  it('unfinished workouts are ignored', () => {
    const open = workout('open', new Date(2026, 8, 22, 18), [ex('bench_press', [set(60, 10)])], null);
    expect(weeksSinceDeload([...weeks([10, 10]), open], NOW)).toBe(2);
  });
  it('a long block without deload', () => {
    expect(weeksSinceDeload(weeks(Array(12).fill(12)), NOW)).toBe(12);
  });
});
