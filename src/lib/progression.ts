/**
 * Next-session load/rep suggestions (double progression with stall detection).
 * See docs/gym-science.md section 11.
 */
import type { Experience } from './nutrition';
import type { ExerciseSession } from './stats';
import type { Exercise } from './types';
import { WeightUnit, lbToKg, roundTo } from './units';

export type SuggestionKind = 'start' | 'increase' | 'repeat' | 'decrease' | 'deload' | 'reps';

export interface Suggestion {
  kind: SuggestionKind;
  /** Suggested working weight (kg), null for bodyweight or first session. */
  weightKg: number | null;
  /** Target reps per set. */
  reps: number;
  message: string;
}

export interface ProgressionOptions {
  repMin: number;
  repMax: number;
  /** Load jump in kg (see incrementFor). */
  incrementKg: number;
  /** Formats a kg load for messages (defaults to kg). */
  format?: (kg: number) => string;
}

const EPS = 1e-6;

/** Smallest sensible load jump for an exercise, in kg. */
export function incrementFor(ex: Pick<Exercise, 'equipment' | 'lowerBody'>, unit: WeightUnit, experience: Experience = 'intermediate'): number {
  const kg = (k: number, lb: number) => (unit === 'kg' ? k : lbToKg(lb));
  switch (ex.equipment) {
    case 'barbell':
    case 'smith':
    case 'ez_bar':
      if (ex.lowerBody) return experience === 'beginner' ? kg(5, 10) : kg(2.5, 5);
      return kg(2.5, 5);
    case 'dumbbell':
      return kg(2, 5);
    case 'kettlebell':
      return kg(4, 10);
    case 'machine':
    case 'cable':
      return ex.lowerBody ? kg(5, 10) : kg(2.5, 5);
    default:
      return kg(2.5, 5);
  }
}

function topSets(session: ExerciseSession) {
  const top = Math.max(...session.sets.map((s) => s.weightKg));
  return { top, sets: session.sets.filter((s) => Math.abs(s.weightKg - top) < EPS) };
}

function fmt(kg: number) {
  return roundTo(kg, 0.25);
}

/**
 * Suggests what to do next session.
 * - All top sets reached repMax → add weight (double if RPE ≤ 7), reset to repMin.
 * - 3 sessions at the same top weight with no rep improvement → deload 10%.
 * - Top sets below repMin twice in a row → drop one increment.
 * - Otherwise repeat the weight and add a rep.
 * Bodyweight work (weight 0) progresses by reps.
 */
export function suggestNext(history: ExerciseSession[], opts: ProgressionOptions): Suggestion {
  const repMin = Math.max(1, Math.round(opts.repMin));
  const repMax = Math.max(repMin, Math.round(opts.repMax));
  const inc = opts.incrementKg > 0 ? opts.incrementKg : 2.5;
  const f = opts.format ?? ((kg: number) => `${fmt(kg)} kg`);
  const sessions = history.filter((h) => h.sets.length > 0);

  if (sessions.length === 0) {
    return {
      kind: 'start',
      weightKg: null,
      reps: repMax,
      message: `First time: pick a weight you could lift ~${repMax + 2} times, and do ${repMin}–${repMax} clean reps.`,
    };
  }

  const last = sessions[sessions.length - 1];
  const { top, sets } = topSets(last);
  const reps = sets.map((s) => s.reps);
  const minReps = Math.min(...reps);
  const maxReps = Math.max(...reps);

  // Bodyweight progression by reps.
  if (top <= EPS) {
    if (minReps >= repMax) {
      return {
        kind: 'increase',
        weightKg: null,
        reps: repMax,
        message: `You hit ${repMax}+ reps on every set — add a little load (backpack/belt) or use a harder variation.`,
      };
    }
    return { kind: 'reps', weightKg: null, reps: Math.min(repMax, maxReps + 1), message: `Aim for ${Math.min(repMax, maxReps + 1)} reps — one more than last time.` };
  }

  // Stall: last 3 sessions at the same top weight with no improvement in total reps.
  if (sessions.length >= 3) {
    const recent = sessions.slice(-3).map(topSets);
    const sameWeight = recent.every((r) => Math.abs(r.top - top) < EPS);
    const totals = recent.map((r) => r.sets.reduce((s, x) => s + x.reps, 0));
    const improving = totals[2] > totals[0];
    const stuckBelowMax = recent.every((r) => Math.min(...r.sets.map((s) => s.reps)) < repMax);
    if (sameWeight && !improving && stuckBelowMax) {
      // Snap to the loadable grid (plates / dumbbell steps) for the user's unit.
      // Always strictly lighter than the stalled weight (rounding can land back on it at light loads).
      const snapped = Number((Math.round((top * 0.9) / inc) * inc).toFixed(4));
      const w = Math.max(Math.min(inc, top), Math.min(top - inc, snapped));
      return {
        kind: 'deload',
        weightKg: w,
        reps: repMax,
        message: `Stalled for 3 sessions. Drop ~10% to ${f(w)}, own the reps, then build back up.`,
      };
    }
  }

  if (minReps >= repMax) {
    const rpes = sets.map((s) => s.rpe).filter((r): r is number => r != null && Number.isFinite(r));
    const easy = rpes.length > 0 && rpes.reduce((a, b) => a + b, 0) / rpes.length <= 7;
    const w = top + inc * (easy ? 2 : 1);
    return {
      kind: 'increase',
      weightKg: w,
      reps: repMin,
      message: easy
        ? `All sets hit ${repMax} reps and felt easy — jump to ${f(w)}.`
        : `All sets hit ${repMax} reps — add weight: ${f(w)} for ${repMin}+ reps.`,
    };
  }

  if (minReps < repMin && sessions.length >= 2) {
    const prev = topSets(sessions[sessions.length - 2]);
    const prevMin = Math.min(...prev.sets.map((s) => s.reps));
    if (Math.abs(prev.top - top) < EPS && prevMin < repMin) {
      const w = Math.max(0, top - inc);
      return {
        kind: 'decrease',
        weightKg: w,
        reps: repMin,
        message: `Below ${repMin} reps twice — drop to ${f(w)} and build up with good form.`,
      };
    }
  }

  const target = Math.min(repMax, Math.max(repMin, minReps + 1));
  return {
    kind: 'repeat',
    weightKg: top,
    reps: target,
    message: `Same weight (${f(top)}). Beat last time: aim for ${target} reps on every set.`,
  };
}

/** Lifts currently flagged for a deload. */
export function stalledExercises(histories: Record<string, ExerciseSession[]>, repRanges: Record<string, { repMin: number; repMax: number }>): string[] {
  const out: string[] = [];
  for (const [id, h] of Object.entries(histories)) {
    const range = repRanges[id] ?? { repMin: 6, repMax: 10 };
    if (suggestNext(h, { ...range, incrementKg: 2.5 }).kind === 'deload') out.push(id);
  }
  return out;
}
