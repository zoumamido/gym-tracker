import { DEFAULT_BAR_KG, PLATES_KG, PLATES_LB, barbellStepKg, warmupSets, plateLoadout } from '../warmup';
import { kgToLb, lbToKg } from '../units';

describe('barbellStepKg', () => {
  it('2.5 kg or 5 lb', () => {
    expect(barbellStepKg('kg')).toBe(2.5);
    expect(barbellStepKg('lb')).toBeCloseTo(2.268, 3);
  });
});

describe('warmupSets', () => {
  it('standard ramp for 100 kg: bar×10, 40×5, 60×3, 80×2', () => {
    expect(DEFAULT_BAR_KG).toBe(20);
    const w = warmupSets(100);
    expect(w.map((s) => [s.weightKg, s.reps])).toEqual([
      [20, 10],
      [40, 5],
      [60, 3],
      [80, 2],
    ]);
    expect(w[0].label).toBe('Empty bar');
    expect(w[1].label).toBe('40%');
  });
  it('heavy adds a 90% single', () => {
    const w = warmupSets(140, { heavy: true });
    expect(w.map((s) => s.weightKg)).toEqual([20, 55, 85, 112.5, 125]);
    expect(w[w.length - 1].reps).toBe(1);
    expect(w[w.length - 1].label).toBe('90%');
  });
  it('rounds to 2.5 kg and drops duplicate/too-close steps for light loads', () => {
    expect(warmupSets(40).map((s) => s.weightKg)).toEqual([20, 25, 32.5]);
    expect(warmupSets(25).map((s) => s.weightKg)).toEqual([20]);
  });
  it('empty when working weight ≤ bar or invalid', () => {
    expect(warmupSets(20)).toEqual([]);
    expect(warmupSets(15)).toEqual([]);
    expect(warmupSets(0)).toEqual([]);
    expect(warmupSets(-50)).toEqual([]);
    expect(warmupSets(NaN)).toEqual([]);
  });
  it('custom bar', () => {
    const w = warmupSets(60, { barKg: 15 });
    expect(w[0].weightKg).toBe(15);
  });
  it('default bar is 45 lb in lb mode, 20 kg in kg mode', () => {
    const lb = warmupSets(lbToKg(225), { unit: 'lb' });
    expect(kgToLb(lb[0].weightKg)).toBeCloseTo(45, 6);
    expect(warmupSets(100, { unit: 'kg' })[0].weightKg).toBe(20);
    expect(warmupSets(100)[0].weightKg).toBe(20);
    expect(warmupSets(lbToKg(45), { unit: 'lb' })).toEqual([]);
    expect(warmupSets(lbToKg(44), { unit: 'lb' })).toEqual([]);
    expect(warmupSets(21, { unit: 'kg' })[0].weightKg).toBe(20);
  });
  it('lb unit rounds loads to 5 lb', () => {
    const w = warmupSets(lbToKg(225), { unit: 'lb', barKg: lbToKg(45) });
    const lbs = w.map((s) => Math.round(kgToLb(s.weightKg) * 1000) / 1000);
    expect(lbs).toEqual([45, 90, 135, 180]);
  });
  it('invariants: strictly increasing and below working weight, for many loads', () => {
    for (let kg = 22.5; kg <= 300; kg += 2.5) {
      for (const heavy of [false, true]) {
        const w = warmupSets(kg, { heavy });
        expect(w.length).toBeGreaterThanOrEqual(1);
        for (let i = 1; i < w.length; i++) expect(w[i].weightKg).toBeGreaterThan(w[i - 1].weightKg);
        for (const s of w) {
          expect(s.weightKg).toBeLessThan(kg);
          expect((s.weightKg * 2) % 5).toBeCloseTo(0, 6); // multiple of 2.5
        }
      }
    }
  });
});

describe('plateLoadout', () => {
  it('100 kg on 20 kg bar = 25 + 15 per side', () => {
    expect(plateLoadout(100, 20, PLATES_KG)).toEqual({
      perSide: [
        { plate: 25, count: 1 },
        { plate: 15, count: 1 },
      ],
      achieved: 100,
      remainder: 0,
    });
  });
  it('uses multiple plates and small change', () => {
    const r = plateLoadout(182.5, 20, PLATES_KG);
    expect(r.perSide).toEqual([
      { plate: 25, count: 3 },
      { plate: 5, count: 1 },
      { plate: 1.25, count: 1 },
    ]);
    expect(r.achieved).toBe(182.5);
    expect(r.remainder).toBe(0);
  });
  it('reports unachievable remainder', () => {
    const r = plateLoadout(101, 20, PLATES_KG);
    expect(r.achieved).toBe(100);
    expect(r.remainder).toBe(1);
  });
  it('imperial plates', () => {
    const r = plateLoadout(225, 45, PLATES_LB);
    expect(r.perSide).toEqual([{ plate: 45, count: 2 }]);
    expect(r.achieved).toBe(225);
    const r2 = plateLoadout(320, 45, PLATES_LB);
    expect(r2.perSide).toEqual([
      { plate: 45, count: 3 },
      { plate: 2.5, count: 1 },
    ]);
    expect(r2.achieved).toBe(320);
  });
  it('plate order in input does not matter', () => {
    expect(plateLoadout(100, 20, [...PLATES_KG].reverse())).toEqual(plateLoadout(100, 20, PLATES_KG));
  });
  it('total ≤ bar or invalid gives empty loadout', () => {
    expect(plateLoadout(20, 20, PLATES_KG)).toEqual({ perSide: [], achieved: 20, remainder: 0 });
    expect(plateLoadout(10, 20, PLATES_KG).perSide).toEqual([]);
    const n = plateLoadout(NaN, 20, PLATES_KG);
    expect(n.perSide).toEqual([]);
    expect(n.remainder).toBe(0);
  });
});
