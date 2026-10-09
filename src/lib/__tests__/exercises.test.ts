import * as fs from 'fs';
import * as path from 'path';
import { EXERCISES, EXERCISE_MAP, EQUIPMENT_LABEL, ACCESS_EQUIPMENT, ACCESS_LABEL } from '../../data/exercises';
import { MUSCLES, MUSCLE_LABEL, MUSCLE_GROUP, VOLUME_LANDMARKS } from '../../data/muscles';
import { STRENGTH_STANDARDS } from '../strength';

/** Every exercise id referenced by the program templates in program.ts. */
function templateIds(): string[] {
  const src = fs.readFileSync(path.join(__dirname, '..', 'program.ts'), 'utf8');
  const ids = new Set<string>();
  const blocks = [...src.matchAll(/const [A-Z0-9_]+ = \[([^\]]*)\]/g), ...src.matchAll(/S\('(?:main|secondary|accessory)'([^)]*)\)/g)];
  for (const b of blocks) for (const m of b[1].matchAll(/'([a-z0-9_]+)'/g)) ids.add(m[1]);
  return [...ids];
}

describe('exercise library integrity', () => {
  it('ids are unique and the map covers the list', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(EXERCISE_MAP)).toHaveLength(ids.length);
    for (const e of EXERCISES) expect(EXERCISE_MAP[e.id]).toBe(e);
  });
  it('ids are snake_case', () => {
    for (const e of EXERCISES) expect(e.id).toMatch(/^[a-z][a-z0-9_]*$/);
  });
  it('every exercise has valid fields', () => {
    const muscles = new Set(MUSCLES);
    for (const e of EXERCISES) {
      expect(e.name.trim().length).toBeGreaterThan(0);
      expect(EQUIPMENT_LABEL[e.equipment]).toBeDefined();
      expect(['compound', 'isolation']).toContain(e.category);
      expect(['strength', 'timed', 'cardio']).toContain(e.kind);
      expect(e.met).toBeGreaterThan(0);
      for (const m of [...e.primary, ...e.secondary]) expect(muscles.has(m)).toBe(true);
      if (e.kind !== 'cardio') expect(e.primary.length).toBeGreaterThan(0);
      expect(new Set(e.primary).size).toBe(e.primary.length);
      if (e.standard) expect(STRENGTH_STANDARDS[e.standard]).toBeDefined();
    }
  });
  it('names are unique', () => {
    const names = EXERCISES.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
  it('each standard lift is mapped by exactly one exercise', () => {
    for (const lift of Object.keys(STRENGTH_STANDARDS)) {
      expect(EXERCISES.filter((e) => e.standard === lift)).toHaveLength(1);
    }
  });
  it('lowerBody flag matches primary leg muscles for leg exercises', () => {
    expect(EXERCISE_MAP.squat.lowerBody).toBe(true);
    expect(EXERCISE_MAP.bench_press.lowerBody).toBe(false);
  });
  it('every program-template exercise id exists in the library', () => {
    const ids = templateIds();
    expect(ids.length).toBeGreaterThan(40);
    const missing = ids.filter((id) => !EXERCISE_MAP[id]);
    expect(missing).toEqual([]);
  });
  it('access levels are nested: bodyweight ⊂ home ⊂ gym, gym covers every equipment', () => {
    for (const eq of ACCESS_EQUIPMENT.bodyweight) expect(ACCESS_EQUIPMENT.home.has(eq)).toBe(true);
    for (const eq of ACCESS_EQUIPMENT.home) expect(ACCESS_EQUIPMENT.gym.has(eq)).toBe(true);
    for (const eq of Object.keys(EQUIPMENT_LABEL)) expect(ACCESS_EQUIPMENT.gym.has(eq as never)).toBe(true);
    expect(Object.keys(ACCESS_LABEL).sort()).toEqual(['bodyweight', 'gym', 'home']);
  });
  it('bodyweight users have enough strength exercises', () => {
    const bw = EXERCISES.filter((e) => e.equipment === 'bodyweight' && e.kind !== 'cardio');
    expect(bw.length).toBeGreaterThanOrEqual(10);
  });
});

describe('muscle data integrity', () => {
  it('16 unique muscles with label, group and landmarks', () => {
    expect(MUSCLES).toHaveLength(16);
    expect(new Set(MUSCLES).size).toBe(16);
    for (const m of MUSCLES) {
      expect(MUSCLE_LABEL[m]).toBeTruthy();
      expect(MUSCLE_GROUP[m]).toBeTruthy();
      expect(VOLUME_LANDMARKS[m]).toBeDefined();
    }
    expect(Object.keys(MUSCLE_LABEL)).toHaveLength(16);
  });
  it('volume landmarks are ordered MEV ≤ MAV low ≤ MAV high ≤ MRV', () => {
    for (const m of MUSCLES) {
      const l = VOLUME_LANDMARKS[m];
      expect(l.mev).toBeGreaterThanOrEqual(0);
      expect(l.mev).toBeLessThanOrEqual(l.mav[0]);
      expect(l.mav[0]).toBeLessThanOrEqual(l.mav[1]);
      expect(l.mav[1]).toBeLessThanOrEqual(l.mrv);
    }
  });
  it('every muscle is trained by at least one exercise', () => {
    for (const m of MUSCLES) expect(EXERCISES.some((e) => e.primary.includes(m) || e.secondary.includes(m))).toBe(true);
  });
});
