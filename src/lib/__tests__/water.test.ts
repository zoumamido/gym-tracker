import { WATER_ML_PER_KG, WATER_ML_PER_TRAINING_HOUR, QUICK_ADD_ML, waterGoalMl, reminderTimes, servingPerReminder, expectedIntakeByNow } from '../water';

describe('waterGoalMl', () => {
  it('35 ml/kg, rounded to 50 ml', () => {
    expect(WATER_ML_PER_KG).toBe(35);
    expect(waterGoalMl(80)).toBe(2800);
    expect(waterGoalMl(81)).toBe(2850); // 2835 -> 2850
    expect(waterGoalMl(70)).toBe(2450);
  });
  it('adds 600 ml per training hour', () => {
    expect(WATER_ML_PER_TRAINING_HOUR).toBe(600);
    expect(waterGoalMl(80, 60)).toBe(3400);
    expect(waterGoalMl(80, 30)).toBe(3100);
    expect(waterGoalMl(80, -30)).toBe(2800);
    expect(waterGoalMl(80, NaN)).toBe(2800);
  });
  it('clamps base to 1.5–4 L and total to 6 L', () => {
    expect(waterGoalMl(30)).toBe(1500);
    expect(waterGoalMl(200)).toBe(4000);
    expect(waterGoalMl(200, 600)).toBe(6000);
  });
  it('defaults to 2000 ml for invalid weight', () => {
    expect(waterGoalMl(0)).toBe(2000);
    expect(waterGoalMl(-5)).toBe(2000);
    expect(waterGoalMl(NaN)).toBe(2000);
  });
});

describe('reminderTimes', () => {
  it('every 90 min from 8:00 to 22:00 inclusive', () => {
    const t = reminderTimes({ startHour: 8, endHour: 22, intervalMin: 90 });
    expect(t).toHaveLength(10);
    expect(t[0]).toEqual({ hour: 8, minute: 0 });
    expect(t[1]).toEqual({ hour: 9, minute: 30 });
    expect(t[9]).toEqual({ hour: 21, minute: 30 });
  });
  it('includes end when exactly on the grid', () => {
    const t = reminderTimes({ startHour: 8, endHour: 22, intervalMin: 120 });
    expect(t).toHaveLength(8);
    expect(t[t.length - 1]).toEqual({ hour: 22, minute: 0 });
  });
  it('respects start/end minutes', () => {
    const t = reminderTimes({ startHour: 7, startMinute: 30, endHour: 9, endMinute: 0, intervalMin: 45 });
    expect(t).toEqual([
      { hour: 7, minute: 30 },
      { hour: 8, minute: 15 },
      { hour: 9, minute: 0 },
    ]);
  });
  it('never emits 24:00', () => {
    const t = reminderTimes({ startHour: 8, endHour: 24, intervalMin: 120 });
    expect(t).toHaveLength(8);
    expect(t.every((x) => x.hour < 24)).toBe(true);
  });
  it('invalid windows produce no reminders', () => {
    expect(reminderTimes({ startHour: 8, endHour: 22, intervalMin: 14 })).toEqual([]);
    expect(reminderTimes({ startHour: 22, endHour: 8, intervalMin: 60 })).toEqual([]);
    expect(reminderTimes({ startHour: 8, endHour: 8, intervalMin: 60 })).toEqual([]);
    expect(reminderTimes({ startHour: -1, endHour: 8, intervalMin: 60 })).toEqual([]);
    expect(reminderTimes({ startHour: 8, endHour: 25, intervalMin: 60 })).toEqual([]);
    expect(reminderTimes({ startHour: NaN, endHour: 22, intervalMin: 60 })).toEqual([]);
    expect(reminderTimes({ startHour: 8, endHour: 22, intervalMin: NaN })).toEqual([]);
  });
  it('minimum 15 min interval accepted', () => {
    expect(reminderTimes({ startHour: 8, endHour: 9, intervalMin: 15 })).toHaveLength(5);
  });
});

describe('servingPerReminder', () => {
  it('splits goal evenly, rounded to 50 ml, clamped 100–750', () => {
    expect(servingPerReminder(2800, 10)).toBe(300);
    expect(servingPerReminder(2000, 8)).toBe(250);
    expect(servingPerReminder(500, 10)).toBe(100);
    expect(servingPerReminder(10000, 4)).toBe(750);
  });
  it('defaults to 250 for invalid inputs', () => {
    expect(servingPerReminder(2800, 0)).toBe(250);
    expect(servingPerReminder(0, 5)).toBe(250);
    expect(servingPerReminder(NaN, 5)).toBe(250);
  });
});

describe('expectedIntakeByNow', () => {
  const win = { startHour: 8, endHour: 22, intervalMin: 90 };
  it('linear across window', () => {
    expect(expectedIntakeByNow(2800, new Date(2026, 9, 9, 15, 0), win)).toBe(1400);
    expect(expectedIntakeByNow(2800, new Date(2026, 9, 9, 10, 0), win)).toBe(400);
  });
  it('clamped before start and after end', () => {
    expect(expectedIntakeByNow(2800, new Date(2026, 9, 9, 6, 0), win)).toBe(0);
    expect(expectedIntakeByNow(2800, new Date(2026, 9, 9, 8, 0), win)).toBe(0);
    expect(expectedIntakeByNow(2800, new Date(2026, 9, 9, 22, 0), win)).toBe(2800);
    expect(expectedIntakeByNow(2800, new Date(2026, 9, 9, 23, 30), win)).toBe(2800);
  });
  it('0 for invalid window/goal', () => {
    expect(expectedIntakeByNow(2800, new Date(2026, 9, 9, 15), { startHour: 22, endHour: 8, intervalMin: 60 })).toBe(0);
    expect(expectedIntakeByNow(0, new Date(2026, 9, 9, 15), win)).toBe(0);
    expect(expectedIntakeByNow(NaN, new Date(2026, 9, 9, 15), win)).toBe(0);
  });
  it('quick add sizes are ascending', () => {
    expect([...QUICK_ADD_ML]).toEqual([...QUICK_ADD_ML].sort((a, b) => a - b));
  });
});
