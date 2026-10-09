import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { PlannedReminder } from '../lib/reminders';

const REMINDER_CHANNEL = 'reminders';
const TIMER_CHANNEL = 'rest-timer';
const REST_ID = 'rest-timer';
const supported = Platform.OS !== 'web';

let initialised = false;

export async function initNotifications(): Promise<void> {
  if (!supported || initialised) return;
  initialised = true;
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      // Don't pop the rest-timer banner while the app is open; the in-app bar handles it.
      const isRest = n.request.identifier === REST_ID;
      return {
        shouldPlaySound: !isRest,
        shouldSetBadge: false,
        shouldShowBanner: !isRest,
        shouldShowList: !isRest,
      };
    },
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: 'Water & workout reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#7C5CFF',
    });
    await Notifications.setNotificationChannelAsync(TIMER_CHANNEL, {
      name: 'Rest timer',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#22D3EE',
    });
  }
}

export async function hasPermission(): Promise<boolean> {
  if (!supported) return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

export async function requestPermission(): Promise<boolean> {
  if (!supported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  if (!current.canAskAgain) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

let syncChain: Promise<void> = Promise.resolve();

/**
 * Makes the scheduled reminders match `plan` exactly. Calls are serialised so
 * overlapping syncs can't double-schedule.
 */
export function applyReminderPlan(plan: PlannedReminder[]): Promise<void> {
  if (!supported) return Promise.resolve();
  syncChain = syncChain
    .then(async () => {
      if (!(await hasPermission())) return;
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const wanted = new Map(plan.map((p) => [p.id, p]));
      const existing = new Set<string>();
      for (const n of scheduled) {
        const kind = (n.content.data as { kind?: string } | null)?.kind;
        if (kind !== 'water' && kind !== 'workout') continue;
        const want = wanted.get(n.identifier);
        // Reschedule when the content changed (e.g. updated water progress).
        if (!want || want.body !== n.content.body) {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        } else {
          existing.add(n.identifier);
        }
      }
      for (const p of plan) {
        if (existing.has(p.id)) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: p.id,
          content: { title: p.title, body: p.body, data: { kind: p.kind } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.date, channelId: REMINDER_CHANNEL },
        });
      }
    })
    .catch((e) => {
      console.warn('Reminder sync failed', e);
    });
  return syncChain;
}

export async function scheduleRestDone(seconds: number, label: string): Promise<void> {
  if (!supported || !(seconds > 0)) return;
  try {
    if (!(await hasPermission())) return;
    await Notifications.cancelScheduledNotificationAsync(REST_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: REST_ID,
      content: { title: 'Rest is over 💪', body: `Time for your next set${label ? ` of ${label}` : ''}.`, data: { kind: 'rest' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(seconds)), channelId: TIMER_CHANNEL },
    });
  } catch (e) {
    console.warn('Rest notification failed', e);
  }
}

export async function cancelRestDone(): Promise<void> {
  if (!supported) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(REST_ID);
  } catch {
    // nothing scheduled
  }
}

/** Fires a test reminder in 5 seconds. */
export async function sendTestNotification(): Promise<boolean> {
  if (!supported) return false;
  if (!(await requestPermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Reminders are working ✅', body: 'You will get water and workout reminders like this one.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: REMINDER_CHANNEL },
  });
  return true;
}
