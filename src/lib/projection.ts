/**
 * Weight trend smoothing and future-weight prediction.
 * See docs/gym-science.md sections 5 and 14.
 */
import { ActivityLevel, bmrMifflin, tdee as tdeeFn, Sex } from './body';
import { daysBetween, addDaysToKey } from './dates';
import { KCAL_PER_KG } from './nutrition';

export interface WeighIn {
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export interface TrendPoint extends WeighIn {
  trend: number;
}

/** Sorts by date and keeps the last entry per day; drops invalid values. */
export function normalizeWeighIns(weighIns: WeighIn[]): WeighIn[] {
  const byDay = new Map<string, number>();
  for (const w of weighIns) {
    if (Number.isFinite(w.weightKg) && w.weightKg > 0 && /^\d{4}-\d{2}-\d{2}$/.test(w.date)) {
      byDay.set(w.date, w.weightKg);
    }
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, weightKg]) => ({ date, weightKg }));
}

/**
 * Hacker's Diet exponential moving average.
 * For gaps of g days the smoothing factor becomes 1-(1-α)^g, which is what the
 * daily filter would produce if the new reading had been seen on each missing day.
 */
export function trendSeries(weighIns: WeighIn[], alpha = 0.1): TrendPoint[] {
  const data = normalizeWeighIns(weighIns);
  if (data.length === 0) return [];
  const a = Math.min(1, Math.max(0.01, alpha));
  const out: TrendPoint[] = [{ ...data[0], trend: data[0].weightKg }];
  for (let i = 1; i < data.length; i++) {
    const gap = Math.max(1, daysBetween(data[i - 1].date, data[i].date));
    const effAlpha = 1 - Math.pow(1 - a, gap);
    const prev = out[i - 1].trend;
    out.push({ ...data[i], trend: prev + effAlpha * (data[i].weightKg - prev) });
  }
  return out;
}

/**
 * Weekly rate of change (kg/week) from a least-squares fit of the trend over
 * the last `windowDays`. Null if fewer than 2 points or the span is under a week.
 */
export function weeklyRate(points: TrendPoint[], windowDays = 21): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1].date;
  const recent = points.filter((p) => daysBetween(p.date, last) <= windowDays);
  if (recent.length < 2) return null;
  const xs = recent.map((p) => daysBetween(recent[0].date, p.date));
  if (xs[xs.length - 1] < 7) return null;
  const ys = recent.map((p) => p.trend);
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7;
}

/**
 * Date the goal is reached at the current rate. Null when the rate is ~0 or
 * moving away from the goal. Returns the current date key if already there.
 */
export function estimateGoalDate(currentKg: number, goalKg: number, weeklyRateKg: number | null, fromKey: string): string | null {
  if (!Number.isFinite(currentKg) || !Number.isFinite(goalKg)) return null;
  const diff = goalKg - currentKg;
  if (Math.abs(diff) < 0.05) return fromKey;
  if (weeklyRateKg == null || Math.abs(weeklyRateKg) < 0.01) return null;
  if (Math.sign(diff) !== Math.sign(weeklyRateKg)) return null;
  const days = Math.ceil((diff / weeklyRateKg) * 7);
  if (days > 3650) return null;
  return addDaysToKey(fromKey, days);
}

export interface ProjectionInput {
  startWeightKg: number;
  sex: Sex;
  age: number;
  heightCm: number;
  activity: ActivityLevel;
  dailyCalories: number;
  days: number;
  /** Extra adaptive-thermogenesis drop in TDEE while in a deficit (default 5%). */
  adaptation?: number;
  /** Stop once this weight is reached. */
  goalKg?: number | null;
  /**
   * Maintenance calories at a given weight. Defaults to Mifflin-St Jeor × activity;
   * pass the same model used for the calorie target (e.g. Katch-McArdle) to keep them consistent.
   */
  tdeeAt?: (weightKg: number) => number;
}

export interface ProjectionPoint {
  day: number;
  weightKg: number;
}

/**
 * Daily simulation: TDEE is recomputed from the current weight every day (captures
 * most of the metabolic slowdown) plus a small adaptive term during a deficit.
 * Returns one point per 7 days plus the final day.
 */
export function projectWeight(input: ProjectionInput): { points: ProjectionPoint[]; goalDay: number | null } {
  const { startWeightKg, sex, age, heightCm, activity, dailyCalories, goalKg } = input;
  const days = Math.max(0, Math.min(3650, Math.floor(input.days)));
  const adaptation = input.adaptation ?? 0.05;
  if (!(startWeightKg > 0) || !(dailyCalories > 0) || !(heightCm > 0) || !(age > 0)) {
    return { points: [], goalDay: null };
  }
  const hasGoal = goalKg != null && Number.isFinite(goalKg) && goalKg > 0;
  const direction = hasGoal ? Math.sign(goalKg - startWeightKg) : 0;
  const tdeeAt = input.tdeeAt ?? ((weightKg: number) => tdeeFn(bmrMifflin({ sex, age, heightCm, weightKg }), activity));
  let w = startWeightKg;
  const points: ProjectionPoint[] = [{ day: 0, weightKg: w }];
  let goalDay: number | null = hasGoal && direction === 0 ? 0 : null;
  for (let d = 1; d <= days; d++) {
    let expenditure = tdeeAt(w);
    if (!Number.isFinite(expenditure) || expenditure <= 0) break;
    // Adaptive thermogenesis scales with deficit size: full effect at a 25% deficit,
    // proportionally less for smaller ones, so it can never flip a deficit into a gain.
    const deficit = expenditure - dailyCalories;
    if (deficit > 0) {
      const severity = Math.min(1, deficit / expenditure / 0.25);
      expenditure -= expenditure * adaptation * severity;
    }
    w = Math.max(25, w + (dailyCalories - expenditure) / KCAL_PER_KG);
    if (goalDay == null && hasGoal && direction !== 0 && (direction < 0 ? w <= goalKg! : w >= goalKg!)) {
      goalDay = d;
      points.push({ day: d, weightKg: w });
      break;
    }
    if (d % 7 === 0 || d === days) points.push({ day: d, weightKg: w });
  }
  return { points, goalDay };
}
