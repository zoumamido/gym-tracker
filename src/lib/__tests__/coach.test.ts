import { buildCoachReport, suggestedGoalWeight, CoachInput } from '../coach';
import { EXERCISE_MAP } from '../../data/exercises';
import { addDaysToKey } from '../dates';
import type { Profile, SetLog, Workout } from '../types';
import { projectWeight, WeighIn } from '../projection';
import { bmrKatchMcArdle, tdee } from '../body';

const NOW = new Date(2026, 9, 9, 10, 0); // Fri

const PROFILE: Profile = {
  name: 'Test',
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  goalWeightKg: 75,
  bodyFatPct: null,
  waistCm: null,
  neckCm: null,
  hipCm: null,
  activity: 'moderate',
  goal: 'lose',
  pace: 'moderate',
  experience: 'intermediate',
  trainingGoal: 'hypertrophy',
  daysPerWeek: 4,
  equipment: 'gym',
  sessionMinutes: 60,
};

const lookup = (id: string) => EXERCISE_MAP[id];
const input = (over: Partial<CoachInput> = {}, profile: Partial<Profile> = {}): CoachInput => ({
  profile: { ...PROFILE, ...profile },
  weighIns: [],
  workouts: [],
  lookup,
  unit: 'kg',
  now: NOW,
  ...over,
});

let n = 0;
const s = (w: number, r: number): SetLog => ({ id: `s${++n}`, type: 'normal', weightKg: w, reps: r, done: true });
const workout = (start: Date, exercises: [string, SetLog[]][] = [['bench_press', [s(80, 8), s(80, 8), s(80, 8)]]]): Workout => ({
  id: `w${++n}`,
  name: 'W',
  startedAt: start.getTime(),
  endedAt: start.getTime() + 3_600_000,
  exercises: exercises.map(([exerciseId, sets]) => ({ id: `e${++n}`, exerciseId, sets, repMin: 8, repMax: 12, restSec: 90 })),
});
const weighIns = (days: number, start: number, perDay: number, lastKey = '2026-10-09'): WeighIn[] =>
  Array.from({ length: days }, (_, i) => ({ date: addDaysToKey(lastKey, i - days + 1), weightKg: start + perDay * i }));

const PRIORITY = { high: 0, medium: 1, low: 2 } as const;

describe('suggestedGoalWeight', () => {
  it('lose: 10% milestone but not below the top of the healthy range when above it', () => {
    expect(suggestedGoalWeight({ ...PROFILE, goal: 'lose' }, 100)).toBe(90);
    expect(suggestedGoalWeight({ ...PROFILE, goal: 'lose' }, 82)).toBe(80.5); // healthy max 80.68
  });
  it('lose when already in the healthy range: 10% but not below its bottom', () => {
    expect(suggestedGoalWeight({ ...PROFILE, goal: 'lose' }, 70)).toBe(63);
    expect(suggestedGoalWeight({ ...PROFILE, goal: 'lose' }, 62)).toBe(60); // 59.94 -> 60
  });
  it('lose at or below the bottom of the healthy range: null', () => {
    expect(suggestedGoalWeight({ ...PROFILE, goal: 'lose' }, 59.94)).toBeNull();
    expect(suggestedGoalWeight({ ...PROFILE, goal: 'lose' }, 55)).toBeNull();
    expect(suggestedGoalWeight({ ...PROFILE, goal: 'lose' }, 60)).toBe(60);
  });
  it('gain: +5% rounded to 0.5', () => {
    expect(suggestedGoalWeight({ ...PROFILE, goal: 'gain' }, 80)).toBe(84);
    expect(suggestedGoalWeight({ ...PROFILE, goal: 'gain' }, 71)).toBe(74.5);
  });
  it('maintain: null', () => {
    expect(suggestedGoalWeight({ ...PROFILE, goal: 'maintain' }, 80)).toBeNull();
  });
});

describe('buildCoachReport — new user, typical profile', () => {
  const r = buildCoachReport(input());

  it('core numbers match hand calculations', () => {
    expect(r.weightKg).toBe(80);
    expect(r.trendWeightKg).toBeNull();
    expect(r.weeklyRateKg).toBeNull();
    expect(r.bmi.value).toBeCloseTo(24.691, 3);
    expect(r.bmi.category).toBe('normal');
    expect(r.bmr).toEqual({ value: 1780, method: 'mifflin' }); // BMI-derived BF must not trigger Katch
    expect(r.tdee).toBeCloseTo(2759, 6);
    expect(r.target.calories).toBe(2100);
    expect(r.macros).toMatchObject({ proteinG: 176, fatG: 58, carbsG: 218, fiberG: 29 });
    expect(r.proteinPerMeal).toBe(44);
    expect(r.waterGoalMl).toBe(3150); // 2800 + 600 × (60×4/7)/60 = 3142.9 -> 3150
    expect(r.bodyFat).toMatchObject({ method: 'bmi', category: 'average' });
    expect(r.bodyFat!.value).toBeCloseTo(20.33, 2);
    expect(r.leanMassKg).toBeCloseTo(80 * (1 - 0.2033), 1);
    expect(r.healthyRange.max).toBeCloseTo(80.676, 3);
    expect(r.heartRateZones).toHaveLength(5);
  });
  it('no NaN in key outputs', () => {
    const nums = [
      r.weightKg,
      r.bmi.value,
      r.leanMassKg,
      r.ffmi.value,
      r.ffmi.normalized,
      r.bmr.value,
      r.tdee,
      r.target.calories,
      r.target.dailyDelta,
      r.target.weeklyChangeKg,
      r.macros.proteinG,
      r.macros.fatG,
      r.macros.carbsG,
      r.macros.fiberG,
      r.proteinPerMeal,
      r.waterGoalMl,
      r.idealWeight.average,
      r.healthyRange.min,
      r.healthyRange.max,
      ...r.projection.points.map((p) => p.weightKg),
    ];
    for (const v of nums) expect(Number.isFinite(v)).toBe(true);
    for (const a of r.actions) {
      expect(a.title).not.toMatch(/NaN|undefined|—/);
      expect(a.detail).not.toMatch(/NaN|undefined/);
    }
  });
  it('goal and projection', () => {
    expect(r.goalWeightKg).toBe(75);
    expect(r.goalIsSuggested).toBe(false);
    expect(r.projection.goalDay).not.toBeNull();
    // ~0.6 kg/week -> 5 kg takes roughly 8–12 weeks
    expect(r.projection.goalDay!).toBeGreaterThan(50);
    expect(r.projection.goalDay!).toBeLessThan(100);
    expect(r.projection.goalDate).toBe(addDaysToKey('2026-10-09', r.projection.goalDay!));
    expect(r.trendGoalDate).toBeNull();
  });
  it('training summary', () => {
    expect(r.training).toMatchObject({
      recommendedDays: 4,
      splitName: 'Upper / Lower',
      doneThisWeek: 0,
      plannedThisWeek: 4,
      streakWeeks: 0,
      lowVolumeMuscles: [],
      stalledExerciseIds: [],
    });
  });
  it('expected actions, sorted by priority', () => {
    const ids = r.actions.map((a) => a.id);
    expect(ids.sort()).toEqual(['calories', 'first-workout', 'measure', 'protein', 'sleep', 'steps', 'water', 'weigh-in'].sort());
    for (let i = 1; i < r.actions.length; i++) expect(PRIORITY[r.actions[i].priority]).toBeGreaterThanOrEqual(PRIORITY[r.actions[i - 1].priority]);
    expect(r.actions[0].priority).toBe('high');
    const cal = r.actions.find((a) => a.id === 'calories')!;
    expect(cal.title).toBe('Eat about 2100 kcal a day');
    expect(cal.detail).toContain('659 kcal below maintenance');
    expect(r.actions.find((a) => a.id === 'water')!.title).toBe('Drink 3.15 L of water a day');
    expect(new Set(r.actions.map((a) => a.id)).size).toBe(r.actions.length);
  });
});

describe('buildCoachReport — scenarios', () => {
  it('uses the latest weigh-in and computes a trend rate', () => {
    const r = buildCoachReport(input({ weighIns: weighIns(21, 82, -0.1) }));
    expect(r.weightKg).toBeCloseTo(80, 10);
    expect(r.trendWeightKg).not.toBeNull();
    expect(r.trendWeightKg!).toBeGreaterThan(80); // trend lags behind a falling weight
    expect(r.weeklyRateKg!).toBeLessThan(0);
    expect(r.trendGoalDate).not.toBeNull();
    const ids = r.actions.map((a) => a.id);
    expect(ids).not.toContain('weigh-in');
    expect(ids).not.toContain('trend-stalled');
  });
  it('lose goal with rising trend -> trend-stalled (high)', () => {
    const r = buildCoachReport(input({ weighIns: weighIns(21, 79, 0.05) }));
    const a = r.actions.find((x) => x.id === 'trend-stalled');
    expect(a).toBeDefined();
    expect(a!.priority).toBe('high');
  });
  it('lose goal losing > 1.2%/week -> trend-fast', () => {
    const r = buildCoachReport(input({ weighIns: weighIns(21, 90, -0.3) }));
    expect(r.actions.map((a) => a.id)).toContain('trend-fast');
  });
  it('gain goal with falling trend -> trend-gain-stalled; fast gain -> trend-gain-fast', () => {
    const stalled = buildCoachReport(input({ weighIns: weighIns(21, 80, -0.02) }, { goal: 'gain', goalWeightKg: null }));
    expect(stalled.actions.map((a) => a.id)).toContain('trend-gain-stalled');
    expect(stalled.goalIsSuggested).toBe(true);
    const fast = buildCoachReport(input({ weighIns: weighIns(21, 70, 0.15) }, { goal: 'gain', goalWeightKg: null }));
    expect(fast.actions.map((a) => a.id)).toContain('trend-gain-fast');
    expect(fast.target.dailyDelta).toBeGreaterThan(0);
  });
  it('stale weigh-in (≥ 3 days) asks for a new one', () => {
    const r = buildCoachReport(input({ weighIns: [{ date: '2026-10-06', weightKg: 80 }] }));
    expect(r.actions.map((a) => a.id)).toContain('weigh-in');
    const fresh = buildCoachReport(input({ weighIns: [{ date: '2026-10-07', weightKg: 80 }] }));
    expect(fresh.actions.map((a) => a.id)).not.toContain('weigh-in');
  });
  it('workouts this week below plan -> weekly-sessions', () => {
    const r = buildCoachReport(input({ workouts: [workout(new Date(2026, 9, 5, 18)), workout(new Date(2026, 9, 7, 18))] }));
    expect(r.training.doneThisWeek).toBe(2);
    const a = r.actions.find((x) => x.id === 'weekly-sessions')!;
    expect(a.title).toBe('Train 2 more times this week');
    expect(r.actions.map((x) => x.id)).not.toContain('first-workout');
    expect(r.training.lowVolumeMuscles.length).toBeGreaterThan(0);
    expect(r.actions.map((x) => x.id)).toContain('volume');
  });
  it('one session left uses singular wording', () => {
    const ws = [5, 6, 7].map((d) => workout(new Date(2026, 9, d, 18)));
    expect(buildCoachReport(input({ workouts: ws })).actions.find((x) => x.id === 'weekly-sessions')!.title).toBe('Train 1 more time this week');
  });
  it('weekly target hit -> weekly-done (low)', () => {
    const ws = [5, 6, 7, 8].map((d) => workout(new Date(2026, 9, d, 18)));
    const r = buildCoachReport(input({ workouts: ws }));
    expect(r.actions.find((x) => x.id === 'weekly-done')!.priority).toBe('low');
  });
  it('plannedDaysPerWeek overrides profile days', () => {
    const r = buildCoachReport(input({ plannedDaysPerWeek: 3 }));
    expect(r.training.plannedThisWeek).toBe(3);
    expect(r.training.splitName).toBe('Full Body ×3');
  });
  it('8+ week streak suggests a deload', () => {
    const ws = Array.from({ length: 9 }, (_, i) => workout(new Date(2026, 9, 6 - 7 * i, 18)));
    const r = buildCoachReport(input({ workouts: ws }));
    expect(r.training.streakWeeks).toBe(9);
    expect(r.actions.map((a) => a.id)).toContain('deload');
  });
  it('one stalled lift -> stall action; two -> deload', () => {
    const stall = (id: string) => [1, 2, 3].map((d) => workout(new Date(2026, 9, d + 4, 18), [[id, [s(100, 9), s(100, 9)]]]));
    const one = buildCoachReport(input({ workouts: stall('squat') }));
    expect(one.training.stalledExerciseIds).toEqual(['squat']);
    expect(one.actions.find((a) => a.id === 'stall')!.title).toBe(`${EXERCISE_MAP.squat.name} has stalled`);
    const two = buildCoachReport(input({ workouts: [...stall('squat'), ...stall('bench_press')] }));
    expect(two.training.stalledExerciseIds.sort()).toEqual(['bench_press', 'squat']);
    expect(two.actions.map((a) => a.id)).toContain('deload');
  });
  it('tape measurements -> navy body fat, Katch BMR, no measure action', () => {
    const r = buildCoachReport(input({}, { waistCm: 85, neckCm: 38 }));
    expect(r.bodyFat!.method).toBe('navy');
    expect(r.bodyFat!.value).toBeCloseTo(16.107, 2);
    expect(r.bmr.method).toBe('katch');
    expect(r.bmr.value).toBeCloseTo(370 + 21.6 * 80 * (1 - 0.16107), 0);
    expect(r.actions.map((a) => a.id)).not.toContain('measure');
  });
  it('underweight / obese II+ -> health check; maintain has no steps action', () => {
    const under = buildCoachReport(input({}, { weightKg: 55, goal: 'gain', goalWeightKg: null }));
    expect(under.bmi.category).toBe('underweight');
    expect(under.actions.find((a) => a.id === 'health-check')!.priority).toBe('low');
    const obese = buildCoachReport(input({}, { weightKg: 120, goalWeightKg: null }));
    expect(obese.bmi.category).toBe('obese2');
    expect(obese.actions.map((a) => a.id)).toContain('health-check');
    expect(obese.goalWeightKg).toBe(108);
    expect(obese.macros.referenceWeightKg).toBeCloseTo(87.48, 6); // BMI 27 weight
    const maintain = buildCoachReport(input({}, { goal: 'maintain', goalWeightKg: null }));
    expect(maintain.actions.map((a) => a.id)).not.toContain('steps');
    expect(maintain.goalWeightKg).toBeNull();
    expect(maintain.projection.goalDate).toBeNull();
    expect(maintain.actions.find((a) => a.id === 'calories')!.detail).toContain('maintenance');
  });
  it('water override and imperial unit', () => {
    const r = buildCoachReport(input({ waterGoalOverrideMl: 3000, unit: 'lb' }));
    expect(r.waterGoalMl).toBe(3000);
    expect(r.actions.find((a) => a.id === 'water')!.title).toMatch(/oz/);
  });
  it('female typical profile has sensible numbers', () => {
    const r = buildCoachReport(input({}, { sex: 'female', heightCm: 165, weightKg: 65, goalWeightKg: 60, hipCm: 100 }));
    expect(r.bmr.value).toBeCloseTo(10 * 65 + 6.25 * 165 - 150 - 161, 6);
    expect(r.target.calories).toBeGreaterThanOrEqual(1200);
    expect(r.target.calories).toBeLessThan(r.tdee);
    expect(Number.isFinite(r.macros.carbsG)).toBe(true);
  });
  it('does not use the real clock when now is given (deterministic)', () => {
    const a = buildCoachReport(input());
    const b = buildCoachReport(input());
    expect(a.projection.goalDate).toBe(b.projection.goalDate);
    expect(a.actions.map((x) => x.id)).toEqual(b.actions.map((x) => x.id));
  });
});

describe('buildCoachReport — review changes', () => {
  it("underweight with goal 'lose' is switched to maintenance", () => {
    const r = buildCoachReport(input({}, { weightKg: 55, goal: 'lose', goalWeightKg: 50 }));
    expect(r.bmi.category).toBe('underweight');
    expect(r.goalWeightKg).toBeNull();
    expect(r.goalIsSuggested).toBe(false);
    expect(r.projection.goalDay).toBeNull();
    expect(r.projection.goalDate).toBeNull();
    expect(Math.abs(r.target.dailyDelta)).toBeLessThanOrEqual(5);
    expect(r.target.warnings[0]).toMatch(/BMI is below the healthy range/);
    const hc = r.actions.find((a) => a.id === 'health-check')!;
    expect(hc.priority).toBe('high');
    expect(hc.title).toBe('You are already underweight');
    expect(r.actions.map((a) => a.id)).not.toContain('steps');
    expect(r.macros.proteinG).toBe(99); // maintain protein 1.8 g/kg × 55
  });
  it('BMI just above 18.5 is not treated as underweight', () => {
    const w = 60; // BMI 18.52
    const r = buildCoachReport(input({}, { weightKg: w, goal: 'lose', goalWeightKg: 58 }));
    expect(r.bmi.category).toBe('normal');
    expect(r.target.dailyDelta).toBeLessThan(0);
    expect(r.goalWeightKg).toBe(58);
  });
  it('low-volume list flags only sets < 0.6 × MEV and skips traps/forearms/lower back/front delts/glutes', () => {
    // 5 chest sets: 5 ≥ 0.6 × 8 = 4.8 -> not flagged; 4 lat sets < 4.8 -> flagged
    const w = workout(new Date(2026, 9, 8, 18), [
      ['bench_press', [s(80, 8), s(80, 8), s(80, 8), s(80, 8), s(80, 8)]],
      ['lat_pulldown', [s(60, 10), s(60, 10), s(60, 10), s(60, 10)]],
    ]);
    const r = buildCoachReport(input({ workouts: [w] }));
    const low = r.training.lowVolumeMuscles;
    expect(low).not.toContain('chest');
    expect(low).toContain('lats');
    expect(low).toContain('quads');
    for (const m of ['traps', 'forearms', 'lower_back', 'front_delts', 'glutes']) expect(low).not.toContain(m);
  });
  it('deload action uses weeksSinceDeload ≥ 8 (a recent light week resets it)', () => {
    const mk = (i: number, n: number) =>
      workout(new Date(2026, 9, 6 - 7 * i, 18), [['bench_press', Array.from({ length: n }, () => s(60, 10))]]);
    const hard = Array.from({ length: 10 }, (_, i) => mk(i, 10));
    expect(buildCoachReport(input({ workouts: hard })).actions.map((a) => a.id)).toContain('deload');
    // week 3 was a deload (3 sets vs 10) -> only 3 hard weeks since
    const withDeload = Array.from({ length: 10 }, (_, i) => mk(i, i === 3 ? 3 : 10));
    const r = buildCoachReport(input({ workouts: withDeload }));
    expect(r.training.streakWeeks).toBe(10); // streak still counts the light week
    expect(r.actions.map((a) => a.id)).not.toContain('deload');
    // exactly 8 hard weeks -> deload; 7 -> not
    const eight = Array.from({ length: 8 }, (_, i) => mk(i, 10));
    expect(buildCoachReport(input({ workouts: eight })).actions.map((a) => a.id)).toContain('deload');
    const seven = Array.from({ length: 7 }, (_, i) => mk(i, 10));
    expect(buildCoachReport(input({ workouts: seven })).actions.map((a) => a.id)).not.toContain('deload');
  });
  it('gain "too fast" threshold = max(0.3, 1.75 × planned %/week)', () => {
    let flaggedBelowOldThreshold = false;
    for (const perDay of [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1]) {
      const r = buildCoachReport(input({ weighIns: weighIns(21, 70, perDay) }, { goal: 'gain', goalWeightKg: null }));
      const pct = (r.weeklyRateKg! / r.trendWeightKg!) * 100;
      const threshold = Math.max(0.3, Math.abs(r.target.weeklyChangePct) * 1.75);
      const flagged = r.actions.some((a) => a.id === 'trend-gain-fast');
      expect(flagged).toBe(pct > threshold);
      if (flagged && pct < 0.6) flaggedBelowOldThreshold = true;
    }
    expect(flaggedBelowOldThreshold).toBe(true);
  });
  it('measured / Navy body fat -> LBM protein and a Katch-based projection', () => {
    const r = buildCoachReport(input({}, { waistCm: 85, neckCm: 38 }));
    expect(r.bmr.method).toBe('katch');
    expect(r.macros.proteinG).toBe(Math.round(2.6 * r.leanMassKg));
    const lean0 = r.leanMassKg;
    const expected = projectWeight({
      startWeightKg: 80,
      sex: 'male',
      age: 30,
      heightCm: 180,
      activity: 'moderate',
      dailyCalories: r.target.calories,
      days: 365,
      goalKg: 75,
      tdeeAt: (w) => tdee(bmrKatchMcArdle(Math.max(1, lean0 + 0.25 * (w - 80))), 'moderate'),
    });
    expect(r.projection.goalDay).toBe(expected.goalDay);
    expect(r.projection.points).toHaveLength(expected.points.length);
    r.projection.points.forEach((p, i) => expect(p.weightKg).toBeCloseTo(expected.points[i].weightKg, 8));
    // differs from the Mifflin model
    const mifflin = projectWeight({ startWeightKg: 80, sex: 'male', age: 30, heightCm: 180, activity: 'moderate', dailyCalories: r.target.calories, days: 365, goalKg: 75 });
    expect(mifflin.points[1].weightKg).not.toBeCloseTo(r.projection.points[1].weightKg, 6);
  });
  it('measured body fat (entered) also uses Katch; BMI-estimated does not', () => {
    const measured = buildCoachReport(input({}, { bodyFatPct: 15 }));
    expect(measured.bmr.method).toBe('katch');
    expect(measured.bmr.value).toBeCloseTo(370 + 21.6 * 68, 6);
    expect(measured.macros.proteinG).toBe(Math.round(2.6 * 68));
    const implausible = buildCoachReport(input({}, { bodyFatPct: 70 }));
    expect(implausible.bmr.method).toBe('mifflin');
    expect(implausible.macros.proteinG).toBe(176);
  });
  it('typical profiles never produce NaN in the projection', () => {
    for (const sex of ['male', 'female'] as const)
      for (const goal of ['lose', 'maintain', 'gain'] as const)
        for (const waist of [null, 85]) {
          const r = buildCoachReport(input({}, { sex, goal, goalWeightKg: null, waistCm: waist, neckCm: waist ? 36 : null, hipCm: 100 }));
          for (const p of r.projection.points) expect(Number.isFinite(p.weightKg)).toBe(true);
          expect(Number.isFinite(r.target.calories)).toBe(true);
        }
  });
});
