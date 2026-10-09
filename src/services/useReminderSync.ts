import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { dayKey } from '../lib/dates';
import { planReminders } from '../lib/reminders';
import { waterGoalMl } from '../lib/water';
import { useStore, StoreState } from '../store/useStore';
import { applyReminderPlan, cancelRestDone } from './notifications';

function buildPlan(s: StoreState) {
  const now = new Date();
  const today = dayKey(now);
  const weight = s.weighIns.length ? s.weighIns[s.weighIns.length - 1].weightKg : (s.profile?.weightKg ?? 70);
  const override = s.settings.water.goalOverrideMl;
  const goal = override && override > 0 ? override : waterGoalMl(weight, s.profile ? (s.profile.sessionMinutes * s.profile.daysPerWeek) / 7 : 0);
  const intake = (s.water[today] ?? []).reduce((a, e) => a + e.ml, 0);
  const schedule = Array.from({ length: 7 }, (_, d) => {
    const id = s.program?.schedule[d];
    const r = id ? s.program?.routines.find((x) => x.id === id) : undefined;
    return r ? { name: r.name, exerciseCount: r.exercises.length } : null;
  });
  return planReminders({
    now,
    unit: s.settings.unit,
    water: { enabled: s.settings.water.remindersEnabled, ...s.settings.water, goalMl: goal, todayIntakeMl: intake },
    workout: {
      ...s.settings.workoutReminder,
      schedule,
      trainedToday: s.workouts.some((w) => w.endedAt != null && dayKey(new Date(w.startedAt)) === today),
    },
  });
}

/**
 * Keeps scheduled notifications in sync with settings, program and today's water.
 * Re-plans (debounced) on relevant store changes and whenever the app is foregrounded.
 */
export function useReminderSync() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const run = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const s = useStore.getState();
        if (!s.onboarded) {
          // After a reset: clear every reminder and any pending rest alert.
          applyReminderPlan([]);
          cancelRestDone();
          return;
        }
        applyReminderPlan(buildPlan(s));
      }, 800);
    };

    run();
    const unsub = useStore.subscribe((s, prev) => {
      if (s.settings !== prev.settings || s.program !== prev.program || s.water !== prev.water || s.weighIns !== prev.weighIns || s.workouts !== prev.workouts || s.onboarded !== prev.onboarded) {
        run();
      }
    });
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') run();
    });
    return () => {
      unsub();
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
