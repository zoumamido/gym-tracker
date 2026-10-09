import {
  KCAL_PER_KG,
  CALORIE_FLOOR,
  MAX_DEFICIT_FRACTION,
  targetWeeklyChangeKg,
  calorieTarget,
  referenceWeight,
  macros,
  proteinPerMeal,
  CalorieInput,
} from '../nutrition';

const base: CalorieInput = { tdee: 2759, bmr: 1780, weightKg: 80, sex: 'male', goal: 'lose', pace: 'moderate', experience: 'intermediate' };

describe('constants', () => {
  it('match the science doc', () => {
    expect(KCAL_PER_KG).toBe(7700);
    expect(CALORIE_FLOOR).toEqual({ male: 1500, female: 1200 });
    expect(MAX_DEFICIT_FRACTION).toBe(0.25);
  });
});

describe('targetWeeklyChangeKg', () => {
  it('loss rates 0.5 / 0.75 / 1.0 %BW', () => {
    expect(targetWeeklyChangeKg('lose', 'slow', 'beginner', 80)).toBeCloseTo(-0.4, 10);
    expect(targetWeeklyChangeKg('lose', 'moderate', 'beginner', 80)).toBeCloseTo(-0.6, 10);
    expect(targetWeeklyChangeKg('lose', 'fast', 'advanced', 80)).toBeCloseTo(-0.8, 10);
  });
  it('gain rates %/wk: 0.28 / 0.18 / 0.09 × pace (0.75 / 1 / 1.25)', () => {
    expect(targetWeeklyChangeKg('gain', 'moderate', 'beginner', 80)).toBeCloseTo(0.224, 10);
    expect(targetWeeklyChangeKg('gain', 'moderate', 'intermediate', 80)).toBeCloseTo(0.144, 10);
    expect(targetWeeklyChangeKg('gain', 'moderate', 'advanced', 80)).toBeCloseTo(0.072, 10);
    expect(targetWeeklyChangeKg('gain', 'slow', 'beginner', 80)).toBeCloseTo(0.168, 10);
    expect(targetWeeklyChangeKg('gain', 'slow', 'advanced', 100)).toBeCloseTo(0.0675, 10);
    expect(targetWeeklyChangeKg('gain', 'fast', 'intermediate', 80)).toBeCloseTo(0.18, 10); // 0.225 %
    expect(targetWeeklyChangeKg('gain', 'fast', 'advanced', 100)).toBeCloseTo(0.1125, 10);
  });
  it('gain rates never exceed caps 0.35 / 0.23 / 0.12 %/wk', () => {
    expect(targetWeeklyChangeKg('gain', 'fast', 'beginner', 100)).toBeCloseTo(0.35, 10); // 0.28 × 1.25 = 0.35 = cap
    for (const pace of ['slow', 'moderate', 'fast'] as const) {
      expect(targetWeeklyChangeKg('gain', pace, 'beginner', 100)).toBeLessThanOrEqual(0.35 + 1e-12);
      expect(targetWeeklyChangeKg('gain', pace, 'intermediate', 100)).toBeLessThanOrEqual(0.23 + 1e-12);
      expect(targetWeeklyChangeKg('gain', pace, 'advanced', 100)).toBeLessThanOrEqual(0.12 + 1e-12);
    }
  });
  it('gain rate falls with experience at every pace', () => {
    for (const pace of ['slow', 'moderate', 'fast'] as const) {
      expect(targetWeeklyChangeKg('gain', pace, 'beginner', 80)).toBeGreaterThan(targetWeeklyChangeKg('gain', pace, 'intermediate', 80));
      expect(targetWeeklyChangeKg('gain', pace, 'intermediate', 80)).toBeGreaterThan(targetWeeklyChangeKg('gain', pace, 'advanced', 80));
    }
  });
  it('maintain = 0; invalid weight = 0', () => {
    expect(targetWeeklyChangeKg('maintain', 'fast', 'beginner', 80)).toBe(0);
    expect(targetWeeklyChangeKg('lose', 'fast', 'beginner', 0)).toBe(0);
    expect(targetWeeklyChangeKg('lose', 'fast', 'beginner', -5)).toBe(0);
    expect(targetWeeklyChangeKg('lose', 'fast', 'beginner', NaN)).toBe(0);
  });
});

describe('calorieTarget', () => {
  it('typical cut: 2759 TDEE, -0.6 kg/wk -> -660/day -> 2100 kcal', () => {
    const t = calorieTarget(base);
    expect(t.calories).toBe(2100);
    expect(t.dailyDelta).toBe(-659);
    expect(t.weeklyChangeKg).toBeCloseTo((-659 * 7) / 7700, 10);
    expect(t.weeklyChangePct).toBeCloseTo(((-659 * 7) / 7700 / 80) * 100, 10);
    expect(t.warnings).toEqual([]);
  });
  it('rounds calories to 10 kcal', () => {
    const t = calorieTarget({ ...base, goal: 'maintain', tdee: 2444 });
    expect(t.calories).toBe(2440);
    expect(t.calories % 10).toBe(0);
  });
  it('maintain and gain', () => {
    expect(calorieTarget({ ...base, goal: 'maintain' }).calories).toBe(2760);
    const g = calorieTarget({ ...base, goal: 'gain', experience: 'beginner' });
    // +0.224 kg/wk -> 246.4 kcal/day -> 3005.4 -> 3010
    expect(g.calories).toBe(3010);
    expect(g.dailyDelta).toBeGreaterThan(0);
    expect(g.warnings).toEqual([]);
  });
  it('caps deficit at 25% of TDEE', () => {
    const t = calorieTarget({ ...base, tdee: 2000, bmr: 1400, weightKg: 100, pace: 'fast' });
    // wanted -1100/day, capped at -500
    expect(t.calories).toBe(1500);
    expect(t.warnings).toHaveLength(1);
    expect(t.warnings[0]).toMatch(/25%/);
  });
  it('enforces sex-specific floor and warns below BMR', () => {
    const t = calorieTarget({ tdee: 1500, bmr: 1300, weightKg: 60, sex: 'female', goal: 'lose', pace: 'moderate', experience: 'beginner' });
    expect(t.calories).toBe(1200);
    expect(t.warnings).toHaveLength(3);
    expect(t.warnings[1]).toMatch(/1200/);
    expect(t.warnings[2]).toMatch(/BMR/);
  });
  it('TDEE below floor -> no deficit at all, with a specific warning', () => {
    const t = calorieTarget({ tdee: 1100, bmr: 1000, weightKg: 45, sex: 'female', goal: 'lose', pace: 'fast', experience: 'beginner' });
    expect(t.calories).toBe(1100);
    expect(t.dailyDelta).toBe(0);
    expect(t.warnings.some((w) => w.startsWith('Your maintenance is already below the safe minimum'))).toBe(true);
    expect(t.warnings.some((w) => w.startsWith('Calories kept at'))).toBe(false);
  });
  it('TDEE exactly at the floor -> delta 0 with the below-minimum warning', () => {
    const t = calorieTarget({ tdee: 1200, bmr: 1000, weightKg: 50, sex: 'female', goal: 'lose', pace: 'slow', experience: 'beginner' });
    expect(t.calories).toBe(1200);
    expect(t.dailyDelta).toBe(0);
    expect(t.warnings.some((w) => w.includes('already below the safe minimum of 1200'))).toBe(true);
  });
  it('TDEE just above floor -> calories = floor', () => {
    const t = calorieTarget({ tdee: 1300, bmr: 1000, weightKg: 55, sex: 'female', goal: 'lose', pace: 'moderate', experience: 'beginner' });
    expect(t.calories).toBe(1200);
    expect(t.warnings.some((w) => w.startsWith('Calories kept at the safe minimum of 1200'))).toBe(true);
  });
  it('cut never sets calories above TDEE', () => {
    for (const tdee of [900, 1100, 1200, 1250, 1500, 1600, 2000, 3000])
      for (const sex of ['male', 'female'] as const) {
        const t = calorieTarget({ ...base, tdee, bmr: tdee / 1.4, sex, pace: 'fast' });
        expect(t.dailyDelta).toBeLessThanOrEqual(5);
      }
  });
  it('male floor is 1500', () => {
    const t = calorieTarget({ ...base, tdee: 1800, bmr: 1400, weightKg: 90, pace: 'fast' });
    expect(t.calories).toBe(1500);
  });
  it('returns NaN for invalid TDEE / weight', () => {
    for (const bad of [{ tdee: NaN }, { tdee: 0 }, { weightKg: 0 }, { weightKg: -1 }]) {
      const t = calorieTarget({ ...base, ...bad });
      expect(t.calories).toBeNaN();
      expect(t.dailyDelta).toBeNaN();
      expect(t.weeklyChangeKg).toBeNaN();
    }
  });
});

describe('referenceWeight / macros', () => {
  it('reference weight is weight at BMI 27 only when BMI > 30', () => {
    expect(referenceWeight(80, 180)).toBe(80);
    expect(referenceWeight(90, 180)).toBe(90); // BMI 27.8: muscular lifters not adjusted
    expect(referenceWeight(97.2, 180)).toBe(97.2); // BMI exactly 30
    expect(referenceWeight(100, 180)).toBeCloseTo(87.48, 10); // 27 × 1.8²
    expect(referenceWeight(150, 180)).toBeCloseTo(87.48, 10);
    expect(referenceWeight(80, 0)).toBe(80);
  });
  it('typical cut macros (2100 kcal, 80 kg, lose)', () => {
    const m = macros({ calories: 2100, weightKg: 80, heightCm: 180, goal: 'lose' });
    expect(m.proteinG).toBe(176); // 2.2 g/kg
    expect(m.fatG).toBe(58); // 25% of kcal = 58.3 g > 0.6 g/kg floor (48)
    expect(m.carbsG).toBe(218); // (2100 - 704 - 525) / 4 = 217.75
    expect(m.fiberG).toBe(29); // 14 g / 1000 kcal
    expect(m.referenceWeightKg).toBe(80);
  });
  it('maintain/gain use 1.8 g/kg', () => {
    expect(macros({ calories: 2760, weightKg: 80, heightCm: 180, goal: 'maintain' }).proteinG).toBe(144);
    expect(macros({ calories: 3000, weightKg: 80, heightCm: 180, goal: 'gain' }).proteinG).toBe(144);
  });
  it('higher BMI uses adjusted reference weight', () => {
    const m = macros({ calories: 2400, weightKg: 100, heightCm: 180, goal: 'lose' });
    expect(m.referenceWeightKg).toBeCloseTo(87.48, 10);
    expect(m.proteinG).toBe(192); // 2.2 × 87.48
  });
  it('lean-mass protein: 2.6 g/kg LBM when cutting, 2.2 otherwise', () => {
    const cut = macros({ calories: 2100, weightKg: 80, heightCm: 180, goal: 'lose', leanMassKg: 64 });
    expect(cut.proteinG).toBe(166); // 2.6 × 64 = 166.4
    expect(cut.fatG).toBe(58);
    expect(cut.carbsG).toBe(227); // (2100 − 665.6 − 525) / 4 = 227.35
    expect(macros({ calories: 2760, weightKg: 80, heightCm: 180, goal: 'maintain', leanMassKg: 64 }).proteinG).toBe(141);
    expect(macros({ calories: 3000, weightKg: 80, heightCm: 180, goal: 'gain', leanMassKg: 64 }).proteinG).toBe(141);
  });
  it('implausible lean mass falls back to body-weight protein', () => {
    for (const leanMassKg of [0, -5, 80, 90, null, undefined]) {
      expect(macros({ calories: 2100, weightKg: 80, heightCm: 180, goal: 'lose', leanMassKg }).proteinG).toBe(176);
    }
  });
  it('fat floor 0.6 g/kg wins on low calories', () => {
    const m = macros({ calories: 1600, weightKg: 80, heightCm: 180, goal: 'maintain' });
    // 25% of 1600 / 9 = 44.4 < 48
    expect(m.fatG).toBe(48);
  });
  it('very low budget: fat at floor, protein trimmed, carbs 0', () => {
    const m = macros({ calories: 1000, weightKg: 80, heightCm: 180, goal: 'lose' });
    expect(m.fatG).toBe(48);
    expect(m.proteinG).toBe(142); // (1000 - 432) / 4
    expect(m.carbsG).toBe(0);
    expect(m.proteinG * 4 + m.fatG * 9 + m.carbsG * 4).toBeLessThanOrEqual(1000 + 5);
  });
  it('macro kcal sum approximately equals target', () => {
    for (const cal of [1800, 2200, 2600, 3200]) {
      const m = macros({ calories: cal, weightKg: 75, heightCm: 178, goal: 'maintain' });
      expect(Math.abs(m.proteinG * 4 + m.fatG * 9 + m.carbsG * 4 - cal)).toBeLessThan(12);
    }
  });
  it('NaN macros for invalid calories', () => {
    const m = macros({ calories: NaN, weightKg: 80, heightCm: 180, goal: 'lose' });
    expect(m.proteinG).toBeNaN();
    expect(m.carbsG).toBeNaN();
    expect(macros({ calories: 0, weightKg: 80, heightCm: 180, goal: 'lose' }).fatG).toBeNaN();
    expect(macros({ calories: 2000, weightKg: 0, heightCm: 180, goal: 'lose' }).proteinG).toBeNaN();
  });
  it('proteinPerMeal', () => {
    expect(proteinPerMeal(160)).toBe(40);
    expect(proteinPerMeal(176, 3)).toBe(59);
    expect(proteinPerMeal(0)).toBe(0);
    expect(proteinPerMeal(NaN)).toBe(0);
    expect(proteinPerMeal(160, 0)).toBe(0);
    expect(proteinPerMeal(160, -2)).toBe(0);
  });
});
