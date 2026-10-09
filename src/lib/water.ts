/**
 * Hydration targets and reminder timing. See docs/gym-science.md section 7.
 */
import { clamp, roundTo } from './units';

export const WATER_ML_PER_KG = 35;
export const WATER_ML_PER_TRAINING_HOUR = 600;
const BASE_MIN = 1500;
const BASE_MAX = 4000;
const TOTAL_MAX = 6000;

/** Daily drinking target in ml (rounded to 50 ml). */
export function waterGoalMl(weightKg: number, trainingMinutes = 0): number {
  if (!(weightKg > 0)) return 2000;
  const base = clamp(weightKg * WATER_ML_PER_KG, BASE_MIN, BASE_MAX);
  const extra = Math.max(0, Number.isFinite(trainingMinutes) ? trainingMinutes : 0) * (WATER_ML_PER_TRAINING_HOUR / 60);
  return roundTo(Math.min(TOTAL_MAX, base + extra), 50);
}

export interface ClockTime {
  hour: number;
  minute: number;
}

export interface ReminderWindow {
  startHour: number;
  startMinute?: number;
  endHour: number;
  endMinute?: number;
  intervalMin: number;
}

/**
 * Times between start and end (inclusive) every intervalMin minutes.
 * Empty when the window is invalid or end isn't after start.
 */
export function reminderTimes({ startHour, startMinute = 0, endHour, endMinute = 0, intervalMin }: ReminderWindow): ClockTime[] {
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  if (![start, end, intervalMin].every(Number.isFinite) || intervalMin < 15 || start < 0 || end > 24 * 60 || end <= start) {
    return [];
  }
  const out: ClockTime[] = [];
  for (let t = start; t <= end && t < 24 * 60; t += intervalMin) {
    out.push({ hour: Math.floor(t / 60), minute: t % 60 });
  }
  return out;
}

/** How much to drink per reminder so the goal is met across the day. */
export function servingPerReminder(goalMl: number, reminderCount: number): number {
  if (!(goalMl > 0) || !(reminderCount > 0)) return 250;
  return clamp(roundTo(goalMl / reminderCount, 50), 100, 750);
}

/**
 * Where intake *should* be by now, assuming linear drinking across the window.
 * Used to say "you're behind by 400 ml".
 */
export function expectedIntakeByNow(goalMl: number, now: Date, window: ReminderWindow): number {
  const start = window.startHour * 60 + (window.startMinute ?? 0);
  const end = window.endHour * 60 + (window.endMinute ?? 0);
  if (end <= start || !(goalMl > 0)) return 0;
  const t = now.getHours() * 60 + now.getMinutes();
  const frac = clamp((t - start) / (end - start), 0, 1);
  return Math.round(goalMl * frac);
}

export const QUICK_ADD_ML = [150, 250, 330, 500, 750] as const;
