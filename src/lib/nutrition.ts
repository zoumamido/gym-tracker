/**
 * Calorie targets and macro split. See docs/gym-science.md sections 5-6.
 */
import { Sex, weightAtBmi, bmi } from './body';

export type BodyGoal = 'lose' | 'maintain' | 'gain';
export type Pace = 'slow' | 'moderate' | 'fast';
export type Experience = 'beginner' | 'intermediate' | 'advanced';

export const KCAL_PER_KG = 7700;

/** %BW per week for fat loss (0.5–1.0 %/wk recommended range). */
const LOSS_RATE_PCT: Record<Pace, number> = { slow: 0.5, moderate: 0.75, fast: 1.0 };
/** %BW per week for lean bulking, by training age (Aragon/Helms: 1–1.5, 0.5–1, 0.25–0.5 %/month). */
const GAIN_RATE_PCT: Record<Experience, number> = { beginner: 0.28, intermediate: 0.18, advanced: 0.09 };
const GAIN_RATE_MAX_PCT: Record<Experience, number> = { beginner: 0.35, intermediate: 0.23, advanced: 0.12 };
const GAIN_PACE_MULT: Record<Pace, number> = { slow: 0.75, moderate: 1, fast: 1.25 };

export const CALORIE_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };
/** Max deficit as a fraction of TDEE. */
export const MAX_DEFICIT_FRACTION = 0.25;

export interface CalorieInput {
  tdee: number;
  bmr: number;
  weightKg: number;
  sex: Sex;
  goal: BodyGoal;
  pace: Pace;
  experience: Experience;
}

export interface CalorieTarget {
  calories: number;
  /** kcal/day relative to TDEE (negative = deficit). */
  dailyDelta: number;
  /** Expected kg change per week at this intake (negative = loss). */
  weeklyChangeKg: number;
  weeklyChangePct: number;
  warnings: string[];
}

/** Planned weekly bodyweight change in kg for a goal (negative = loss). */
export function targetWeeklyChangeKg(goal: BodyGoal, pace: Pace, experience: Experience, weightKg: number): number {
  if (!(weightKg > 0)) return 0;
  if (goal === 'lose') return -(LOSS_RATE_PCT[pace] / 100) * weightKg;
  if (goal === 'gain') return (Math.min(GAIN_RATE_MAX_PCT[experience], GAIN_RATE_PCT[experience] * GAIN_PACE_MULT[pace]) / 100) * weightKg;
  return 0;
}

export function calorieTarget(input: CalorieInput): CalorieTarget {
  const { tdee, bmr, weightKg, sex, goal, pace, experience } = input;
  const warnings: string[] = [];
  if (!(tdee > 0) || !(weightKg > 0)) {
    return { calories: NaN, dailyDelta: NaN, weeklyChangeKg: NaN, weeklyChangePct: NaN, warnings };
  }
  let delta = (targetWeeklyChangeKg(goal, pace, experience, weightKg) * KCAL_PER_KG) / 7;

  if (goal === 'lose') {
    const maxDeficit = tdee * MAX_DEFICIT_FRACTION;
    if (-delta > maxDeficit) {
      delta = -maxDeficit;
      warnings.push('Deficit capped at 25% of maintenance to protect muscle and energy.');
    }
    const floor = CALORIE_FLOOR[sex];
    if (tdee + delta < floor) {
      if (tdee <= floor) {
        delta = 0;
        warnings.push(`Your maintenance is already below the safe minimum of ${floor} kcal/day — eat at maintenance and create the deficit with more daily activity instead.`);
      } else {
        delta = floor - tdee;
        warnings.push(`Calories kept at the safe minimum of ${floor} kcal/day.`);
      }
    }
    if (bmr > 0 && tdee + delta < bmr) {
      warnings.push('This intake is below your BMR — consider a slower pace or more daily activity.');
    }
  }

  const calories = Math.round((tdee + delta) / 10) * 10;
  const dailyDelta = calories - tdee;
  const weeklyChangeKg = (dailyDelta * 7) / KCAL_PER_KG;
  return {
    calories,
    dailyDelta,
    weeklyChangeKg,
    weeklyChangePct: (weeklyChangeKg / weightKg) * 100,
    warnings,
  };
}

export interface MacroInput {
  calories: number;
  weightKg: number;
  heightCm: number;
  goal: BodyGoal;
  /** Lean mass from a real body-fat measurement; enables LBM-based protein. */
  leanMassKg?: number | null;
}

export interface Macros {
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number;
  /** Weight the per-kg targets were based on (adjusted for higher BMI). */
  referenceWeightKg: number;
}

const PROTEIN_G_PER_KG: Record<BodyGoal, number> = { lose: 2.2, maintain: 1.8, gain: 1.8 };
/** ISSN / Helms: 2.3–3.1 g/kg lean mass when cutting. */
const PROTEIN_G_PER_KG_LBM: Record<BodyGoal, number> = { lose: 2.6, maintain: 2.2, gain: 2.2 };
const FAT_MIN_G_PER_KG = 0.6;
const FAT_SHARE = 0.25;
const REFERENCE_BMI_CAP = 30;
const REFERENCE_BMI = 27;

/**
 * Per-kg targets use an adjusted reference weight for BMI > 30 (weight at BMI 27),
 * so protein isn't inflated by fat mass while muscular lifters (BMI 25–30) aren't under-dosed.
 */
export function referenceWeight(weightKg: number, heightCm: number): number {
  const b = bmi(weightKg, heightCm);
  if (!Number.isFinite(b)) return weightKg;
  return b > REFERENCE_BMI_CAP ? weightAtBmi(REFERENCE_BMI, heightCm) : weightKg;
}

export function macros({ calories, weightKg, heightCm, goal, leanMassKg }: MacroInput): Macros {
  const ref = referenceWeight(weightKg, heightCm);
  if (!(calories > 0) || !(ref > 0)) {
    return { proteinG: NaN, fatG: NaN, carbsG: NaN, fiberG: NaN, referenceWeightKg: ref };
  }
  let proteinG =
    leanMassKg != null && leanMassKg > 0 && leanMassKg < weightKg ? PROTEIN_G_PER_KG_LBM[goal] * leanMassKg : PROTEIN_G_PER_KG[goal] * ref;
  let fatG = Math.max(FAT_MIN_G_PER_KG * ref, (calories * FAT_SHARE) / 9);
  let carbKcal = calories - proteinG * 4 - fatG * 9;
  if (carbKcal < 0) {
    // Very low calorie budgets: drop fat to its floor first, then trim protein.
    fatG = FAT_MIN_G_PER_KG * ref;
    carbKcal = calories - proteinG * 4 - fatG * 9;
    if (carbKcal < 0) {
      proteinG = Math.max(0, (calories - fatG * 9) / 4);
      carbKcal = 0;
    }
  }
  return {
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatG),
    carbsG: Math.max(0, Math.round(carbKcal / 4)),
    fiberG: Math.round((14 * calories) / 1000),
    referenceWeightKg: ref,
  };
}

/** Grams of protein per meal for even distribution (0.25–0.4 g/kg per meal, ~3–5 meals). */
export function proteinPerMeal(totalProteinG: number, meals = 4): number {
  if (!(totalProteinG > 0) || !(meals > 0)) return 0;
  return Math.round(totalProteinG / meals);
}
