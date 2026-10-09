import { useMemo } from 'react';
import { EXERCISE_MAP } from '../data/exercises';
import { buildCoachReport, CoachReport } from '../lib/coach';
import { dayKey } from '../lib/dates';
import type { Exercise, Routine } from '../lib/types';
import { waterGoalMl } from '../lib/water';
import { useStore } from './useStore';

const UNKNOWN: Exercise = {
  id: 'unknown',
  name: 'Unknown exercise',
  primary: [],
  secondary: [],
  equipment: 'bodyweight',
  category: 'isolation',
  kind: 'strength',
  lowerBody: false,
  met: 3.5,
  tips: [],
};

/** Library + custom exercises lookup. */
export function useExerciseLookup() {
  const custom = useStore((s) => s.customExercises);
  return useMemo(() => {
    const map: Record<string, Exercise> = { ...EXERCISE_MAP };
    for (const e of custom) map[e.id] = e;
    return (id: string): Exercise | undefined => map[id];
  }, [custom]);
}

export function useAllExercises(): Exercise[] {
  const custom = useStore((s) => s.customExercises);
  return useMemo(() => [...Object.values(EXERCISE_MAP), ...custom].sort((a, b) => a.name.localeCompare(b.name)), [custom]);
}

export function useExercise(id: string): Exercise {
  const lookup = useExerciseLookup();
  return lookup(id) ?? { ...UNKNOWN, id };
}

/** Latest known bodyweight (last weigh-in, else profile). */
export function useCurrentWeight(): number | null {
  const weighIns = useStore((s) => s.weighIns);
  const profile = useStore((s) => s.profile);
  return useMemo(() => {
    if (weighIns.length) {
      return [...weighIns].sort((a, b) => (a.date < b.date ? -1 : 1))[weighIns.length - 1].weightKg;
    }
    return profile?.weightKg ?? null;
  }, [weighIns, profile]);
}

export function useWaterGoal(): number {
  const override = useStore((s) => s.settings.water.goalOverrideMl);
  const profile = useStore((s) => s.profile);
  const weight = useCurrentWeight();
  return useMemo(() => {
    if (override && override > 0) return override;
    if (!weight || !profile) return 2500;
    return waterGoalMl(weight, (profile.sessionMinutes * profile.daysPerWeek) / 7);
  }, [override, weight, profile]);
}

export function useWaterToday(now: Date = new Date()): number {
  const key = dayKey(now);
  const entries = useStore((s) => s.water[key]);
  return useMemo(() => (entries ?? []).reduce((sum, e) => sum + e.ml, 0), [entries]);
}

export function useTodayRoutine(now: Date = new Date()): Routine | null {
  const program = useStore((s) => s.program);
  const weekday = now.getDay();
  return useMemo(() => {
    const id = program?.schedule[weekday];
    return (id && program?.routines.find((r) => r.id === id)) || null;
  }, [program, weekday]);
}

export function useCoachReport(): CoachReport | null {
  const profile = useStore((s) => s.profile);
  const weighIns = useStore((s) => s.weighIns);
  const workouts = useStore((s) => s.workouts);
  const unit = useStore((s) => s.settings.unit);
  const override = useStore((s) => s.settings.water.goalOverrideMl);
  const program = useStore((s) => s.program);
  const lookup = useExerciseLookup();
  return useMemo(() => {
    if (!profile) return null;
    return buildCoachReport({
      profile,
      weighIns,
      workouts,
      lookup,
      unit,
      plannedDaysPerWeek: program ? program.schedule.filter(Boolean).length : undefined,
      waterGoalOverrideMl: override,
    });
  }, [profile, weighIns, workouts, lookup, unit, program, override]);
}
