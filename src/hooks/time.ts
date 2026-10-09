import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { addDays, dayKey, startOfDay } from '../lib/dates';

/** Current epoch ms, refreshed every `intervalMs` while enabled. */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

/**
 * A Date for "now" that changes identity when the calendar day changes
 * (at midnight, or when the app returns to the foreground on a new day),
 * so screens keyed on today never go stale.
 */
export function useToday(): Date {
  const [key, setKey] = useState(() => dayKey());
  useEffect(() => {
    const refresh = () => setKey(dayKey());
    const msToMidnight = addDays(startOfDay(new Date()), 1).getTime() - Date.now() + 1000;
    const t = setTimeout(refresh, msToMidnight);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Date(), [key]);
}
