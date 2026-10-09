/**
 * Aggregations over logged workouts.
 */
import { addDays, dayKey, startOfWeek } from './dates';
import { estimate1RM } from './strength';
import type { SetLog, Workout, WorkoutExercise } from './types';

/** A set that counts toward training stats: completed, not a warm-up, reps > 0. */
export function isWorkingSet(s: SetLog): boolean {
  return s.done && s.type !== 'warmup' && s.reps != null && s.reps > 0;
}

export function workingSets(ex: WorkoutExercise): SetLog[] {
  return ex.sets.filter(isWorkingSet);
}

export function setVolume(s: SetLog): number {
  return (s.weightKg ?? 0) * (s.reps ?? 0);
}

/** Sum of weight × reps over working sets (kg). */
export function workoutVolume(w: Workout): number {
  let total = 0;
  for (const ex of w.exercises) for (const s of workingSets(ex)) total += setVolume(s);
  return total;
}

export function workoutSetCount(w: Workout): number {
  return w.exercises.reduce((n, ex) => n + workingSets(ex).length, 0);
}

export function workoutDurationSec(w: Workout, now = Date.now()): number {
  const end = w.endedAt ?? now;
  return Math.max(0, Math.round((end - w.startedAt) / 1000));
}

export function finishedWorkouts(workouts: Workout[]): Workout[] {
  return workouts.filter((w) => w.endedAt != null).sort((a, b) => a.startedAt - b.startedAt);
}

/** Number of workouts per local day key. */
export function workoutsByDay(workouts: Workout[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of workouts) {
    if (w.endedAt == null) continue;
    const k = dayKey(new Date(w.startedAt));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/**
 * Consecutive weeks (Monday-based) with at least `minPerWeek` workouts.
 * The current week counts if already met; if not yet met it doesn't break the streak.
 */
export function weeklyStreak(workouts: Workout[], now: Date = new Date(), minPerWeek = 1): number {
  const perWeek = new Map<number, number>();
  for (const w of workouts) {
    if (w.endedAt == null) continue;
    const k = startOfWeek(new Date(w.startedAt)).getTime();
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
  }
  let week = startOfWeek(now);
  let streak = 0;
  if ((perWeek.get(week.getTime()) ?? 0) >= minPerWeek) streak++;
  week = startOfWeek(addDays(week, -1));
  while ((perWeek.get(week.getTime()) ?? 0) >= minPerWeek) {
    streak++;
    week = startOfWeek(addDays(week, -1));
  }
  return streak;
}

/**
 * Consecutive training weeks (ending this or last week) since the last
 * deload. A week counts as a deload when its working sets are ≤ 60% of the
 * average of the 4 training weeks before it; a week with no workouts also resets.
 */
export function weeksSinceDeload(workouts: Workout[], now: Date = new Date()): number {
  const setsPerWeek = new Map<number, number>();
  for (const w of workouts) {
    if (w.endedAt == null) continue;
    const k = startOfWeek(new Date(w.startedAt)).getTime();
    setsPerWeek.set(k, (setsPerWeek.get(k) ?? 0) + Math.max(1, workoutSetCount(w)));
  }
  const weekAt = (i: number) => startOfWeek(addDays(startOfWeek(now), -7 * i)).getTime();
  // The current week may be in progress: skip it if it has no workouts yet.
  let i = setsPerWeek.has(weekAt(0)) ? 0 : 1;
  let count = 0;
  while (setsPerWeek.has(weekAt(i))) {
    const sets = setsPerWeek.get(weekAt(i))!;
    const prior = [1, 2, 3, 4].map((j) => setsPerWeek.get(weekAt(i + j))).filter((v): v is number => v != null);
    // Only judge completed weeks as deloads (the current week is partial).
    if (i > 0 && prior.length >= 2 && sets <= 0.6 * (prior.reduce((a, b) => a + b, 0) / prior.length)) break;
    count++;
    i++;
  }
  return count;
}

/** Workouts finished in the current Monday-based week. */
export function workoutsThisWeek(workouts: Workout[], now: Date = new Date()): Workout[] {
  const start = startOfWeek(now).getTime();
  const end = addDays(startOfWeek(now), 7).getTime();
  return workouts.filter((w) => w.endedAt != null && w.startedAt >= start && w.startedAt < end);
}

export interface ExerciseSession {
  workoutId: string;
  date: number;
  sets: { weightKg: number; reps: number; rpe?: number | null }[];
}

/** Per-session working sets for one exercise, oldest first. */
export function exerciseHistory(workouts: Workout[], exerciseId: string, excludeWorkoutId?: string): ExerciseSession[] {
  const out: ExerciseSession[] = [];
  for (const w of finishedWorkouts(workouts)) {
    if (w.id === excludeWorkoutId) continue;
    const sets: ExerciseSession['sets'] = [];
    for (const ex of w.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const s of workingSets(ex)) sets.push({ weightKg: s.weightKg ?? 0, reps: s.reps ?? 0, rpe: s.rpe ?? null });
    }
    if (sets.length) out.push({ workoutId: w.id, date: w.startedAt, sets });
  }
  return out;
}

/** Best estimated 1RM per session for charting. */
export function e1rmSeries(workouts: Workout[], exerciseId: string): { date: number; e1rm: number; best: { weightKg: number; reps: number } }[] {
  return exerciseHistory(workouts, exerciseId)
    .map((s) => {
      let best = { e1rm: 0, weightKg: 0, reps: 0 };
      for (const set of s.sets) {
        const v = estimate1RM(set.weightKg, set.reps, set.rpe).value;
        if (v > best.e1rm) best = { e1rm: v, weightKg: set.weightKg, reps: set.reps };
      }
      return { date: s.date, e1rm: best.e1rm, best: { weightKg: best.weightKg, reps: best.reps } };
    })
    .filter((p) => p.e1rm > 0);
}

/** Latest best e1RM for an exercise, or null. */
export function latestE1rm(workouts: Workout[], exerciseId: string): number | null {
  const series = e1rmSeries(workouts, exerciseId);
  if (!series.length) return null;
  // Use the best of the last 3 sessions to smooth out an off day.
  return Math.max(...series.slice(-3).map((p) => p.e1rm));
}

/** Most recent completed sets of an exercise (for "previous" ghost values). */
export function previousSets(workouts: Workout[], exerciseId: string, excludeWorkoutId?: string): SetLog[] {
  const done = finishedWorkouts(workouts);
  for (let i = done.length - 1; i >= 0; i--) {
    const w = done[i];
    if (w.id === excludeWorkoutId) continue;
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId && e.sets.some((s) => s.done));
    if (ex) return ex.sets.filter((s) => s.done);
  }
  return [];
}

export function totalStats(workouts: Workout[]): { count: number; volumeKg: number; sets: number; minutes: number } {
  let volumeKg = 0;
  let sets = 0;
  let seconds = 0;
  const done = finishedWorkouts(workouts);
  for (const w of done) {
    volumeKg += workoutVolume(w);
    sets += workoutSetCount(w);
    seconds += workoutDurationSec(w);
  }
  return { count: done.length, volumeKg, sets, minutes: Math.round(seconds / 60) };
}
