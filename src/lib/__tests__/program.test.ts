import { splitFor, schemeFor, exercisesForMinutes, generateProgram, recommendedDays } from '../program';
import { ACCESS_EQUIPMENT, EXERCISE_MAP } from '../../data/exercises';
import { VOLUME_LANDMARKS } from '../../data/muscles';
import type { Muscle, Program } from '../types';
import type { EquipmentAccess, TrainingGoal } from '../types';
import type { Experience } from '../nutrition';

const NOW = new Date(2026, 9, 9, 10, 0);
const DAYS = [2, 3, 4, 5, 6];
const ACCESS: EquipmentAccess[] = ['gym', 'home', 'bodyweight'];
const GOALS: TrainingGoal[] = ['strength', 'hypertrophy', 'endurance', 'general'];
const EXPERIENCE: Experience[] = ['beginner', 'intermediate', 'advanced'];

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterAll(() => {
  jest.useRealTimers();
});

describe('splitFor', () => {
  it.each([
    [2, 'Full Body ×2', [1, 4]],
    [3, 'Full Body ×3', [1, 3, 5]],
    [4, 'Upper / Lower', [1, 2, 4, 5]],
    [5, 'Upper / Lower + PPL', [1, 2, 3, 5, 6]],
    [6, 'Push / Pull / Legs ×2', [1, 2, 3, 4, 5, 6]],
  ])('%p days -> %p', (d, name, weekdays) => {
    const s = splitFor(d);
    expect(s.name).toBe(name);
    expect(s.weekdays).toEqual(weekdays);
    expect(s.days).toHaveLength(d);
  });
  it('non-finite days -> 3-day full body', () => {
    expect(splitFor(NaN).days).toHaveLength(3);
    expect(splitFor(Infinity).days).toHaveLength(3);
    expect(splitFor(NaN).name).toBe('Full Body ×3');
  });
  it('clamps and rounds days', () => {
    expect(splitFor(0).days).toHaveLength(2);
    expect(splitFor(1).days).toHaveLength(2);
    expect(splitFor(-3).days).toHaveLength(2);
    expect(splitFor(7).days).toHaveLength(6);
    expect(splitFor(3.4).days).toHaveLength(3);
    expect(splitFor(3.6).days).toHaveLength(4);
  });
  it('weekdays are unique, sorted, within 0–6, and Sunday is rest', () => {
    for (const d of DAYS) {
      const w = splitFor(d).weekdays;
      expect(new Set(w).size).toBe(w.length);
      expect([...w].sort((a, b) => a - b)).toEqual(w);
      expect(w.every((x) => x >= 0 && x <= 6)).toBe(true);
      expect(w).not.toContain(0);
    }
  });
  it('2–5 day splits keep at least one rest day between consecutive weeks (no 7/7 training)', () => {
    for (const d of [2, 3, 4, 5]) expect(splitFor(d).weekdays.length).toBeLessThan(7);
  });
});

describe('schemeFor', () => {
  it('goal × role tables', () => {
    expect(schemeFor('main', 'strength', 'intermediate', 'squat')).toEqual({ sets: 4, repMin: 3, repMax: 5, restSec: 180 });
    expect(schemeFor('main', 'hypertrophy', 'intermediate', 'squat')).toEqual({ sets: 3, repMin: 6, repMax: 10, restSec: 150 });
    expect(schemeFor('accessory', 'endurance', 'intermediate', 'lateral_raise')).toEqual({ sets: 2, repMin: 15, repMax: 20, restSec: 45 });
    expect(schemeFor('secondary', 'general', 'intermediate', 'rdl')).toEqual({ sets: 3, repMin: 8, repMax: 12, restSec: 90 });
  });
  it('beginner strength mains use 3 sets', () => {
    expect(schemeFor('main', 'strength', 'beginner', 'squat').sets).toBe(3);
    expect(schemeFor('secondary', 'strength', 'beginner', 'rdl').sets).toBe(3);
  });
  it('advanced adds a set to main/secondary only', () => {
    expect(schemeFor('main', 'strength', 'advanced', 'squat').sets).toBe(5);
    expect(schemeFor('secondary', 'hypertrophy', 'advanced', 'rdl').sets).toBe(4);
    expect(schemeFor('accessory', 'hypertrophy', 'advanced', 'lateral_raise').sets).toBe(3);
  });
  it('timed exercises get 3 × 30–60 s', () => {
    expect(schemeFor('accessory', 'strength', 'advanced', 'plank')).toEqual({ sets: 3, repMin: 30, repMax: 60, restSec: 60 });
  });
  it('bodyweight compounds use 6–12 reps for strength', () => {
    expect(schemeFor('main', 'strength', 'intermediate', 'push_up')).toMatchObject({ repMin: 6, repMax: 12, sets: 4 });
    expect(schemeFor('main', 'hypertrophy', 'intermediate', 'push_up')).toMatchObject({ repMin: 6, repMax: 10 });
  });
  it('does not mutate the shared table', () => {
    schemeFor('main', 'strength', 'advanced', 'squat');
    expect(schemeFor('main', 'strength', 'intermediate', 'squat').sets).toBe(4);
  });
  it('rep ranges are valid for every combination', () => {
    for (const role of ['main', 'secondary', 'accessory'] as const)
      for (const g of GOALS)
        for (const e of EXPERIENCE) {
          const s = schemeFor(role, g, e, 'bench_press');
          expect(s.repMin).toBeGreaterThanOrEqual(1);
          expect(s.repMax).toBeGreaterThanOrEqual(s.repMin);
          expect(s.sets).toBeGreaterThanOrEqual(2);
          expect(s.restSec).toBeGreaterThan(0);
        }
  });
});

describe('exercisesForMinutes', () => {
  it.each([
    [0, 6],
    [NaN, 6],
    [-10, 6],
    [20, 3],
    [30, 3],
    [45, 4],
    [60, 6],
    [75, 7],
    [90, 8],
    [180, 8],
  ])('%p min -> %p exercises', (m, e) => {
    expect(exercisesForMinutes(m)).toBe(e);
  });
});

describe('recommendedDays', () => {
  it('3 / 4 / 5', () => {
    expect(recommendedDays('beginner')).toBe(3);
    expect(recommendedDays('intermediate')).toBe(4);
    expect(recommendedDays('advanced')).toBe(5);
  });
});

describe('generateProgram — every days/week × equipment access', () => {
  const combos: [number, EquipmentAccess][] = [];
  for (const d of DAYS) for (const a of ACCESS) combos.push([d, a]);

  it.each(combos)('%p days, %p access', (days, access) => {
    for (const trainingGoal of GOALS) {
      for (const experience of EXPERIENCE) {
        const p = generateProgram({ daysPerWeek: days, experience, trainingGoal, equipment: access });
        expect(p.daysPerWeek).toBe(days);
        expect(p.routines).toHaveLength(days);
        expect(p.schedule).toHaveLength(7);
        const training = p.schedule.filter((x) => x != null);
        expect(training).toHaveLength(days);
        // each routine scheduled exactly once
        expect(new Set(training).size).toBe(days);
        expect(new Set(p.routines.map((r) => r.id)).size).toBe(days);
        for (const r of p.routines) expect(training).toContain(r.id);
        expect(p.createdAt).toBe(NOW.getTime());
        expect(p.id.startsWith('p_')).toBe(true);

        const allowed = ACCESS_EQUIPMENT[access];
        for (const r of p.routines) {
          expect(r.id.startsWith('r_')).toBe(true);
          expect(r.exercises.length).toBeGreaterThanOrEqual(2);
          expect(r.exercises.length).toBeLessThanOrEqual(8);
          const ids = r.exercises.map((e) => e.exerciseId);
          expect(new Set(ids).size).toBe(ids.length); // no duplicates within a routine
          for (const e of r.exercises) {
            const def = EXERCISE_MAP[e.exerciseId];
            expect(def).toBeDefined();
            expect(allowed.has(def.equipment)).toBe(true);
            if (access === 'bodyweight') expect(def.equipment).toBe('bodyweight');
            expect(def.kind).not.toBe('cardio');
            expect(e.sets).toBeGreaterThanOrEqual(2);
            expect(e.repMin).toBeGreaterThanOrEqual(1);
            expect(e.repMax).toBeGreaterThanOrEqual(e.repMin);
            expect(e.restSec).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('every routine has at least 3 exercises for gym and home access', () => {
    for (const d of DAYS)
      for (const a of ['gym', 'home'] as const) {
        const p = generateProgram({ daysPerWeek: d, experience: 'intermediate', trainingGoal: 'hypertrophy', equipment: a });
        for (const r of p.routines) expect(r.exercises.length).toBeGreaterThanOrEqual(3);
      }
  });

  it('gym access picks the first-choice barbell lifts', () => {
    const p = generateProgram({ daysPerWeek: 3, experience: 'intermediate', trainingGoal: 'strength', equipment: 'gym' });
    expect(p.routines[0].exercises.slice(0, 2).map((e) => e.exerciseId)).toEqual(['squat', 'bench_press']);
    expect(p.routines[0].exercises[0]).toMatchObject({ sets: 4, repMin: 3, repMax: 5, restSec: 180 });
  });

  it('home access substitutes dumbbell/bodyweight variants', () => {
    const p = generateProgram({ daysPerWeek: 3, experience: 'intermediate', trainingGoal: 'hypertrophy', equipment: 'home' });
    expect(p.routines[0].exercises[0].exerciseId).toBe('goblet_squat');
    expect(p.routines[0].exercises[1].exerciseId).toBe('db_bench_press');
  });

  it('schedule places routines on split weekdays in order', () => {
    const p = generateProgram({ daysPerWeek: 4, experience: 'intermediate', trainingGoal: 'general', equipment: 'gym' });
    expect(p.schedule[1]).toBe(p.routines[0].id);
    expect(p.schedule[2]).toBe(p.routines[1].id);
    expect(p.schedule[3]).toBeNull();
    expect(p.schedule[4]).toBe(p.routines[2].id);
    expect(p.schedule[5]).toBe(p.routines[3].id);
    expect(p.schedule[0]).toBeNull();
    expect(p.schedule[6]).toBeNull();
  });

  it('respects maxExercises', () => {
    for (const max of [3, 4, 5]) {
      const p = generateProgram({ daysPerWeek: 6, experience: 'advanced', trainingGoal: 'hypertrophy', equipment: 'gym', maxExercises: max });
      for (const r of p.routines) expect(r.exercises.length).toBeLessThanOrEqual(max);
    }
  });

  it('out-of-range days are clamped', () => {
    expect(generateProgram({ daysPerWeek: 9, experience: 'advanced', trainingGoal: 'general', equipment: 'gym' }).daysPerWeek).toBe(6);
    expect(generateProgram({ daysPerWeek: 1, experience: 'beginner', trainingGoal: 'general', equipment: 'gym' }).daysPerWeek).toBe(2);
  });

  it('two generated programs get distinct ids', () => {
    const a = generateProgram({ daysPerWeek: 3, experience: 'beginner', trainingGoal: 'general', equipment: 'gym' });
    const b = generateProgram({ daysPerWeek: 3, experience: 'beginner', trainingGoal: 'general', equipment: 'gym' });
    expect(a.id).not.toBe(b.id);
    const ids = [...a.routines, ...b.routines].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('generateProgram — template contents and weekly volume', () => {
  const weeklySets = (p: Program): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const r of p.routines)
      for (const e of r.exercises) {
        const def = EXERCISE_MAP[e.exerciseId];
        for (const m of def.primary) out[m] = (out[m] ?? 0) + e.sets;
        for (const m of def.secondary) if (!def.primary.includes(m)) out[m] = (out[m] ?? 0) + e.sets * 0.5;
      }
    return out;
  };

  it.each(DAYS)('gym, %p days: chest, lats, quads, hamstrings ≥ 0.6 × MEV weekly sets', (days) => {
    for (const trainingGoal of GOALS)
      for (const experience of EXPERIENCE) {
        const p = generateProgram({ daysPerWeek: days, experience, trainingGoal, equipment: 'gym', maxExercises: 8 });
        const sets = weeklySets(p);
        for (const m of ['chest', 'lats', 'quads', 'hamstrings'] as Muscle[]) {
          const v = sets[m] ?? 0;
          expect({ days, trainingGoal, experience, m, ok: v >= 0.6 * VOLUME_LANDMARKS[m].mev }).toEqual({ days, trainingGoal, experience, m, ok: true });
        }
      }
  });

  it('Full Body A has calves before plank; Full Body B has a second chest slot; Full Body C has side delts and calves', () => {
    const p = generateProgram({ daysPerWeek: 3, experience: 'intermediate', trainingGoal: 'hypertrophy', equipment: 'gym' });
    const [a, b, c] = p.routines.map((r) => r.exercises.map((e) => e.exerciseId));
    expect(a).toContain('calf_raise');
    expect(a.indexOf('calf_raise')).toBeLessThan(a.indexOf('plank'));
    expect(b).toContain('dip');
    expect(c).toEqual(expect.arrayContaining(['lateral_raise', 'calf_raise']));
  });

  it('bodyweight fallbacks: chin_up for biceps, pike_push_up for delt slots', () => {
    const p = generateProgram({ daysPerWeek: 4, experience: 'intermediate', trainingGoal: 'hypertrophy', equipment: 'bodyweight' });
    const all = p.routines.flatMap((r) => r.exercises.map((e) => e.exerciseId));
    expect(all).toContain('chin_up');
    expect(all).toContain('pike_push_up');
  });

  it('bodyweight routines now have at least 3 exercises', () => {
    for (const d of DAYS) {
      const p = generateProgram({ daysPerWeek: d, experience: 'intermediate', trainingGoal: 'hypertrophy', equipment: 'bodyweight' });
      for (const r of p.routines) expect({ day: r.name, n: r.exercises.length >= 3 }).toEqual({ day: r.name, n: true });
    }
  });
});
