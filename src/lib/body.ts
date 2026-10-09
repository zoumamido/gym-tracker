/**
 * Body composition and energy expenditure formulas.
 * Sources are listed in docs/gym-science.md (sections 1-4).
 *
 * Convention: functions return NaN (or null where documented) when given
 * non-finite or non-positive physical inputs, so the UI can render "—".
 */

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, { title: string; detail: string }> = {
  sedentary: { title: 'Sedentary', detail: 'Desk job, little to no exercise' },
  light: { title: 'Lightly active', detail: 'Light exercise 1–3 days/week' },
  moderate: { title: 'Moderately active', detail: 'Training 3–5 days/week' },
  very: { title: 'Very active', detail: 'Hard training 6–7 days/week' },
  extra: { title: 'Extremely active', detail: 'Daily training + physical job' },
};

const pos = (...xs: number[]) => xs.every((x) => Number.isFinite(x) && x > 0);

/** Plausible human body-fat range used everywhere a % is accepted or produced. */
export const BODY_FAT_MIN = 3;
export const BODY_FAT_MAX = 60;
export const isPlausibleBodyFat = (bf: number | null | undefined): bf is number =>
  bf != null && Number.isFinite(bf) && bf >= BODY_FAT_MIN && bf <= BODY_FAT_MAX;
const clampBf = (bf: number) => Math.min(BODY_FAT_MAX, Math.max(BODY_FAT_MIN, bf));

export interface BodyInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  bodyFatPct?: number | null;
}

// ---------- BMI ----------

export function bmi(weightKg: number, heightCm: number): number {
  if (!pos(weightKg, heightCm)) return NaN;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese1' | 'obese2' | 'obese3';

export function bmiCategory(value: number): BmiCategory | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 18.5) return 'underweight';
  if (value < 25) return 'normal';
  if (value < 30) return 'overweight';
  if (value < 35) return 'obese1';
  if (value < 40) return 'obese2';
  return 'obese3';
}

export const BMI_CATEGORY_LABEL: Record<BmiCategory, string> = {
  underweight: 'Underweight',
  normal: 'Healthy',
  overweight: 'Overweight',
  obese1: 'Obese (class I)',
  obese2: 'Obese (class II)',
  obese3: 'Obese (class III)',
};

/** Weight range giving BMI 18.5–24.9. */
export function healthyWeightRange(heightCm: number): { min: number; max: number } {
  if (!pos(heightCm)) return { min: NaN, max: NaN };
  const m2 = (heightCm / 100) ** 2;
  return { min: 18.5 * m2, max: 24.9 * m2 };
}

/** Weight at a given BMI for this height. */
export function weightAtBmi(targetBmi: number, heightCm: number): number {
  if (!pos(targetBmi, heightCm)) return NaN;
  return targetBmi * (heightCm / 100) ** 2;
}

// ---------- Ideal body weight ----------

export interface IdealWeights {
  devine: number;
  robinson: number;
  miller: number;
  hamwi: number;
  average: number;
}

export function idealBodyWeight(heightCm: number, sex: Sex): IdealWeights {
  if (!pos(heightCm)) return { devine: NaN, robinson: NaN, miller: NaN, hamwi: NaN, average: NaN };
  const inches = Math.max(0, heightCm / 2.54 - 60);
  const male = sex === 'male';
  const devine = (male ? 50 : 45.5) + 2.3 * inches;
  const robinson = male ? 52 + 1.9 * inches : 49 + 1.7 * inches;
  const miller = male ? 56.2 + 1.41 * inches : 53.1 + 1.36 * inches;
  const hamwi = male ? 48 + 2.7 * inches : 45.5 + 2.2 * inches;
  return { devine, robinson, miller, hamwi, average: (devine + robinson + miller + hamwi) / 4 };
}

// ---------- BMR / TDEE ----------

export function bmrMifflin({ sex, age, heightCm, weightKg }: BodyInput): number {
  if (!pos(age, heightCm, weightKg)) return NaN;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function bmrKatchMcArdle(leanMassKg: number): number {
  if (!pos(leanMassKg)) return NaN;
  return 370 + 21.6 * leanMassKg;
}

/** Uses Katch-McArdle when a plausible body-fat % is known, Mifflin-St Jeor otherwise. */
export function bmr(input: BodyInput): { value: number; method: 'katch' | 'mifflin' } {
  const bf = input.bodyFatPct;
  if (isPlausibleBodyFat(bf) && pos(input.weightKg)) {
    return { value: bmrKatchMcArdle(leanBodyMass(input.weightKg, bf)), method: 'katch' };
  }
  return { value: bmrMifflin(input), method: 'mifflin' };
}

export function tdee(bmrValue: number, activity: ActivityLevel): number {
  if (!pos(bmrValue)) return NaN;
  return bmrValue * ACTIVITY_FACTORS[activity];
}

// ---------- Body fat ----------

export interface NavyInput {
  sex: Sex;
  heightCm: number;
  waistCm: number;
  neckCm: number;
  hipCm?: number | null;
}

/** US Navy circumference method. Returns null when measurements are missing/implausible. */
export function bodyFatNavy({ sex, heightCm, waistCm, neckCm, hipCm }: NavyInput): number | null {
  if (!pos(heightCm, waistCm, neckCm)) return null;
  let bf: number;
  if (sex === 'male') {
    if (waistCm - neckCm <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    if (hipCm == null || !pos(hipCm) || waistCm + hipCm - neckCm <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450;
  }
  if (!Number.isFinite(bf)) return null;
  return clampBf(bf);
}

/** Deurenberg (1991) BMI-based estimate. */
export function bodyFatDeurenberg(bmiValue: number, age: number, sex: Sex): number {
  if (!pos(bmiValue, age)) return NaN;
  const bf = 1.2 * bmiValue + 0.23 * age - 10.8 * (sex === 'male' ? 1 : 0) - 5.4;
  return clampBf(bf);
}

export type BodyFatCategory = 'essential' | 'athletic' | 'fitness' | 'average' | 'obese';

/** ACE categories. */
export function bodyFatCategory(pct: number, sex: Sex): BodyFatCategory | null {
  if (!Number.isFinite(pct) || pct <= 0) return null;
  const t = sex === 'male' ? [6, 14, 18, 25] : [14, 21, 25, 32];
  if (pct < t[0]) return 'essential';
  if (pct < t[1]) return 'athletic';
  if (pct < t[2]) return 'fitness';
  if (pct < t[3]) return 'average';
  return 'obese';
}

export const BODY_FAT_CATEGORY_LABEL: Record<BodyFatCategory, string> = {
  essential: 'Essential fat',
  athletic: 'Athletic',
  fitness: 'Fit',
  average: 'Average',
  obese: 'High',
};

export interface BodyFatEstimate {
  value: number;
  method: 'measured' | 'navy' | 'bmi';
}

/**
 * Best available body-fat estimate:
 * user-entered value > Navy tape method > Deurenberg (BMI-based).
 */
export function estimateBodyFat(input: BodyInput & { waistCm?: number | null; neckCm?: number | null; hipCm?: number | null }): BodyFatEstimate | null {
  const { bodyFatPct, sex, heightCm, weightKg, age } = input;
  if (isPlausibleBodyFat(bodyFatPct)) {
    return { value: bodyFatPct, method: 'measured' };
  }
  if (input.waistCm && input.neckCm) {
    const navy = bodyFatNavy({ sex, heightCm, waistCm: input.waistCm, neckCm: input.neckCm, hipCm: input.hipCm });
    if (navy != null) return { value: navy, method: 'navy' };
  }
  const d = bodyFatDeurenberg(bmi(weightKg, heightCm), age, sex);
  return Number.isFinite(d) ? { value: d, method: 'bmi' } : null;
}

// ---------- Lean mass / FFMI ----------

export function leanBodyMass(weightKg: number, bodyFatPct: number): number {
  if (!pos(weightKg) || !Number.isFinite(bodyFatPct) || bodyFatPct < 0 || bodyFatPct >= 100) return NaN;
  return weightKg * (1 - bodyFatPct / 100);
}

/** Boer (1984) formula, used when body fat is unknown. */
export function leanBodyMassBoer(sex: Sex, weightKg: number, heightCm: number): number {
  if (!pos(weightKg, heightCm)) return NaN;
  const lbm = sex === 'male' ? 0.407 * weightKg + 0.267 * heightCm - 19.2 : 0.252 * weightKg + 0.473 * heightCm - 48.3;
  return Math.min(weightKg, Math.max(0, lbm));
}

export function ffmi(leanMassKg: number, heightCm: number): { ffmi: number; normalized: number } {
  if (!pos(leanMassKg, heightCm)) return { ffmi: NaN, normalized: NaN };
  const m = heightCm / 100;
  const value = leanMassKg / (m * m);
  return { ffmi: value, normalized: value + 6.1 * (1.8 - m) };
}

export type FfmiCategory = 'below' | 'average' | 'above' | 'excellent' | 'elite';

export function ffmiCategory(normalized: number, sex: Sex): FfmiCategory | null {
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  const shift = sex === 'male' ? 0 : 3.5;
  const v = normalized + shift;
  if (v < 18) return 'below';
  if (v < 20) return 'average';
  if (v < 22) return 'above';
  if (v < 23) return 'excellent';
  return 'elite';
}

export const FFMI_CATEGORY_LABEL: Record<FfmiCategory, string> = {
  below: 'Below average',
  average: 'Average',
  above: 'Above average',
  excellent: 'Excellent',
  elite: 'Near natural limit',
};

// ---------- Heart rate ----------

/** Tanaka (2001): 208 − 0.7 × age. */
export function maxHeartRate(age: number): number {
  if (!pos(age)) return NaN;
  return 208 - 0.7 * age;
}

export interface HeartRateZone {
  zone: 1 | 2 | 3 | 4 | 5;
  name: string;
  min: number;
  max: number;
}

export function heartRateZones(age: number): HeartRateZone[] {
  const max = maxHeartRate(age);
  if (!Number.isFinite(max)) return [];
  const names = ['Recovery', 'Fat burn / base', 'Tempo', 'Threshold', 'Max effort'];
  return [0.5, 0.6, 0.7, 0.8, 0.9].map((lo, i) => ({
    zone: (i + 1) as HeartRateZone['zone'],
    name: names[i],
    min: Math.round(max * lo),
    max: Math.round(max * (lo + 0.1)),
  }));
}

/** Net calories from an activity: (MET − 1) × kg × hours (resting already in TDEE). */
export function netActivityCalories(met: number, weightKg: number, minutes: number): number {
  if (!pos(met, weightKg) || !Number.isFinite(minutes) || minutes < 0) return NaN;
  return Math.max(0, met - 1) * weightKg * (minutes / 60);
}
