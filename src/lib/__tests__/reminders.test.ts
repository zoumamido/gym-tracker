import { planReminders, ReminderPlanInput, MAX_PENDING } from '../reminders';
import { dayKey } from '../dates';

const NOW = new Date(2026, 9, 9, 10, 0); // Friday

const SCHEDULE: ReminderPlanInput['workout']['schedule'] = [
  null, // Sun
  { name: 'Upper A', exerciseCount: 6 }, // Mon
  { name: 'Lower A', exerciseCount: 5 }, // Tue
  null, // Wed
  { name: 'Upper B', exerciseCount: 6 }, // Thu
  { name: 'Lower B', exerciseCount: 6 }, // Fri
  null, // Sat
];

const input = (over: Partial<ReminderPlanInput> = {}, water: Partial<ReminderPlanInput['water']> = {}, workout: Partial<ReminderPlanInput['workout']> = {}): ReminderPlanInput => ({
  now: NOW,
  unit: 'kg',
  ...over,
  water: { enabled: true, startHour: 8, endHour: 22, intervalMin: 120, goalMl: 2800, todayIntakeMl: 0, ...water },
  workout: { enabled: true, hour: 18, minute: 0, schedule: SCHEDULE, ...workout },
});

describe('planReminders', () => {
  it('7-day plan: water every 2 h 08–22 (skipping past times) + scheduled workouts', () => {
    const plan = planReminders(input({ waterDays: 7 }));
    const water = plan.filter((p) => p.kind === 'water');
    const workouts = plan.filter((p) => p.kind === 'workout');
    // today: 12,14,16,18,20,22 (8:00 and 10:00 are not in the future) + 6 days × 8
    expect(water).toHaveLength(6 + 6 * 8);
    expect(workouts.map((w) => dayKey(w.date))).toEqual(['2026-10-09', '2026-10-12', '2026-10-13', '2026-10-15']);
    expect(workouts[0].title).toContain('Lower B');
    expect(workouts[0].body).toContain('6 exercises');
    expect(plan).toHaveLength(58);
  });
  it('never schedules in the past or exactly now', () => {
    const plan = planReminders(input());
    for (const p of plan) expect(p.date.getTime()).toBeGreaterThan(NOW.getTime());
    const firstToday = plan.filter((p) => p.kind === 'water' && dayKey(p.date) === '2026-10-09');
    expect(firstToday[0].date.getHours()).toBe(12);
  });
  it('is sorted by time', () => {
    const plan = planReminders(input());
    for (let i = 1; i < plan.length; i++) expect(plan[i].date.getTime()).toBeGreaterThanOrEqual(plan[i - 1].date.getTime());
  });
  it('ids are unique, stable and well-formed', () => {
    const a = planReminders(input());
    const b = planReminders(input());
    expect(new Set(a.map((p) => p.id)).size).toBe(a.length);
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
    expect(a.map((p) => p.id)).toContain('water-2026-10-09-1200');
    expect(a.map((p) => p.id)).toContain('workout-2026-10-12');
    for (const p of a) expect(p.id).toMatch(/^(water-\d{4}-\d{2}-\d{2}-\d{4}|workout-\d{4}-\d{2}-\d{2})$/);
  });
  it("skips today's water reminders once the goal is met", () => {
    const plan = planReminders(input({ waterDays: 7 }, { todayIntakeMl: 2800 }));
    const water = plan.filter((p) => p.kind === 'water');
    expect(water).toHaveLength(6 * 8);
    expect(water.some((p) => dayKey(p.date) === '2026-10-09')).toBe(false);
    expect(planReminders(input({ waterDays: 7 }, { todayIntakeMl: 3500 })).filter((p) => p.kind === 'water')).toHaveLength(48);
    // default 3 water days: tomorrow and the day after only
    expect(planReminders(input({}, { todayIntakeMl: 2800 })).filter((p) => p.kind === 'water')).toHaveLength(16);
  });
  it("today's water body shows progress; later days show the serving", () => {
    const plan = planReminders(input({}, { todayIntakeMl: 1200 }));
    const today = plan.find((p) => p.id === 'water-2026-10-09-1200')!;
    // 1600 ml left over 6 remaining reminders today (12–22 h) = 266.7 -> 250 ml
    expect(today.body).toBe('1.2 L of 2.8 L so far — 1.6 L to go. Have 250 ml now.');
    const tomorrow = plan.find((p) => p.id === 'water-2026-10-10-0800')!;
    expect(tomorrow.body).toBe('Drink 350 ml now to stay on track for 2.8 L today.');
  });
  it("today's serving is spread over the remaining reminders only", () => {
    const plan = planReminders(input({}, { todayIntakeMl: 0 }));
    // 2800 ml over 6 remaining = 466.7 -> 450 ml (later days: 2800 / 8 = 350 ml)
    expect(plan.find((p) => p.id === 'water-2026-10-09-1200')!.body).toMatch(/Have 450 ml now\.$/);
    expect(plan.find((p) => p.id === 'water-2026-10-11-1400')!.body).toMatch(/^Drink 350 ml now/);
    const late = planReminders(input({ now: new Date(2026, 9, 9, 21, 0) }, { todayIntakeMl: 1000 }));
    // 1800 ml left, only 22:00 remains -> 1800 clamped to 750 ml
    const t = late.find((p) => p.id === 'water-2026-10-09-2200')!;
    expect(t.body).toMatch(/Have 750 ml now\.$/);
    const almost = planReminders(input({}, { todayIntakeMl: 2750 }));
    // 50 ml left / 6 -> clamped to the 100 ml minimum
    expect(almost.find((p) => p.id === 'water-2026-10-09-1200')!.body).toMatch(/Have 100 ml now\.$/);
  });
  it('imperial units in water text', () => {
    const plan = planReminders(input({ unit: 'lb' }));
    expect(plan.find((p) => p.kind === 'water')!.body).toMatch(/oz/);
  });
  it("skips today's workout when the reminder time has passed", () => {
    const plan = planReminders(input({}, {}, { hour: 9, minute: 30 }));
    expect(plan.filter((p) => p.kind === 'workout').map((p) => dayKey(p.date))).toEqual(['2026-10-12', '2026-10-13', '2026-10-15']);
  });
  it('workout at exactly now is skipped', () => {
    const plan = planReminders(input({}, {}, { hour: 10, minute: 0 }));
    expect(plan.some((p) => p.id === 'workout-2026-10-09')).toBe(false);
  });
  it('workout minute is honoured', () => {
    const plan = planReminders(input({}, {}, { hour: 18, minute: 45 }));
    const w = plan.find((p) => p.id === 'workout-2026-10-12')!;
    expect(w.date.getHours()).toBe(18);
    expect(w.date.getMinutes()).toBe(45);
  });
  it('disabled channels produce nothing', () => {
    expect(planReminders(input({}, { enabled: false }, { enabled: false }))).toEqual([]);
    expect(planReminders(input({}, { enabled: false })).every((p) => p.kind === 'workout')).toBe(true);
    expect(planReminders(input({}, {}, { enabled: false })).every((p) => p.kind === 'water')).toBe(true);
  });
  it('invalid water window produces no water reminders', () => {
    expect(planReminders(input({}, { startHour: 22, endHour: 8 })).filter((p) => p.kind === 'water')).toEqual([]);
  });
  it('days clamped to 1..14', () => {
    const one = planReminders(input({ days: 0 }));
    expect(one.every((p) => dayKey(p.date) === '2026-10-09')).toBe(true);
    const many = planReminders(input({ days: 30 }));
    const last = many[many.length - 1];
    expect(dayKey(last.date)).toBe('2026-10-22');
  });
  it('DST: wall-clock reminder times are preserved across the change', () => {
    // Oct 22–28 spans the EU change on Oct 25
    const plan = planReminders(input({ now: new Date(2026, 9, 22, 7, 0), days: 7, waterDays: 7 }));
    for (const p of plan.filter((x) => x.kind === 'water')) {
      expect(p.date.getMinutes()).toBe(0);
      expect([8, 10, 12, 14, 16, 18, 20, 22]).toContain(p.date.getHours());
    }
    const days = new Set(plan.filter((x) => x.kind === 'water').map((p) => dayKey(p.date)));
    expect(days.size).toBe(7);
    expect(days.has('2026-10-25')).toBe(true);
    expect(plan.filter((x) => x.kind === 'water')).toHaveLength(56);
    for (const p of plan.filter((x) => x.kind === 'workout')) expect(p.date.getHours()).toBe(18);
  });
  it('empty schedule -> no workout reminders', () => {
    expect(planReminders(input({}, {}, { schedule: Array(7).fill(null) })).filter((p) => p.kind === 'workout')).toEqual([]);
  });
});

describe('planReminders — waterDays, trainedToday, MAX_PENDING', () => {
  const waterDaysOf = (plan: ReturnType<typeof planReminders>) => [...new Set(plan.filter((p) => p.kind === 'water').map((p) => dayKey(p.date)))];

  it('water defaults to 3 days while workouts still cover 7', () => {
    const plan = planReminders(input());
    expect(waterDaysOf(plan)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
    expect(plan.filter((p) => p.kind === 'water')).toHaveLength(6 + 8 + 8);
    expect(plan.filter((p) => p.kind === 'workout').map((p) => dayKey(p.date))).toEqual(['2026-10-09', '2026-10-12', '2026-10-13', '2026-10-15']);
    expect(plan).toHaveLength(26);
  });
  it('waterDays is clamped to 1..days', () => {
    expect(waterDaysOf(planReminders(input({ waterDays: 0 })))).toEqual(['2026-10-09']);
    expect(waterDaysOf(planReminders(input({ waterDays: -4 })))).toEqual(['2026-10-09']);
    expect(waterDaysOf(planReminders(input({ waterDays: 1 })))).toEqual(['2026-10-09']);
    expect(waterDaysOf(planReminders(input({ days: 2, waterDays: 10 })))).toEqual(['2026-10-09', '2026-10-10']);
    expect(waterDaysOf(planReminders(input({ days: 5, waterDays: 5 })))).toHaveLength(5);
  });
  it('trainedToday skips only today\'s workout reminder', () => {
    const plan = planReminders(input({}, {}, { trainedToday: true }));
    const ids = plan.filter((p) => p.kind === 'workout').map((p) => p.id);
    expect(ids).toEqual(['workout-2026-10-12', 'workout-2026-10-13', 'workout-2026-10-15']);
    expect(planReminders(input({}, {}, { trainedToday: false })).map((p) => p.id)).toContain('workout-2026-10-09');
    // today's water reminders are unaffected
    expect(plan.some((p) => p.id === 'water-2026-10-09-1200')).toBe(true);
  });
  it('MAX_PENDING is 60 and plans at or under it are not trimmed', () => {
    expect(MAX_PENDING).toBe(60);
    const plan = planReminders(input({ waterDays: 7 }));
    expect(plan).toHaveLength(58);
  });
  it('over the cap: keeps every workout, trims water to the soonest, stays sorted', () => {
    const full = { ...input({ days: 14, waterDays: 14 }, { intervalMin: 60 }) };
    const plan = planReminders(full);
    expect(plan).toHaveLength(MAX_PENDING);
    const workouts = plan.filter((p) => p.kind === 'workout');
    // Fri 9, Mon 12, Tue 13, Thu 15, Fri 16, Mon 19, Tue 20, Thu 22
    expect(workouts.map((p) => dayKey(p.date))).toEqual([
      '2026-10-09',
      '2026-10-12',
      '2026-10-13',
      '2026-10-15',
      '2026-10-16',
      '2026-10-19',
      '2026-10-20',
      '2026-10-22',
    ]);
    const water = plan.filter((p) => p.kind === 'water');
    expect(water).toHaveLength(MAX_PENDING - 8);
    // the kept water reminders are exactly the soonest ones of the untrimmed water plan
    const allWater = planReminders({ ...full, workout: { ...full.workout, enabled: false } });
    expect(allWater.length).toBe(MAX_PENDING);
    // (that plan is itself trimmed to 60 soonest water reminders; the first 52 must match)
    expect(water.map((p) => p.id)).toEqual(allWater.slice(0, MAX_PENDING - 8).map((p) => p.id));
    expect(water[0].id).toBe('water-2026-10-09-1100');
    for (let i = 1; i < plan.length; i++) expect(plan[i].date.getTime()).toBeGreaterThanOrEqual(plan[i - 1].date.getTime());
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
  });
  it('water-only plan over the cap is trimmed to the 60 soonest', () => {
    const plan = planReminders(input({ days: 14, waterDays: 14 }, { intervalMin: 60 }, { enabled: false }));
    expect(plan).toHaveLength(60);
    // 12 left today (11..22 h) + 15 per day -> 60 = 12 + 15 + 15 + 15 + 3
    expect(dayKey(plan[59].date)).toBe('2026-10-13');
    expect(plan[59].date.getHours()).toBe(10);
  });
});
