import { useEffect } from 'react';
import { Vibration } from 'react-native';
import { useStore } from '../store/useStore';
import { endRest } from './rest';

/**
 * App-wide watcher: when the rest timer runs out while the app is open (on any
 * screen), vibrate and clear it. The system notification covers the
 * background case.
 */
export function useRestWatcher() {
  const timer = useStore((s) => s.restTimer);
  useEffect(() => {
    if (!timer) return;
    const ms = timer.endsAt - Date.now();
    const fire = () => {
      if (useStore.getState().settings.haptics) Vibration.vibrate([0, 300, 150, 300]);
      endRest();
    };
    if (ms <= 0) {
      // Long expired (e.g. app reopened later): clear silently.
      if (ms < -5000) endRest();
      else fire();
      return;
    }
    const t = setTimeout(fire, ms);
    return () => clearTimeout(t);
  }, [timer]);
}
