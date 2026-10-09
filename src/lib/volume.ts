/**
 * Weekly hard sets per muscle (primary = 1 set, secondary = 0.5 set).
 * See docs/gym-science.md section 10.
 */
import { MUSCLES, VOLUME_LANDMARKS } from '../data/muscles';
import { isWorkingSet } from './stats';
import type { Exercise, Muscle, Workout } from './types';

export type ExerciseLookup = (id: string) => Exercise | undefined;

export function emptyMuscleMap(): Record<Muscle, number> {
  return Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
}

/** Sets per muscle for finished workouts that started within [fromMs, toMs). */
export function setsPerMuscle(workouts: Workout[], lookup: ExerciseLookup, fromMs: number, toMs: number): Record<Muscle, number> {
  const out = emptyMuscleMap();
  for (const w of workouts) {
    if (w.endedAt == null || w.startedAt < fromMs || w.startedAt >= toMs) continue;
    for (const ex of w.exercises) {
      const def = lookup(ex.exerciseId);
      if (!def || def.kind === 'cardio') continue;
      const n = ex.sets.filter(isWorkingSet).length;
      if (!n) continue;
      for (const m of def.primary) out[m] += n;
      for (const m of def.secondary) if (!def.primary.includes(m)) out[m] += n * 0.5;
    }
  }
  return out;
}

export type VolumeStatus = 'none' | 'low' | 'maintenance' | 'optimal' | 'high' | 'excessive';

export function volumeStatus(muscle: Muscle, sets: number): VolumeStatus {
  const l = VOLUME_LANDMARKS[muscle];
  if (sets <= 0) return 'none';
  if (sets < Math.max(1, l.mev)) return 'low';
  if (sets < l.mav[0]) return 'maintenance';
  if (sets <= l.mav[1]) return 'optimal';
  if (sets <= l.mrv) return 'high';
  return 'excessive';
}

export const VOLUME_STATUS_LABEL: Record<VolumeStatus, string> = {
  none: 'Not trained',
  low: 'Below minimum',
  maintenance: 'Effective',
  optimal: 'Optimal',
  high: 'High',
  excessive: 'Too much',
};
