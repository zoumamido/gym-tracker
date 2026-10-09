/**
 * The "coach": turns the user's profile + logs into an analysis and a
 * prioritised action plan ("what should I do?").
 */
import { MUSCLE_LABEL, VOLUME_LANDMARKS } from '../data/muscles';
import {
  bmi as bmiFn,
  BmiCategory,
  bmiCategory,
  bmr as bmrFn,
  bmrKatchMcArdle,
  BodyFatCategory,
  bodyFatCategory,
  BodyFatEstimate,
  estimateBodyFat,
  ffmi as ffmiFn,
  FfmiCategory,
  ffmiCategory,
  healthyWeightRange,
  HeartRateZone,
  heartRateZones,
  idealBodyWeight,
  IdealWeights,
  leanBodyMass,
  tdee as tdeeFn,
} from './body';
import { addDaysToKey, daysBetween, dayKey } from './dates';
import { CalorieTarget, calorieTarget, Macros, macros as macrosFn, proteinPerMeal } from './nutrition';
import { recommendedDays, splitFor } from './program';
import { stalledExercises } from './progression';
import { estimateGoalDate, projectWeight, ProjectionPoint, trendSeries, weeklyRate, WeighIn } from './projection';
import { exerciseHistory, finishedWorkouts, weeklyStreak, weeksSinceDeload, workoutsThisWeek } from './stats';
import type { Muscle, Profile, Workout } from './types';
import { formatNumber, formatWater, formatWeight, WeightUnit } from './units';
import { ExerciseLookup, setsPerMuscle } from './volume';
import { WATER_ML_PER_TRAINING_HOUR, waterGoalMl } from './water';

export type ActionPriority = 'high' | 'medium' | 'low';
export type ActionCategory = 'nutrition' | 'training' | 'hydration' | 'recovery' | 'tracking' | 'health';

export interface CoachAction {
  id: string;
  category: ActionCategory;
  priority: ActionPriority;
  title: string;
  detail: string;
}

export interface CoachReport {
  weightKg: number;
  trendWeightKg: number | null;
  weeklyRateKg: number | null;
  bmi: { value: number; category: BmiCategory | null };
  healthyRange: { min: number; max: number };
  idealWeight: IdealWeights;
  bodyFat: (BodyFatEstimate & { category: BodyFatCategory | null }) | null;
  leanMassKg: number;
  ffmi: { value: number; normalized: number; category: FfmiCategory | null };
  bmr: { value: number; method: 'katch' | 'mifflin' };
  tdee: number;
  target: CalorieTarget;
  macros: Macros;
  proteinPerMeal: number;
  waterGoalMl: number;
  /** The goal used for projections (user's goal or a suggested milestone). */
  goalWeightKg: number | null;
  goalIsSuggested: boolean;
  projection: { points: ProjectionPoint[]; goalDay: number | null; goalDate: string | null };
  /** Goal date at the *actual* trend rate, when enough data exists. */
  trendGoalDate: string | null;
  training: {
    recommendedDays: number;
    splitName: string;
    doneThisWeek: number;
    plannedThisWeek: number;
    streakWeeks: number;
    lowVolumeMuscles: Muscle[];
    stalledExerciseIds: string[];
  };
  heartRateZones: HeartRateZone[];
  actions: CoachAction[];
}

export interface CoachInput {
  profile: Profile;
  weighIns: WeighIn[];
  workouts: Workout[];
  lookup: ExerciseLookup;
  unit: WeightUnit;
  now?: Date;
  /** Planned training days in the active program (defaults to profile.daysPerWeek). */
  plannedDaysPerWeek?: number;
  waterGoalOverrideMl?: number | null;
}

const PRIORITY_ORDER: Record<ActionPriority, number> = { high: 0, medium: 1, low: 2 };

/** A sensible goal if the user didn't set one. */
export function suggestedGoalWeight(profile: Profile, weightKg: number): number | null {
  const range = healthyWeightRange(profile.heightCm);
  if (profile.goal === 'lose') {
    if (!(weightKg > range.min)) return null;
    // First milestone: 10% loss, but never below the top of the healthy BMI range unless already there.
    const milestone = weightKg * 0.9;
    const target = weightKg > range.max ? Math.max(milestone, range.max) : Math.max(milestone, range.min);
    return Math.round(target * 2) / 2;
  }
  if (profile.goal === 'gain') return Math.round(weightKg * 1.05 * 2) / 2;
  return null;
}

export function buildCoachReport(input: CoachInput): CoachReport {
  const { profile, lookup, unit } = input;
  const now = input.now ?? new Date();
  const todayKey = dayKey(now);

  const trend = trendSeries(input.weighIns);
  const latest = trend.length ? trend[trend.length - 1] : null;
  const weightKg = latest?.weightKg ?? profile.weightKg;
  const trendWeightKg = latest?.trend ?? null;
  const rate = weeklyRate(trend);

  const body = { sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg, bodyFatPct: profile.bodyFatPct };
  const bmiValue = bmiFn(weightKg, profile.heightCm);
  const cat = bmiCategory(bmiValue);
  // Safety: never prescribe a deficit to someone who is already underweight.
  const unsafeLoss = profile.goal === 'lose' && cat === 'underweight';
  const goal = unsafeLoss ? 'maintain' : profile.goal;
  const bf = estimateBodyFat({ ...body, waistCm: profile.waistCm, neckCm: profile.neckCm, hipCm: profile.hipCm });
  const leanMassKg = bf ? leanBodyMass(weightKg, bf.value) : NaN;
  const ff = ffmiFn(leanMassKg, profile.heightCm);
  // Use Katch-McArdle only with a real measurement (tape or entered), not the BMI-derived estimate.
  const measuredBf = bf && bf.method !== 'bmi' ? bf.value : null;
  const bmr = bmrFn({ ...body, bodyFatPct: measuredBf });
  const tdee = tdeeFn(bmr.value, profile.activity);
  const target = calorieTarget({
    tdee,
    bmr: bmr.value,
    weightKg,
    sex: profile.sex,
    goal,
    pace: profile.pace,
    experience: profile.experience,
  });
  if (unsafeLoss) target.warnings.unshift('Your BMI is below the healthy range, so calories are set to maintenance instead of a deficit.');
  const macros = macrosFn({
    calories: target.calories,
    weightKg,
    heightCm: profile.heightCm,
    goal,
    leanMassKg: measuredBf != null ? leanMassKg : null,
  });
  const avgSessionMin = profile.daysPerWeek > 0 ? profile.sessionMinutes : 0;
  const water = input.waterGoalOverrideMl ?? waterGoalMl(weightKg, (avgSessionMin * profile.daysPerWeek) / 7);

  const userGoal = profile.goalWeightKg != null && profile.goalWeightKg > 0 ? profile.goalWeightKg : null;
  const goalWeightKg = unsafeLoss ? null : (userGoal ?? suggestedGoalWeight(profile, weightKg));
  // Keep the projection on the same energy model as the target: with Katch-McArdle,
  // assume ~25% of weight change is lean mass (typical when training + adequate protein).
  const lean0 = leanMassKg;
  const tdeeAt =
    bmr.method === 'katch' && Number.isFinite(lean0)
      ? (w: number) => tdeeFn(bmrKatchMcArdle(Math.max(1, lean0 + 0.25 * (w - weightKg))), profile.activity)
      : undefined;
  const sim = projectWeight({
    tdeeAt,
    startWeightKg: weightKg,
    sex: profile.sex,
    age: profile.age,
    heightCm: profile.heightCm,
    activity: profile.activity,
    dailyCalories: target.calories,
    days: 365,
    goalKg: goalWeightKg,
  });
  const projection = {
    ...sim,
    goalDate: sim.goalDay != null ? addDaysToKey(todayKey, sim.goalDay) : null,
  };
  const trendGoalDate = goalWeightKg != null && trendWeightKg != null ? estimateGoalDate(trendWeightKg, goalWeightKg, rate, todayKey) : null;

  // ---- Training analysis ----
  const finished = finishedWorkouts(input.workouts);
  const plannedThisWeek = input.plannedDaysPerWeek ?? profile.daysPerWeek;
  const doneThisWeek = workoutsThisWeek(finished, now).length;
  const streakWeeks = weeklyStreak(finished, now);
  const hardWeeks = weeksSinceDeload(finished, now);
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const sets = setsPerMuscle(finished, lookup, weekAgo, now.getTime() + 1);
  const trainedRecently = finished.some((w) => w.startedAt >= now.getTime() - 14 * 86_400_000);
  const lowVolumeMuscles = trainedRecently
    ? (Object.keys(sets) as Muscle[]).filter(
        // Flag only clearly under-trained muscles (< 60% of MEV) so a sensible plan isn't nagged.
        (m) => sets[m] < VOLUME_LANDMARKS[m].mev * 0.6 && !['traps', 'forearms', 'lower_back', 'front_delts', 'glutes'].includes(m),
      )
    : [];

  const histories: Record<string, ReturnType<typeof exerciseHistory>> = {};
  const ranges: Record<string, { repMin: number; repMax: number }> = {};
  // Newest first, so the current rep range for each exercise wins.
  for (const w of finished.slice(-30).reverse()) {
    for (const ex of w.exercises) {
      if (!histories[ex.exerciseId]) {
        histories[ex.exerciseId] = exerciseHistory(finished, ex.exerciseId);
        ranges[ex.exerciseId] = { repMin: ex.repMin, repMax: ex.repMax };
      }
    }
  }
  const stalledExerciseIds = stalledExercises(histories, ranges);

  // ---- Actions ----
  const actions: CoachAction[] = [];
  const add = (a: CoachAction) => actions.push(a);
  const fw = (kg: number) => formatWeight(kg, unit);

  if (Number.isFinite(target.calories)) {
    const deltaText =
      goal === 'maintain' || Math.abs(target.dailyDelta) < 25
        ? 'This is your estimated maintenance.'
        : `${Math.abs(Math.round(target.dailyDelta))} kcal ${target.dailyDelta < 0 ? 'below' : 'above'} maintenance → about ${fw(Math.abs(target.weeklyChangeKg))} per week.`;
    add({
      id: 'calories',
      category: 'nutrition',
      priority: 'high',
      title: `Eat about ${formatNumber(target.calories, 0)} kcal a day`,
      detail: `${deltaText} Protein ${macros.proteinG} g · Carbs ${macros.carbsG} g · Fat ${macros.fatG} g.`,
    });
    add({
      id: 'protein',
      category: 'nutrition',
      priority: 'high',
      title: `Hit ${macros.proteinG} g of protein daily`,
      detail: `Spread over ~4 meals (${proteinPerMeal(macros.proteinG)} g each). Protein protects muscle${goal === 'lose' ? ' while you lose fat' : ' and fuels growth'}. Fiber: ${macros.fiberG} g.`,
    });
  }

  add({
    id: 'water',
    category: 'hydration',
    priority: 'medium',
    title: `Drink ${formatWater(water, unit)} of water a day`,
    detail: `Sip through the day — reminders are spread across your waking hours. Add ~${formatWater(WATER_ML_PER_TRAINING_HOUR, unit)} for every hour of hard training.`,
  });

  if (finished.length === 0) {
    add({
      id: 'first-workout',
      category: 'training',
      priority: 'high',
      title: 'Log your first workout',
      detail: `Your plan: ${splitFor(plannedThisWeek).name}. Start light, focus on form — the app will suggest weights from your second session on.`,
    });
  } else if (doneThisWeek < plannedThisWeek) {
    add({
      id: 'weekly-sessions',
      category: 'training',
      priority: 'high',
      title: `Train ${plannedThisWeek - doneThisWeek} more time${plannedThisWeek - doneThisWeek === 1 ? '' : 's'} this week`,
      detail: `${doneThisWeek}/${plannedThisWeek} sessions done. Consistency beats intensity — every session counts.`,
    });
  } else {
    add({
      id: 'weekly-done',
      category: 'training',
      priority: 'low',
      title: 'Weekly training target hit 🎉',
      detail: `${doneThisWeek} sessions this week. Recover well — muscles grow between sessions.`,
    });
  }

  if (lowVolumeMuscles.length) {
    add({
      id: 'volume',
      category: 'training',
      priority: 'medium',
      title: 'Some muscles need more sets',
      detail: `Below the minimum effective volume this week: ${lowVolumeMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')}. Aim for 10–20 hard sets per muscle per week.`,
    });
  }

  if (stalledExerciseIds.length >= 2 || hardWeeks >= 8) {
    add({
      id: 'deload',
      category: 'recovery',
      priority: 'medium',
      title: 'Plan a deload week',
      detail:
        hardWeeks >= 8
          ? `You've trained hard for ${hardWeeks} weeks straight. Cut sets by ~40% for one week, keep weights moderate — you'll come back stronger.`
          : `${stalledExerciseIds.length} lifts have stalled. A lighter week (−40% sets) usually breaks plateaus.`,
    });
  } else if (stalledExerciseIds.length === 1) {
    const ex = lookup(stalledExerciseIds[0]);
    add({
      id: 'stall',
      category: 'training',
      priority: 'low',
      title: `${ex?.name ?? 'One lift'} has stalled`,
      detail: 'Drop the weight ~10% next time and build back up, or swap it for a similar exercise for 4–6 weeks.',
    });
  }

  // Trend vs goal feedback (needs ≥ 2 weeks of weigh-ins).
  if (rate != null && trend.length >= 5 && trendWeightKg != null) {
    const pct = (rate / trendWeightKg) * 100;
    if (goal === 'lose') {
      if (rate >= 0) {
        add({
          id: 'trend-stalled',
          category: 'nutrition',
          priority: 'high',
          title: 'Weight trend isn’t going down',
          detail: `Trend: ${rate >= 0 ? '+' : ''}${fw(rate)}/week. Cut ~150–200 kcal or add 2–3k daily steps, then re-check in 2 weeks.`,
        });
      } else if (pct < -1.2) {
        add({
          id: 'trend-fast',
          category: 'nutrition',
          priority: 'medium',
          title: 'You’re losing faster than ideal',
          detail: `${formatNumber(Math.abs(pct), 1)}%/week. Above ~1%/week you risk losing muscle — add ~150–200 kcal.`,
        });
      }
    } else if (goal === 'gain') {
      const fastPct = Math.max(0.3, Math.abs(target.weeklyChangePct) * 1.75);
      if (rate <= 0) {
        add({
          id: 'trend-gain-stalled',
          category: 'nutrition',
          priority: 'high',
          title: 'You’re not gaining yet',
          detail: 'Add ~150–200 kcal per day (e.g. a glass of milk and a banana) and re-check in 2 weeks.',
        });
      } else if (pct > fastPct) {
        add({
          id: 'trend-gain-fast',
          category: 'nutrition',
          priority: 'medium',
          title: 'Gaining too fast',
          detail: `${formatNumber(pct, 2)}%/week — most of that will be fat. Trim ~150 kcal per day.`,
        });
      }
    }
  }

  const lastWeighIn = trend.length ? trend[trend.length - 1].date : null;
  if (!lastWeighIn || daysBetween(lastWeighIn, todayKey) >= 3) {
    add({
      id: 'weigh-in',
      category: 'tracking',
      priority: 'medium',
      title: 'Weigh in tomorrow morning',
      detail: 'After the bathroom, before eating. Daily weigh-ins are smoothed into a trend, so normal day-to-day swings don’t matter.',
    });
  }

  if (goal === 'lose') {
    add({
      id: 'steps',
      category: 'training',
      priority: 'medium',
      title: 'Walk 8,000–10,000 steps a day',
      detail: 'Daily movement burns more than most workouts and keeps your metabolism from slowing as you diet.',
    });
  }

  add({
    id: 'sleep',
    category: 'recovery',
    priority: 'medium',
    title: 'Sleep 7–9 hours',
    detail: 'Short sleep while dieting shifts weight loss from fat to muscle. It is the cheapest performance enhancer there is.',
  });

  if (profile.waistCm == null || profile.neckCm == null) {
    add({
      id: 'measure',
      category: 'tracking',
      priority: 'low',
      title: 'Add waist & neck measurements',
      detail: 'Unlocks a more accurate body-fat estimate (US Navy method) than BMI alone.',
    });
  }

  if (cat === 'underweight' || cat === 'obese2' || cat === 'obese3') {
    add({
      id: 'health-check',
      category: 'health',
      priority: unsafeLoss ? 'high' : 'low',
      title: unsafeLoss ? 'You are already underweight' : 'Consider a check-up',
      detail: unsafeLoss
        ? 'Losing more weight is not recommended at your BMI. Focus on strength training and eating enough — a doctor or dietitian can help.'
        : 'At your BMI, a doctor or registered dietitian can tailor the plan and rule out issues.',
    });
  }

  actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  return {
    weightKg,
    trendWeightKg,
    weeklyRateKg: rate,
    bmi: { value: bmiValue, category: cat },
    healthyRange: healthyWeightRange(profile.heightCm),
    idealWeight: idealBodyWeight(profile.heightCm, profile.sex),
    bodyFat: bf ? { ...bf, category: bodyFatCategory(bf.value, profile.sex) } : null,
    leanMassKg,
    ffmi: { value: ff.ffmi, normalized: ff.normalized, category: ffmiCategory(ff.normalized, profile.sex) },
    bmr,
    tdee,
    target,
    macros,
    proteinPerMeal: proteinPerMeal(macros.proteinG),
    waterGoalMl: water,
    goalWeightKg,
    goalIsSuggested: userGoal == null && goalWeightKg != null,
    projection,
    trendGoalDate,
    training: {
      recommendedDays: recommendedDays(profile.experience),
      splitName: splitFor(plannedThisWeek).name,
      doneThisWeek,
      plannedThisWeek,
      streakWeeks,
      lowVolumeMuscles,
      stalledExerciseIds,
    },
    heartRateZones: heartRateZones(profile.age),
    actions,
  };
}
