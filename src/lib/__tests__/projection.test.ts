import { normalizeWeighIns, trendSeries, weeklyRate, estimateGoalDate, projectWeight, TrendPoint, ProjectionInput } from '../projection';
import { addDaysToKey } from '../dates';

describe('normalizeWeighIns', () => {
  it('sorts by date and keeps the LAST entry per day', () => {
    const r = normalizeWeighIns([
      { date: '2026-10-09', weightKg: 80 },
      { date: '2026-10-07', weightKg: 81 },
      { date: '2026-10-09', weightKg: 79.5 },
      { date: '2026-10-08', weightKg: 80.5 },
    ]);
    expect(r).toEqual([
      { date: '2026-10-07', weightKg: 81 },
      { date: '2026-10-08', weightKg: 80.5 },
      { date: '2026-10-09', weightKg: 79.5 },
    ]);
  });
  it('drops invalid weights and malformed dates', () => {
    const r = normalizeWeighIns([
      { date: '2026-10-01', weightKg: 0 },
      { date: '2026-10-02', weightKg: -80 },
      { date: '2026-10-03', weightKg: NaN },
      { date: '2026-10-04', weightKg: Infinity },
      { date: '2026-10-5', weightKg: 80 },
      { date: 'yesterday', weightKg: 80 },
      { date: '2026-10-06', weightKg: 80 },
    ]);
    expect(r).toEqual([{ date: '2026-10-06', weightKg: 80 }]);
  });
  it('an invalid later entry does not erase a valid earlier one on the same day', () => {
    const r = normalizeWeighIns([
      { date: '2026-10-06', weightKg: 80 },
      { date: '2026-10-06', weightKg: NaN },
    ]);
    expect(r).toEqual([{ date: '2026-10-06', weightKg: 80 }]);
  });
  it('is idempotent and does not mutate input', () => {
    const input = [
      { date: '2026-10-09', weightKg: 80 },
      { date: '2026-10-01', weightKg: 82 },
    ];
    const copy = JSON.parse(JSON.stringify(input));
    const once = normalizeWeighIns(input);
    expect(normalizeWeighIns(once)).toEqual(once);
    expect(input).toEqual(copy);
    expect(normalizeWeighIns([])).toEqual([]);
  });
});

describe('trendSeries', () => {
  it('empty in, empty out', () => {
    expect(trendSeries([])).toEqual([]);
  });
  it('first trend = first weight, then 10% EMA', () => {
    const t = trendSeries([
      { date: '2026-10-01', weightKg: 80 },
      { date: '2026-10-02', weightKg: 81 },
      { date: '2026-10-03', weightKg: 79 },
    ]);
    expect(t[0].trend).toBe(80);
    expect(t[1].trend).toBeCloseTo(80.1, 10);
    expect(t[2].trend).toBeCloseTo(80.1 + 0.1 * (79 - 80.1), 10);
    expect(t[2].weightKg).toBe(79);
  });
  it('gap of g days uses 1-(1-α)^g', () => {
    const t = trendSeries([
      { date: '2026-10-01', weightKg: 80 },
      { date: '2026-10-04', weightKg: 83 },
    ]);
    expect(t[1].trend).toBeCloseTo(80 + (1 - 0.9 ** 3) * 3, 10); // 80.813
    expect(t[1].trend).toBeCloseTo(80.813, 3);
  });
  it('gap filter equals the daily filter with the reading repeated on missing days', () => {
    const gap = trendSeries([
      { date: '2026-10-01', weightKg: 80 },
      { date: '2026-10-05', weightKg: 78 },
    ]);
    const daily = trendSeries([
      { date: '2026-10-01', weightKg: 80 },
      { date: '2026-10-02', weightKg: 78 },
      { date: '2026-10-03', weightKg: 78 },
      { date: '2026-10-04', weightKg: 78 },
      { date: '2026-10-05', weightKg: 78 },
    ]);
    expect(gap[1].trend).toBeCloseTo(daily[4].trend, 10);
  });
  it('gap across DST is still counted in calendar days', () => {
    const t = trendSeries([
      { date: '2026-03-28', weightKg: 80 },
      { date: '2026-03-30', weightKg: 82 },
    ]);
    expect(t[1].trend).toBeCloseTo(80 + (1 - 0.81) * 2, 10);
  });
  it('sorts/dedupes before smoothing', () => {
    const t = trendSeries([
      { date: '2026-10-02', weightKg: 81 },
      { date: '2026-10-01', weightKg: 90 },
      { date: '2026-10-01', weightKg: 80 },
    ]);
    expect(t.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-02']);
    expect(t[0].trend).toBe(80);
  });
  it('clamps alpha to [0.01, 1]', () => {
    const data = [
      { date: '2026-10-01', weightKg: 80 },
      { date: '2026-10-02', weightKg: 82 },
    ];
    expect(trendSeries(data, 5)[1].trend).toBeCloseTo(82, 10);
    expect(trendSeries(data, 0)[1].trend).toBeCloseTo(80.02, 10);
    expect(trendSeries(data, 0.25)[1].trend).toBeCloseTo(80.5, 10);
  });
});

describe('weeklyRate', () => {
  const linear = (days: number, start: number, perDay: number, from = '2026-09-01'): TrendPoint[] =>
    Array.from({ length: days }, (_, i) => ({ date: addDaysToKey(from, i), weightKg: start + perDay * i, trend: start + perDay * i }));

  it('slope × 7 for a linear trend', () => {
    expect(weeklyRate(linear(15, 80, -0.1))).toBeCloseTo(-0.7, 10);
    expect(weeklyRate(linear(21, 70, 0.05))).toBeCloseTo(0.35, 10);
  });
  it('0 for a flat trend', () => {
    expect(weeklyRate(linear(10, 80, 0))).toBeCloseTo(0, 10);
  });
  it('null with < 2 points or span < 7 days', () => {
    expect(weeklyRate([])).toBeNull();
    expect(weeklyRate(linear(1, 80, 0))).toBeNull();
    expect(weeklyRate(linear(7, 80, -0.1))).toBeNull(); // span 6 days
    expect(weeklyRate(linear(8, 80, -0.1))).toBeCloseTo(-0.7, 10); // span 7 days
  });
  it('only uses the last windowDays', () => {
    const old = linear(30, 90, 0.5, '2026-08-01'); // steep gain long ago
    const recent = linear(15, 80, -0.1, '2026-09-20');
    expect(weeklyRate([...old, ...recent])).toBeCloseTo(-0.7, 10);
  });
  it('works with sparse points', () => {
    const pts: TrendPoint[] = [
      { date: '2026-10-01', weightKg: 80, trend: 80 },
      { date: '2026-10-15', weightKg: 79, trend: 79 },
    ];
    expect(weeklyRate(pts)).toBeCloseTo(-0.5, 10);
  });
});

describe('estimateGoalDate', () => {
  it('computes ceil(diff / rate × 7) days ahead', () => {
    expect(estimateGoalDate(80, 75, -0.5, '2026-10-09')).toBe('2026-12-18'); // 70 days
    expect(estimateGoalDate(70, 72, 0.3, '2026-10-09')).toBe(addDaysToKey('2026-10-09', Math.ceil((2 / 0.3) * 7)));
  });
  it('returns fromKey when already at goal (±0.05)', () => {
    expect(estimateGoalDate(80, 80.04, null, '2026-10-09')).toBe('2026-10-09');
    expect(estimateGoalDate(80, 80, 0.5, '2026-10-09')).toBe('2026-10-09');
  });
  it('null when moving away, ~0 rate, no rate, too far, or invalid', () => {
    expect(estimateGoalDate(80, 75, 0.5, '2026-10-09')).toBeNull();
    expect(estimateGoalDate(80, 75, -0.005, '2026-10-09')).toBeNull();
    expect(estimateGoalDate(80, 75, null, '2026-10-09')).toBeNull();
    expect(estimateGoalDate(150, 60, -0.1, '2026-10-09')).toBeNull(); // 6300 days > 3650
    expect(estimateGoalDate(NaN, 75, -0.5, '2026-10-09')).toBeNull();
    expect(estimateGoalDate(80, NaN, -0.5, '2026-10-09')).toBeNull();
  });
});

describe('projectWeight', () => {
  const base: ProjectionInput = { startWeightKg: 80, sex: 'male', age: 30, heightCm: 180, activity: 'moderate', dailyCalories: 2100, days: 28 };

  it('day 1 of a deficit: adaptation scaled by deficit severity (hand computed)', () => {
    const r = projectWeight({ ...base, days: 1 });
    expect(r.points).toHaveLength(2);
    expect(r.points[0]).toEqual({ day: 0, weightKg: 80 });
    expect(r.points[1].day).toBe(1);
    // deficit 659 / 2759 = 23.9% -> severity 0.955 -> expenditure 2759 − 2759×0.05×0.955 = 2627.2
    const severity = Math.min(1, (2759 - 2100) / 2759 / 0.25);
    const exp = 2759 - 2759 * 0.05 * severity;
    expect(r.points[1].weightKg).toBeCloseTo(80 + (2100 - exp) / 7700, 10);
    expect(r.points[1].weightKg).toBeCloseTo(79.9315, 4);
  });
  it('a deficit ≥ 25% of TDEE gets the full adaptation', () => {
    const r = projectWeight({ ...base, dailyCalories: 1800, days: 1 });
    expect(r.points[1].weightKg).toBeCloseTo(80 + (1800 - 2759 * 0.95) / 7700, 10);
  });
  it('a small deficit never projects a gain', () => {
    for (let cal = 2000; cal < 2759; cal += 37) {
      const r = projectWeight({ ...base, dailyCalories: cal, days: 1 });
      expect(r.points[1].weightKg).toBeLessThan(80);
    }
    const tiny = projectWeight({ ...base, dailyCalories: 2700, days: 90 });
    for (let i = 1; i < tiny.points.length; i++) expect(tiny.points[i].weightKg).toBeLessThanOrEqual(tiny.points[i - 1].weightKg);
  });
  it('tdeeAt overrides the Mifflin × activity model', () => {
    const r = projectWeight({ ...base, dailyCalories: 2000, days: 1, tdeeAt: () => 2500 });
    // deficit 500 / 2500 = 20% -> severity 0.8 -> expenditure 2500 − 2500×0.05×0.8 = 2400
    expect(r.points[1].weightKg).toBeCloseTo(80 - 400 / 7700, 10);
    const seen: number[] = [];
    projectWeight({ ...base, dailyCalories: 3000, days: 3, tdeeAt: (w) => (seen.push(w), 2500) });
    expect(seen[0]).toBe(80);
    expect(seen).toHaveLength(3);
    expect(seen[1]).toBeCloseTo(80 + 500 / 7700, 10);
  });
  it('tdeeAt returning a non-positive or non-finite value stops the simulation', () => {
    expect(projectWeight({ ...base, tdeeAt: () => NaN }).points).toEqual([{ day: 0, weightKg: 80 }]);
    expect(projectWeight({ ...base, tdeeAt: () => 0 }).points).toEqual([{ day: 0, weightKg: 80 }]);
  });
  it('no adaptation in a surplus', () => {
    const r = projectWeight({ ...base, dailyCalories: 3000, days: 1 });
    expect(r.points[1].weightKg).toBeCloseTo(80 + (3000 - 2759) / 7700, 10);
  });
  it('exact maintenance keeps weight constant', () => {
    const r = projectWeight({ ...base, dailyCalories: 2759, days: 14 });
    for (const p of r.points) expect(p.weightKg).toBeCloseTo(80, 10);
  });
  it('custom adaptation', () => {
    const r = projectWeight({ ...base, days: 1, adaptation: 0 });
    expect(r.points[1].weightKg).toBeCloseTo(80 + (2100 - 2759) / 7700, 10);
  });
  it('weekly points plus final day, monotonic loss in deficit', () => {
    const r = projectWeight({ ...base, days: 30 });
    expect(r.points.map((p) => p.day)).toEqual([0, 7, 14, 21, 28, 30]);
    for (let i = 1; i < r.points.length; i++) expect(r.points[i].weightKg).toBeLessThan(r.points[i - 1].weightKg);
    expect(r.goalDay).toBeNull();
  });
  it('loss slows down over time (metabolic adaptation)', () => {
    const r = projectWeight({ ...base, days: 140 });
    const w = r.points.map((p) => p.weightKg);
    const firstWeek = w[0] - w[1];
    const lastWeek = w[w.length - 2] - w[w.length - 1];
    expect(lastWeek).toBeLessThan(firstWeek);
  });
  it('stops at the goal and reports goalDay', () => {
    const r = projectWeight({ ...base, days: 365, goalKg: 79.9 });
    expect(r.goalDay).toBe(2);
    const last = r.points[r.points.length - 1];
    expect(last.day).toBe(2);
    expect(last.weightKg).toBeLessThanOrEqual(79.9);
  });
  it('gain goal', () => {
    const r = projectWeight({ ...base, dailyCalories: 3100, days: 365, goalKg: 82 });
    expect(r.goalDay).not.toBeNull();
    expect(r.points[r.points.length - 1].weightKg).toBeGreaterThanOrEqual(82);
  });
  it('goal in the wrong direction is never reached', () => {
    const r = projectWeight({ ...base, days: 60, goalKg: 85 });
    expect(r.goalDay).toBeNull();
    expect(r.points[r.points.length - 1].day).toBe(60);
  });
  it('goal equal to start weight -> goalDay 0', () => {
    expect(projectWeight({ ...base, goalKg: 80 }).goalDay).toBe(0);
  });
  it('non-finite or non-positive goal is treated as "no goal"', () => {
    expect(projectWeight({ ...base, goalKg: NaN }).goalDay).toBeNull();
    expect(projectWeight({ ...base, goalKg: Infinity }).goalDay).toBeNull();
    expect(projectWeight({ ...base, goalKg: 0 }).goalDay).toBeNull();
    expect(projectWeight({ ...base, goalKg: -70 }).goalDay).toBeNull();
    expect(projectWeight({ ...base, goalKg: null }).goalDay).toBeNull();
    const r = projectWeight({ ...base, goalKg: 0, days: 30 });
    expect(r.points[r.points.length - 1].day).toBe(30); // simulation not cut short
  });
  it('weight never drops below 25 kg', () => {
    const r = projectWeight({ ...base, startWeightKg: 30, dailyCalories: 100, days: 3650 });
    for (const p of r.points) expect(p.weightKg).toBeGreaterThanOrEqual(25);
  });
  it('clamps days to [0, 3650] and floors fractions', () => {
    expect(projectWeight({ ...base, days: 0 }).points).toEqual([{ day: 0, weightKg: 80 }]);
    expect(projectWeight({ ...base, days: -5 }).points).toHaveLength(1);
    const r = projectWeight({ ...base, days: 10.9 });
    expect(r.points[r.points.length - 1].day).toBe(10);
    const big = projectWeight({ ...base, dailyCalories: 2759, days: 99999 });
    expect(big.points[big.points.length - 1].day).toBe(3650);
  });
  it('invalid inputs give no points', () => {
    for (const bad of [{ startWeightKg: 0 }, { dailyCalories: 0 }, { dailyCalories: NaN }, { heightCm: -1 }, { age: 0 }]) {
      expect(projectWeight({ ...base, ...bad })).toEqual({ points: [], goalDay: null });
    }
  });
});
