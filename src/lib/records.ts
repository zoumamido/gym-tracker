/**
 * Personal-record detection.
 */
import { finishedWorkouts, isWorkingSet } from './stats';
import { estimate1RM } from './strength';
import type { Workout } from './types';

export type PrType = 'weight' | 'e1rm' | 'volume' | 'reps';

export interface PersonalRecord {
  exerciseId: string;
  type: PrType;
  value: number;
  previous: number;
}

export interface ExerciseBests {
  sessions: number;
  weight: number;
  e1rm: number;
  /** Best total weight × reps for this exercise in one session. */
  volume: number;
  /** Most reps in a single set. */
  reps: number;
}

const EMPTY: ExerciseBests = { sessions: 0, weight: 0, e1rm: 0, volume: 0, reps: 0 };

function bestsOf(workout: Workout, exerciseId: string): ExerciseBests | null {
  let found = false;
  const b = { ...EMPTY, sessions: 1 };
  for (const ex of workout.exercises) {
    if (ex.exerciseId !== exerciseId) continue;
    for (const s of ex.sets) {
      if (!isWorkingSet(s)) continue;
      found = true;
      const w = s.weightKg ?? 0;
      const r = s.reps ?? 0;
      b.weight = Math.max(b.weight, w);
      b.reps = Math.max(b.reps, r);
      b.volume += w * r;
      if (w > 0) b.e1rm = Math.max(b.e1rm, estimate1RM(w, r, s.rpe).value);
    }
  }
  return found ? b : null;
}

/** All-time bests for an exercise across finished workouts (optionally excluding one). */
export function exerciseBests(workouts: Workout[], exerciseId: string, excludeWorkoutId?: string): ExerciseBests {
  const acc = { ...EMPTY };
  for (const w of finishedWorkouts(workouts)) {
    if (w.id === excludeWorkoutId) continue;
    const b = bestsOf(w, exerciseId);
    if (!b) continue;
    acc.sessions++;
    acc.weight = Math.max(acc.weight, b.weight);
    acc.e1rm = Math.max(acc.e1rm, b.e1rm);
    acc.volume = Math.max(acc.volume, b.volume);
    acc.reps = Math.max(acc.reps, b.reps);
  }
  return acc;
}

/**
 * PRs set in `workout` compared with all *other* finished workouts that started
 * before it. The first ever session of an exercise sets a baseline, not a PR.
 */
export function detectPRs(workout: Workout, allWorkouts: Workout[]): PersonalRecord[] {
  const earlier = allWorkouts.filter((w) => w.id !== workout.id && w.startedAt < workout.startedAt);
  const prs: PersonalRecord[] = [];
  const seen = new Set<string>();
  for (const ex of workout.exercises) {
    if (seen.has(ex.exerciseId)) continue;
    seen.add(ex.exerciseId);
    const now = bestsOf(workout, ex.exerciseId);
    if (!now) continue;
    const prev = exerciseBests(earlier, ex.exerciseId);
    if (prev.sessions === 0) continue;
    const eps = 1e-6;
    if (now.weight > 0) {
      if (now.weight > prev.weight + eps) prs.push({ exerciseId: ex.exerciseId, type: 'weight', value: now.weight, previous: prev.weight });
      if (now.e1rm > prev.e1rm + eps && prev.e1rm > 0) prs.push({ exerciseId: ex.exerciseId, type: 'e1rm', value: now.e1rm, previous: prev.e1rm });
      if (now.volume > prev.volume + eps) prs.push({ exerciseId: ex.exerciseId, type: 'volume', value: now.volume, previous: prev.volume });
    } else if (now.reps > prev.reps) {
      prs.push({ exerciseId: ex.exerciseId, type: 'reps', value: now.reps, previous: prev.reps });
    }
  }
  return prs;
}

export const PR_LABEL: Record<PrType, string> = {
  weight: 'Heaviest weight',
  e1rm: 'Best est. 1RM',
  volume: 'Most volume',
  reps: 'Most reps',
};
