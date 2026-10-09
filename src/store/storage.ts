import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

/**
 * AsyncStorage wrapper that coalesces rapid writes (e.g. typing into a set
 * input) into one write every `delayMs`, and flushes immediately when the app
 * goes to the background so nothing is lost.
 */
export function createDebouncedStorage(delayMs = 400): StateStorage & { flush: () => Promise<void> } {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const entries = [...pending.entries()];
    pending.clear();
    await Promise.all(entries.map(([k, v]) => AsyncStorage.setItem(k, v)));
  };

  AppState.addEventListener('change', (s) => {
    if (s !== 'active') flush().catch(() => {});
  });

  return {
    getItem: async (name) => (pending.has(name) ? pending.get(name)! : AsyncStorage.getItem(name)),
    setItem: (name, value) => {
      pending.set(name, value);
      if (!timer) timer = setTimeout(() => flush().catch(() => {}), delayMs);
    },
    removeItem: async (name) => {
      pending.delete(name);
      await AsyncStorage.removeItem(name);
    },
    flush,
  };
}

export const debouncedStorage = createDebouncedStorage();
