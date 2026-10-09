import {
  epley,
  brzycki,
  lombardi,
  mayhew,
  wathan,
  percentOf1RM,
  estimate1RM,
  loadFor,
  repMaxTable,
  assessStrength,
  STRENGTH_LEVELS,
  STRENGTH_STANDARDS,
  STANDARD_LIFT_LABEL,
  MAX_E1RM_REPS,
} from '../strength';

describe('1RM formulas', () => {
  it('Epley', () => {
    expect(epley(100, 5)).toBeCloseTo(116.667, 3);
    expect(epley(100, 10)).toBeCloseTo(133.333, 3);
    expect(epley(100, 1)).toBe(100);
  });
  it('Brzycki', () => {
    expect(brzycki(100, 5)).toBeCloseTo(112.5, 6);
    expect(brzycki(100, 1)).toBeCloseTo(100, 6);
    expect(brzycki(100, 10)).toBeCloseTo(133.333, 3);
    expect(brzycki(100, 37)).toBeNaN();
    expect(brzycki(100, 40)).toBeNaN();
  });
  it('Lombardi, Mayhew, Wathan', () => {
    expect(lombardi(100, 10)).toBeCloseTo(125.893, 3);
    expect(lombardi(100, 1)).toBe(100);
    expect(mayhew(100, 10)).toBeCloseTo(130.934, 3);
    expect(wathan(100, 10)).toBeCloseTo(134.747, 3);
    expect(wathan(100, 12)).toBeCloseTo(141.496, 3);
  });
});

describe('percentOf1RM (Tuchscherer chart)', () => {
  // [reps, rpe, pct] straight from docs/gym-science.md section 8
  it.each([
    [1, 10, 100],
    [1, 9.5, 97.8],
    [1, 9, 95.5],
    [1, 8, 92.2],
    [1, 6.5, 87.8],
    [2, 10, 95.5],
    [3, 9.5, 90.7],
    [3, 8, 86.3],
    [4, 8.5, 85.0],
    [5, 10, 86.3],
    [5, 8, 81.1],
    [5, 7.5, 79.9],
    [6, 9, 81.1],
    [7, 6.5, 72.3],
    [8, 8, 73.9],
    [8, 7, 70.7],
    [9, 9.5, 75.1],
    [10, 10, 73.9],
    [10, 8, 68.0],
    [10, 6.5, 64.0],
  ])('%p reps @ RPE %p = %p%%', (reps, rpe, pct) => {
    expect(percentOf1RM(reps, rpe) * 100).toBeCloseTo(pct, 6);
  });
  it('default RPE is 10', () => {
    expect(percentOf1RM(5)).toBeCloseTo(0.863, 6);
  });
  it('clamps RPE to 5–10', () => {
    expect(percentOf1RM(1, 11)).toBe(1);
    expect(percentOf1RM(1, 4)).toBeCloseTo(percentOf1RM(1, 5), 10);
    expect(percentOf1RM(1, 5)).toBeCloseTo(0.837, 6); // 6 effective reps
    expect(percentOf1RM(1, NaN)).toBe(1);
  });
  it('is monotonic decreasing in reps and increasing in RPE', () => {
    for (let r = 1; r < 15; r++) expect(percentOf1RM(r + 1, 8)).toBeLessThan(percentOf1RM(r, 8));
    for (let rpe = 6; rpe < 10; rpe += 0.5) expect(percentOf1RM(5, rpe + 0.5)).toBeGreaterThan(percentOf1RM(5, rpe));
  });
  it('interpolates fractional effective reps', () => {
    expect(percentOf1RM(1.25, 10) * 100).toBeCloseTo((100 + 97.8) / 2, 6);
  });
  it('extrapolates beyond chart, floored at 40%', () => {
    expect(percentOf1RM(15, 10) * 100).toBeCloseTo(60.1, 6); // 64 - 1.3 * 3
    expect(percentOf1RM(60, 10)).toBeCloseTo(0.4, 10);
  });
  it('NaN for invalid reps', () => {
    expect(percentOf1RM(0)).toBeNaN();
    expect(percentOf1RM(-1)).toBeNaN();
    expect(percentOf1RM(NaN)).toBeNaN();
  });
});

describe('estimate1RM', () => {
  it('uses RPE chart when RPE 6–10 and reps ≤ 12', () => {
    const r = estimate1RM(100, 5, 8);
    expect(r.value).toBeCloseTo(100 / 0.811, 6);
    expect(r.confidence).toBe('high');
    expect(estimate1RM(100, 8, 9).confidence).toBe('medium');
    expect(estimate1RM(100, 1, 10).value).toBeCloseTo(100, 10);
    expect(estimate1RM(100, 3, 9.5).value).toBeCloseTo(100 / 0.907, 6);
  });
  it('averages Epley+Brzycki ≤ 10 reps without RPE', () => {
    const r = estimate1RM(100, 5);
    expect(r.value).toBeCloseTo((116.667 + 112.5) / 2, 2);
    expect(r.confidence).toBe('high');
    const r8 = estimate1RM(100, 8);
    expect(r8.value).toBeCloseTo((126.667 + 124.138) / 2, 2);
    expect(r8.confidence).toBe('medium');
  });
  it('single = the weight', () => {
    expect(estimate1RM(140, 1)).toEqual({ value: 140, confidence: 'high' });
  });
  it('Wathan with low confidence for 11–15 reps', () => {
    const r = estimate1RM(100, 12);
    expect(r.value).toBeCloseTo(141.496, 3);
    expect(r.confidence).toBe('low');
    expect(estimate1RM(100, 11)).toEqual({ value: expect.closeTo(wathan(100, 11), 10), confidence: 'low' });
    expect(estimate1RM(100, 15)).toEqual({ value: expect.closeTo(wathan(100, 15), 10), confidence: 'low' });
  });
  it('no estimate above MAX_E1RM_REPS (15)', () => {
    expect(MAX_E1RM_REPS).toBe(15);
    expect(estimate1RM(100, 16)).toEqual({ value: 0, confidence: 'low' });
    expect(estimate1RM(100, 25)).toEqual({ value: 0, confidence: 'low' });
    expect(estimate1RM(100, 50, 8).value).toBe(0);
    expect(estimate1RM(100, 15.4).value).toBeCloseTo(wathan(100, 15), 10); // rounds to 15
    expect(estimate1RM(100, 15.6).value).toBe(0); // rounds to 16
  });
  it('RPE path accepts 5–10 (half steps), ignores outside', () => {
    expect(estimate1RM(100, 5, 5.5).value).toBeCloseTo(100 / 0.751, 6); // 9.5 effective reps
    expect(estimate1RM(100, 5, 5).value).toBeCloseTo(100 / percentOf1RM(5, 5), 10);
    expect(estimate1RM(100, 5, 4.5).value).toBeCloseTo(estimate1RM(100, 5).value, 10);
    expect(estimate1RM(100, 5, 11).value).toBeCloseTo(estimate1RM(100, 5).value, 10);
    expect(estimate1RM(100, 5, null).value).toBeCloseTo(estimate1RM(100, 5).value, 10);
  });
  it('RPE path confidence: ≤6 high, 7–10 medium, 11–12 low; > 12 reps falls back to Wathan', () => {
    expect(estimate1RM(100, 6, 8).confidence).toBe('high');
    expect(estimate1RM(100, 7, 8).confidence).toBe('medium');
    expect(estimate1RM(100, 10, 8).confidence).toBe('medium');
    expect(estimate1RM(100, 11, 8).confidence).toBe('low');
    expect(estimate1RM(100, 12, 9).value).toBeCloseTo(100 / percentOf1RM(12, 9), 10);
    expect(estimate1RM(100, 13, 8)).toEqual({ value: expect.closeTo(wathan(100, 13), 10), confidence: 'low' });
  });
  it('formula path confidence: ≤6 high, 7–10 medium', () => {
    expect(estimate1RM(100, 6).confidence).toBe('high');
    expect(estimate1RM(100, 7).confidence).toBe('medium');
    expect(estimate1RM(100, 10).confidence).toBe('medium');
  });
  it('rounds fractional reps', () => {
    expect(estimate1RM(100, 5.4).value).toBeCloseTo(estimate1RM(100, 5).value, 10);
  });
  it('invalid sets give 0', () => {
    expect(estimate1RM(0, 5)).toEqual({ value: 0, confidence: 'low' });
    expect(estimate1RM(-10, 5).value).toBe(0);
    expect(estimate1RM(100, 0).value).toBe(0);
    expect(estimate1RM(100, NaN).value).toBe(0);
    expect(estimate1RM(NaN, 5).value).toBe(0);
    expect(estimate1RM(100, Infinity).value).toBe(0);
  });
  it('e1RM is never below the lifted weight', () => {
    for (const reps of [1, 2, 3, 5, 8, 10, 12, 13, 15])
      for (const rpe of [undefined, 5, 5.5, 6, 7, 8, 9, 10]) expect(estimate1RM(100, reps, rpe).value).toBeGreaterThanOrEqual(100 - 1e-9);
  });
});

describe('loadFor / repMaxTable', () => {
  it('loadFor', () => {
    expect(loadFor(100, 5, 8)).toBeCloseTo(81.1, 6);
    expect(loadFor(150, 1)).toBeCloseTo(150 * 0.922, 6); // default RPE 8
    expect(loadFor(0, 5)).toBeNaN();
    expect(loadFor(NaN, 5)).toBeNaN();
  });
  it('loadFor inverts estimate1RM with RPE', () => {
    const e = estimate1RM(102.5, 6, 8.5).value;
    expect(loadFor(e, 6, 8.5)).toBeCloseTo(102.5, 6);
  });
  it('repMaxTable', () => {
    const t = repMaxTable(100);
    expect(t.map((x) => x.reps)).toEqual([1, 2, 3, 4, 5, 6, 8, 10, 12]);
    expect(t[0]).toEqual({ reps: 1, weightKg: 100, pct: 1 });
    expect(t[4].weightKg).toBeCloseTo(86.3, 6);
    expect(t[7].weightKg).toBeCloseTo(73.9, 6);
    expect(t[8].weightKg).toBeCloseTo(68.0, 6); // 12 effective reps
    expect(repMaxTable(0)).toEqual([]);
    expect(repMaxTable(NaN)).toEqual([]);
  });
});

describe('assessStrength', () => {
  it('exact threshold counts as reached', () => {
    const a = assessStrength('bench', 'male', 100, 80)!;
    expect(a.ratio).toBeCloseTo(1.25, 10);
    expect(a.level).toBe('intermediate');
    expect(a.next).toBe('advanced');
    expect(a.nextTargetKg).toBeCloseTo(120, 10);
    expect(a.progress).toBeCloseTo(0, 10);
  });
  it('mid progress between levels', () => {
    const a = assessStrength('squat', 'male', 120, 80)!; // ratio 1.5, between 1.25 and 1.75
    expect(a.level).toBe('novice');
    expect(a.next).toBe('intermediate');
    expect(a.nextTargetKg).toBeCloseTo(140, 10);
    expect(a.progress).toBeCloseTo(0.5, 10);
  });
  it('untrained below first threshold', () => {
    const a = assessStrength('squat', 'male', 40, 80)!;
    expect(a.level).toBe('untrained');
    expect(a.next).toBe('beginner');
    expect(a.nextTargetKg).toBeCloseTo(60, 10);
    expect(a.progress).toBeCloseTo(0.5 / 0.75, 10);
  });
  it('elite has no next', () => {
    const a = assessStrength('deadlift', 'female', 200, 60)!;
    expect(a.level).toBe('elite');
    expect(a.next).toBeNull();
    expect(a.nextTargetKg).toBeNull();
    expect(a.progress).toBe(1);
  });
  it('null for invalid', () => {
    expect(assessStrength('bench', 'male', 0, 80)).toBeNull();
    expect(assessStrength('bench', 'male', 100, 0)).toBeNull();
    expect(assessStrength('bench', 'male', NaN, 80)).toBeNull();
  });
  it('standards are strictly increasing and complete', () => {
    expect(STRENGTH_LEVELS).toHaveLength(6);
    for (const lift of Object.keys(STRENGTH_STANDARDS) as (keyof typeof STRENGTH_STANDARDS)[]) {
      expect(STANDARD_LIFT_LABEL[lift]).toBeTruthy();
      for (const sex of ['male', 'female'] as const) {
        const t = STRENGTH_STANDARDS[lift][sex];
        for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
      }
    }
  });
});
