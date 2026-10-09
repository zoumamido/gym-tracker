import { incrementFor, suggestNext, stalledExercises, ProgressionOptions } from '../progression';
import type { ExerciseSession } from '../stats';
import { lbToKg } from '../units';

let day = 0;
const session = (weightKg: number, reps: number[], rpe: number | null = null): ExerciseSession => ({
  workoutId: `w${++day}`,
  date: new Date(2026, 8, 1 + day, 18).getTime(),
  sets: reps.map((r) => ({ weightKg, reps: r, rpe })),
});
const OPTS: ProgressionOptions = { repMin: 8, repMax: 12, incrementKg: 2.5 };

describe('incrementFor', () => {
  it('barbell family', () => {
    for (const equipment of ['barbell', 'smith', 'ez_bar'] as const) {
      expect(incrementFor({ equipment, lowerBody: false }, 'kg')).toBe(2.5);
      expect(incrementFor({ equipment, lowerBody: true }, 'kg')).toBe(2.5);
      expect(incrementFor({ equipment, lowerBody: true }, 'kg', 'beginner')).toBe(5);
      expect(incrementFor({ equipment, lowerBody: false }, 'kg', 'beginner')).toBe(2.5);
    }
  });
  it('dumbbell / kettlebell / machine / cable / other', () => {
    expect(incrementFor({ equipment: 'dumbbell', lowerBody: false }, 'kg')).toBe(2);
    expect(incrementFor({ equipment: 'kettlebell', lowerBody: true }, 'kg')).toBe(4);
    expect(incrementFor({ equipment: 'machine', lowerBody: true }, 'kg')).toBe(5);
    expect(incrementFor({ equipment: 'machine', lowerBody: false }, 'kg')).toBe(2.5);
    expect(incrementFor({ equipment: 'cable', lowerBody: false }, 'kg')).toBe(2.5);
    expect(incrementFor({ equipment: 'bodyweight', lowerBody: false }, 'kg')).toBe(2.5);
    expect(incrementFor({ equipment: 'band', lowerBody: false }, 'kg')).toBe(2.5);
  });
  it('imperial increments are 5/10 lb in kg', () => {
    expect(incrementFor({ equipment: 'barbell', lowerBody: false }, 'lb')).toBeCloseTo(lbToKg(5), 10);
    expect(incrementFor({ equipment: 'barbell', lowerBody: true }, 'lb', 'beginner')).toBeCloseTo(lbToKg(10), 10);
    expect(incrementFor({ equipment: 'dumbbell', lowerBody: false }, 'lb')).toBeCloseTo(lbToKg(5), 10);
    expect(incrementFor({ equipment: 'kettlebell', lowerBody: false }, 'lb')).toBeCloseTo(lbToKg(10), 10);
  });
});

describe('suggestNext', () => {
  it('start: no history', () => {
    const s = suggestNext([], OPTS);
    expect(s.kind).toBe('start');
    expect(s.weightKg).toBeNull();
    expect(s.reps).toBe(12);
    expect(s.message).toMatch(/14 times/);
    expect(suggestNext([{ workoutId: 'x', date: 0, sets: [] }], OPTS).kind).toBe('start');
  });
  it('increase: all top sets hit repMax', () => {
    const s = suggestNext([session(60, [12, 12, 12])], OPTS);
    expect(s).toMatchObject({ kind: 'increase', weightKg: 62.5, reps: 8 });
  });
  it('increase uses only top-weight sets (back-off sets ignored)', () => {
    const s = suggestNext([{ workoutId: 'x', date: 0, sets: [{ weightKg: 60, reps: 12 }, { weightKg: 60, reps: 13 }, { weightKg: 50, reps: 6 }] }], OPTS);
    expect(s).toMatchObject({ kind: 'increase', weightKg: 62.5 });
  });
  it('double increase when average RPE ≤ 7', () => {
    expect(suggestNext([session(60, [12, 12, 12], 7)], OPTS)).toMatchObject({ kind: 'increase', weightKg: 65, reps: 8 });
    expect(suggestNext([session(60, [12, 12, 12], 6)], OPTS).weightKg).toBe(65);
    expect(suggestNext([session(60, [12, 12, 12], 7.5)], OPTS).weightKg).toBe(62.5);
    const mixed: ExerciseSession = {
      workoutId: 'm',
      date: 0,
      sets: [
        { weightKg: 60, reps: 12, rpe: 6.5 },
        { weightKg: 60, reps: 12, rpe: 7.5 },
        { weightKg: 60, reps: 12, rpe: null },
      ],
    };
    expect(suggestNext([mixed], OPTS).weightKg).toBe(65); // avg 7 over sets with RPE
  });
  it('custom increment and formatter', () => {
    const s = suggestNext([session(60, [12, 12])], { ...OPTS, incrementKg: 5, format: (kg) => `${kg}!` });
    expect(s.weightKg).toBe(65);
    expect(s.message).toContain('65!');
  });
  it('non-positive increment falls back to 2.5', () => {
    expect(suggestNext([session(60, [12, 12])], { ...OPTS, incrementKg: 0 }).weightKg).toBe(62.5);
    expect(suggestNext([session(60, [12, 12])], { ...OPTS, incrementKg: -5 }).weightKg).toBe(62.5);
  });
  it('repeat: within range -> same weight, one more rep than the weakest set', () => {
    const s = suggestNext([session(60, [10, 9, 9])], OPTS);
    expect(s).toMatchObject({ kind: 'repeat', weightKg: 60, reps: 10 });
  });
  it('repeat target is clamped to [repMin, repMax]', () => {
    expect(suggestNext([session(60, [5, 5])], OPTS)).toMatchObject({ kind: 'repeat', reps: 8 }); // one sub-min session
    expect(suggestNext([session(60, [12, 12, 11])], OPTS)).toMatchObject({ kind: 'repeat', reps: 12 });
  });
  it('decrease: below repMin twice in a row at the same weight', () => {
    const s = suggestNext([session(60, [6, 7]), session(60, [7, 6])], OPTS);
    expect(s).toMatchObject({ kind: 'decrease', weightKg: 57.5, reps: 8 });
  });
  it('no decrease if previous session was a different weight', () => {
    const s = suggestNext([session(57.5, [6, 6]), session(60, [7, 6])], OPTS);
    expect(s.kind).toBe('repeat');
  });
  it('no decrease if previous session was within range', () => {
    expect(suggestNext([session(60, [9, 8]), session(60, [7, 6])], OPTS).kind).toBe('repeat');
  });
  it('decrease never goes below 0', () => {
    const s = suggestNext([session(2, [3]), session(2, [3])], OPTS);
    expect(s).toMatchObject({ kind: 'decrease', weightKg: 0 });
  });
  it('deload: 3 sessions at the same weight without rep improvement', () => {
    const s = suggestNext([session(100, [9, 9, 8]), session(100, [9, 8, 9]), session(100, [8, 9, 9])], OPTS);
    expect(s).toMatchObject({ kind: 'deload', weightKg: 90, reps: 12 });
    expect(s.message).toMatch(/90 kg/);
  });
  it('deload weight snaps to the increment grid and never below one increment', () => {
    const three = (w: number) => [session(w, [9]), session(w, [9]), session(w, [9])];
    expect(suggestNext(three(82.5), OPTS).weightKg).toBe(75); // 74.25 -> 75
    expect(suggestNext(three(62.5), OPTS).weightKg).toBe(57.5); // 56.25 -> 57.5
    expect(suggestNext(three(22), { ...OPTS, incrementKg: 2 }).weightKg).toBe(20); // 19.8 -> 20
    expect(suggestNext(three(30), { ...OPTS, incrementKg: 4 }).weightKg).toBe(26); // snapped 28, capped at top − inc = 26
    expect(suggestNext(three(12.5), OPTS).weightKg).toBe(10); // snapped 12.5, capped at 10
    expect(suggestNext(three(10), OPTS).weightKg).toBe(7.5);
    expect(suggestNext(three(10), { ...OPTS, incrementKg: 2 }).weightKg).toBe(8); // dumbbell
    expect(suggestNext(three(2.5), OPTS).weightKg).toBe(2.5); // min(inc, top)
    expect(suggestNext(three(5), { ...OPTS, incrementKg: 5 }).weightKg).toBe(5);
    expect(suggestNext(three(1), OPTS).weightKg).toBe(1); // top < inc: never above the stalled weight
    const lbInc = lbToKg(5);
    const w = suggestNext(three(lbToKg(225)), { ...OPTS, incrementKg: lbInc }).weightKg!;
    expect(w / lbInc).toBeCloseTo(41, 3); // 202.5 lb -> 205 lb, on the 5 lb grid
  });
  it('deload weight is always lighter than the stalled weight (when above one increment)', () => {
    for (let top = 7.5; top <= 200; top += 2.5) {
      const w = suggestNext([session(top, [9]), session(top, [9]), session(top, [9])], OPTS).weightKg!;
      expect(w).toBeLessThan(top);
      expect((w * 2) % 5).toBeCloseTo(0, 6);
    }
  });
  it('deload takes priority over decrease after 3 stalled sub-min sessions', () => {
    expect(suggestNext([session(100, [6]), session(100, [6]), session(100, [6])], OPTS).kind).toBe('deload');
  });
  it('no deload when total reps improved over the 3 sessions', () => {
    const s = suggestNext([session(100, [9, 8, 8]), session(100, [9, 9, 8]), session(100, [9, 9, 9])], OPTS);
    expect(s.kind).toBe('repeat');
  });
  it('no deload when the weight changed within the last 3 sessions', () => {
    const s = suggestNext([session(97.5, [9, 9, 9]), session(100, [9, 9, 9]), session(100, [9, 9, 9])], OPTS);
    expect(s.kind).toBe('repeat');
  });
  it('only the last 3 sessions matter for a stall', () => {
    const s = suggestNext([session(90, [6]), session(100, [9]), session(100, [9]), session(100, [9])], OPTS);
    expect(s.kind).toBe('deload');
  });
  it('bodyweight: progress by reps', () => {
    const s = suggestNext([session(0, [8, 10, 9])], OPTS);
    expect(s).toMatchObject({ kind: 'reps', weightKg: null, reps: 11 });
    expect(suggestNext([session(0, [11, 12])], OPTS)).toMatchObject({ kind: 'reps', reps: 12 });
  });
  it('bodyweight: all sets at repMax -> add load / harder variation', () => {
    const s = suggestNext([session(0, [12, 12, 13])], OPTS);
    expect(s).toMatchObject({ kind: 'increase', weightKg: null, reps: 12 });
  });
  it('bodyweight never deloads', () => {
    expect(suggestNext([session(0, [5]), session(0, [5]), session(0, [5])], OPTS).kind).toBe('reps');
  });
  it('sanitises rep range (repMax < repMin, fractional, < 1)', () => {
    expect(suggestNext([], { repMin: 10, repMax: 5, incrementKg: 2.5 }).reps).toBe(10);
    expect(suggestNext([], { repMin: 0, repMax: 0, incrementKg: 2.5 }).reps).toBe(1);
    expect(suggestNext([], { repMin: 7.6, repMax: 9.4, incrementKg: 2.5 }).reps).toBe(9);
  });
  it('is pure (does not mutate history)', () => {
    const h = [session(60, [10, 9]), session(60, [10, 10])];
    const copy = JSON.parse(JSON.stringify(h));
    suggestNext(h, OPTS);
    expect(h).toEqual(copy);
  });
});

describe('stalledExercises', () => {
  it('flags only lifts that would deload', () => {
    const stalled = [session(100, [7]), session(100, [7]), session(100, [7])];
    const fine = [session(100, [7]), session(100, [8]), session(100, [9])];
    const out = stalledExercises({ squat: stalled, bench_press: fine, ohp: [] }, { squat: { repMin: 6, repMax: 10 }, bench_press: { repMin: 6, repMax: 10 } });
    expect(out).toEqual(['squat']);
  });
  it('defaults to 6–10 rep range when missing', () => {
    // 10 reps hits default repMax 10 -> not stuck below max -> not stalled
    const atMax = [session(100, [10]), session(100, [10]), session(100, [10])];
    expect(stalledExercises({ a: atMax }, {})).toEqual([]);
    const below = [session(100, [9]), session(100, [9]), session(100, [9])];
    expect(stalledExercises({ a: below }, {})).toEqual(['a']);
  });
  it('empty input', () => {
    expect(stalledExercises({}, {})).toEqual([]);
  });
});
