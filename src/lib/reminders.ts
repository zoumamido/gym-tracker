/**
 * Pure reminder planning: decides *which* notifications should exist for the
 * next N days. The notification service just applies this plan, which keeps
 * the logic testable and idempotent.
 */
import { addDays, dayKey, startOfDay } from './dates';
import { WeightUnit, formatWater } from './units';
import { reminderTimes, servingPerReminder } from './water';

export type ReminderKind = 'water' | 'workout';

export interface PlannedReminder {
  id: string;
  kind: ReminderKind;
  date: Date;
  title: string;
  body: string;
}

export interface ReminderPlanInput {
  now: Date;
  /** Days of workout reminders to plan (default 7). */
  days?: number;
  /** Days of water reminders to plan (default 3, keeps the total under iOS's 64 pending limit). */
  waterDays?: number;
  unit: WeightUnit;
  water: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    intervalMin: number;
    goalMl: number;
    todayIntakeMl: number;
  };
  workout: {
    enabled: boolean;
    hour: number;
    minute: number;
    /** 7 entries (0 = Sunday): today's routine name and exercise count, or null. */
    schedule: ({ name: string; exerciseCount: number } | null)[];
    /** Skip today's reminder when a workout was already finished today. */
    trainedToday?: boolean;
  };
}

const WATER_TITLES = ['Time to hydrate 💧', 'Water break 💧', 'Stay hydrated 💧', 'Drink up 💧'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Hard cap on pending notifications (iOS keeps only the soonest 64). */
export const MAX_PENDING = 60;

export function planReminders(input: ReminderPlanInput): PlannedReminder[] {
  const { now, unit, water, workout } = input;
  const days = Math.max(1, Math.min(14, input.days ?? 7));
  const waterDays = Math.max(1, Math.min(days, input.waterDays ?? 3));
  const out: PlannedReminder[] = [];
  const today = startOfDay(now);

  if (water.enabled) {
    const times = reminderTimes({ startHour: water.startHour, endHour: water.endHour, intervalMin: water.intervalMin });
    const serving = servingPerReminder(water.goalMl, times.length);
    const remainingToday = times.filter((t) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), t.hour, t.minute).getTime() > now.getTime()).length;
    for (let d = 0; d < waterDays; d++) {
      const day = addDays(today, d);
      const isToday = d === 0;
      if (isToday && water.todayIntakeMl >= water.goalMl) continue;
      times.forEach((t, i) => {
        const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), t.hour, t.minute);
        if (at.getTime() <= now.getTime()) return;
        let body = `Drink ${formatWater(serving, unit)} now to stay on track for ${formatWater(water.goalMl, unit)} today.`;
        if (isToday) {
          const left = Math.max(0, water.goalMl - water.todayIntakeMl);
          const todaysServing = servingPerReminder(left, Math.max(1, remainingToday));
          body = `${formatWater(water.todayIntakeMl, unit)} of ${formatWater(water.goalMl, unit)} so far — ${formatWater(left, unit)} to go. Have ${formatWater(todaysServing, unit)} now.`;
        }
        out.push({
          id: `water-${dayKey(day)}-${pad(t.hour)}${pad(t.minute)}`,
          kind: 'water',
          date: at,
          title: WATER_TITLES[i % WATER_TITLES.length],
          body,
        });
      });
    }
  }

  if (workout.enabled) {
    for (let d = 0; d < days; d++) {
      const day = addDays(today, d);
      const routine = workout.schedule[day.getDay()];
      if (!routine || (d === 0 && workout.trainedToday)) continue;
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), workout.hour, workout.minute);
      if (at.getTime() <= now.getTime()) continue;
      out.push({
        id: `workout-${dayKey(day)}`,
        kind: 'workout',
        date: at,
        title: `Today: ${routine.name} 🏋️`,
        body: `${routine.exerciseCount} exercises planned. Warm up, hit your targets, and log every set.`,
      });
    }
  }

  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  if (out.length <= MAX_PENDING) return out;
  // Over the cap: keep every workout reminder, then the soonest water reminders.
  const workouts = out.filter((r) => r.kind === 'workout');
  const waterKept = out.filter((r) => r.kind === 'water').slice(0, Math.max(0, MAX_PENDING - workouts.length));
  return [...workouts, ...waterKept].sort((a, b) => a.date.getTime() - b.date.getTime());
}
