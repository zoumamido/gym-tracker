import { useStore } from '../store/useStore';
import { cancelRestDone, scheduleRestDone } from './notifications';

/** Starts the in-app rest timer and (optionally) a "rest is over" notification. */
export function beginRest(seconds: number, label: string) {
  const s = useStore.getState();
  if (!(seconds > 0)) return;
  s.startRest(seconds, label);
  if (s.settings.restTimer.notify) scheduleRestDone(seconds, label);
}

export function adjustRest(deltaSec: number) {
  const s = useStore.getState();
  s.adjustRest(deltaSec);
  const t = useStore.getState().restTimer;
  if (t && s.settings.restTimer.notify) scheduleRestDone((t.endsAt - Date.now()) / 1000, t.label);
  else cancelRestDone();
}

export function endRest() {
  useStore.getState().stopRest();
  cancelRestDone();
}
