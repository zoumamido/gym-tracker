/**
 * One-rep-max estimation, RPE math and strength standards.
 * See docs/gym-science.md sections 8-9.
 */
import { Sex } from './body';

export const epley = (w: number, r: number) => (r === 1 ? w : w * (1 + r / 30));
export const brzycki = (w: number, r: number) => (r >= 37 ? NaN : (w * 36) / (37 - r));
export const lombardi = (w: number, r: number) => w * Math.pow(r, 0.1);
export const mayhew = (w: number, r: number) => (100 * w) / (52.2 + 41.9 * Math.exp(-0.055 * r));
export const wathan = (w: number, r: number) => (100 * w) / (48.8 + 53.8 * Math.exp(-0.075 * r));

/**
 * %1RM by "effective reps" (reps + reps-in-reserve), in half-rep steps.
 * Index 0 = 1 effective rep. Derived from the Tuchscherer RPE chart, which is
 * one-dimensional along reps + RIR.
 */
const RPE_PCT = [
  100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0,
  66.7, 65.3, 64.0,
];
const RPE_MIN_PCT = 40;

/** Fraction (0–1) of 1RM that `reps` at `rpe` represents. RPE is clamped to 5–10. */
export function percentOf1RM(reps: number, rpe = 10): number {
  if (!Number.isFinite(reps) || reps < 1) return NaN;
  const r = Math.min(10, Math.max(5, Number.isFinite(rpe) ? rpe : 10));
  const effective = reps + (10 - r); // reps + RIR
  const idx = (effective - 1) * 2; // fractional half-step index, interpolated below
  if (idx < RPE_PCT.length) {
    const lo = Math.floor(idx);
    const hi = Math.min(RPE_PCT.length - 1, lo + 1);
    const t = idx - lo;
    return (RPE_PCT[lo] * (1 - t) + RPE_PCT[hi] * t) / 100;
  }
  // Extrapolate past the chart at the chart's terminal slope (~1.3% per half rep).
  const last = RPE_PCT[RPE_PCT.length - 1];
  const slope = RPE_PCT[RPE_PCT.length - 2] - last;
  return Math.max(RPE_MIN_PCT, last - slope * (idx - (RPE_PCT.length - 1))) / 100;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface OneRepMax {
  value: number;
  confidence: Confidence;
}

/** Sets above this many reps are too far from a max to estimate a 1RM from. */
export const MAX_E1RM_REPS = 15;

const confidenceFor = (r: number): Confidence => (r <= 6 ? 'high' : r <= 10 ? 'medium' : 'low');

/**
 * Estimated 1RM for a set. With RPE (5–10) uses the RPE chart; otherwise
 * averages Epley and Brzycki up to 10 reps and Wathan for 11–15.
 * Returns value 0 for invalid sets and sets above 15 reps.
 */
export function estimate1RM(weightKg: number, reps: number, rpe?: number | null): OneRepMax {
  if (!(weightKg > 0) || !(reps >= 1) || !Number.isFinite(reps)) return { value: 0, confidence: 'low' };
  const r = Math.round(reps);
  if (r > MAX_E1RM_REPS) return { value: 0, confidence: 'low' };
  if (rpe != null && Number.isFinite(rpe) && rpe >= 5 && rpe <= 10 && r <= 12) {
    return { value: weightKg / percentOf1RM(r, rpe), confidence: confidenceFor(r) };
  }
  if (r === 1) return { value: weightKg, confidence: 'high' };
  if (r <= 10) return { value: (epley(weightKg, r) + brzycki(weightKg, r)) / 2, confidence: confidenceFor(r) };
  return { value: wathan(weightKg, r), confidence: 'low' };
}

/** Load for a target reps @ RPE given an estimated 1RM. */
export function loadFor(oneRmKg: number, reps: number, rpe = 8): number {
  if (!(oneRmKg > 0)) return NaN;
  return oneRmKg * percentOf1RM(reps, rpe);
}

/** Classic rep-max table (1–12 reps) from a 1RM, at RPE 10. */
export function repMaxTable(oneRmKg: number): { reps: number; weightKg: number; pct: number }[] {
  if (!(oneRmKg > 0)) return [];
  return [1, 2, 3, 4, 5, 6, 8, 10, 12].map((reps) => {
    const pct = percentOf1RM(reps, 10);
    return { reps, weightKg: oneRmKg * pct, pct };
  });
}

// ---------- Strength standards (1RM ÷ bodyweight) ----------

export type StandardLift = 'squat' | 'bench' | 'deadlift' | 'ohp';
export type StrengthLevel = 'untrained' | 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite';

export const STRENGTH_LEVELS: StrengthLevel[] = ['untrained', 'beginner', 'novice', 'intermediate', 'advanced', 'elite'];

/** Thresholds for beginner, novice, intermediate, advanced, elite. */
export const STRENGTH_STANDARDS: Record<StandardLift, Record<Sex, [number, number, number, number, number]>> = {
  squat: { male: [0.75, 1.25, 1.75, 2.25, 2.75], female: [0.5, 0.75, 1.25, 1.75, 2.25] },
  bench: { male: [0.5, 1.0, 1.25, 1.5, 2.0], female: [0.3, 0.5, 0.75, 1.1, 1.45] },
  deadlift: { male: [1.0, 1.5, 2.0, 2.5, 3.25], female: [0.75, 1.0, 1.5, 2.0, 2.5] },
  ohp: { male: [0.35, 0.55, 0.8, 1.05, 1.35], female: [0.2, 0.35, 0.5, 0.7, 0.95] },
};

export const STANDARD_LIFT_LABEL: Record<StandardLift, string> = {
  squat: 'Squat',
  bench: 'Bench press',
  deadlift: 'Deadlift',
  ohp: 'Overhead press',
};

export interface StrengthAssessment {
  level: StrengthLevel;
  ratio: number;
  next: StrengthLevel | null;
  /** 1RM needed for the next level. */
  nextTargetKg: number | null;
  /** 0–1 progress from current level threshold to the next. */
  progress: number;
}

export function assessStrength(lift: StandardLift, sex: Sex, oneRmKg: number, bodyweightKg: number): StrengthAssessment | null {
  if (!(oneRmKg > 0) || !(bodyweightKg > 0)) return null;
  const t = STRENGTH_STANDARDS[lift][sex];
  const ratio = oneRmKg / bodyweightKg;
  let idx = 0; // index into STRENGTH_LEVELS
  for (let i = 0; i < t.length; i++) if (ratio >= t[i]) idx = i + 1;
  const level = STRENGTH_LEVELS[idx];
  if (idx >= t.length) return { level, ratio, next: null, nextTargetKg: null, progress: 1 };
  const lower = idx === 0 ? 0 : t[idx - 1];
  const upper = t[idx];
  return {
    level,
    ratio,
    next: STRENGTH_LEVELS[idx + 1],
    nextTargetKg: upper * bodyweightKg,
    progress: Math.min(1, Math.max(0, (ratio - lower) / (upper - lower))),
  };
}
