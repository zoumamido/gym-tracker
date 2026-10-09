import * as Notifications from 'expo-notifications';
import type { PlannedReminder } from '../../lib/reminders';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  AndroidImportance: { HIGH: 4, MAX: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const svc = require('../notifications') as typeof import('../notifications');

const N = Notifications as jest.Mocked<typeof Notifications>;
const getAll = N.getAllScheduledNotificationsAsync as unknown as jest.Mock;
const getPerm = N.getPermissionsAsync as unknown as jest.Mock;
const reqPerm = N.requestPermissionsAsync as unknown as jest.Mock;
const cancel = N.cancelScheduledNotificationAsync as jest.Mock;
const schedule = N.scheduleNotificationAsync as jest.Mock;

const scheduled = (identifier: string, kind: string | undefined, body = 'b') => ({
  identifier,
  content: { title: 't', body, data: kind ? { kind } : null },
  trigger: null,
});

const plan = (id: string, kind: 'water' | 'workout', body = 'b'): PlannedReminder => ({
  id,
  kind,
  body,
  title: 'T ' + id,
  date: new Date(2026, 9, 9, 12, 0),
});

beforeEach(() => {
  jest.clearAllMocks();
  getPerm.mockResolvedValue({ status: 'granted', canAskAgain: true });
  getAll.mockResolvedValue([]);
});

describe('applyReminderPlan', () => {
  it('cancels stale and changed reminders, keeps unchanged, schedules new ones', async () => {
    getAll.mockResolvedValue([
      scheduled('water-keep', 'water', 'same'),
      scheduled('water-changed', 'water', 'old body'),
      scheduled('workout-stale', 'workout'),
      scheduled('rest-timer', 'rest'),
      scheduled('other', undefined),
    ]);
    await svc.applyReminderPlan([plan('water-keep', 'water', 'same'), plan('water-changed', 'water', 'new body'), plan('workout-new', 'workout')]);

    const cancelled = cancel.mock.calls.map((c) => c[0]).sort();
    expect(cancelled).toEqual(['water-changed', 'workout-stale']);
    const ids = schedule.mock.calls.map((c) => c[0].identifier);
    expect(ids).toEqual(['water-changed', 'workout-new']);
    expect(schedule).toHaveBeenCalledWith({
      identifier: 'workout-new',
      content: { title: 'T workout-new', body: 'b', data: { kind: 'workout' } },
      trigger: { type: 'date', date: new Date(2026, 9, 9, 12, 0), channelId: 'reminders' },
    });
  });

  it('ignores notifications of other kinds even if ids collide with nothing in plan', async () => {
    getAll.mockResolvedValue([scheduled('rest-timer', 'rest'), scheduled('x', 'misc')]);
    await svc.applyReminderPlan([]);
    expect(cancel).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('does nothing without permission', async () => {
    getPerm.mockResolvedValue({ status: 'denied', canAskAgain: false });
    getAll.mockResolvedValue([scheduled('water-old', 'water')]);
    await svc.applyReminderPlan([plan('water-new', 'water')]);
    expect(getAll).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('serialises overlapping calls and swallows errors', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    getAll.mockRejectedValueOnce(new Error('boom'));
    const p1 = svc.applyReminderPlan([plan('a', 'water')]);
    const p2 = svc.applyReminderPlan([plan('b', 'water')]);
    await expect(p1).resolves.toBeUndefined();
    await p2;
    expect(warn).toHaveBeenCalledWith('Reminder sync failed', expect.any(Error));
    expect(schedule.mock.calls.map((c) => c[0].identifier)).toEqual(['b']);
    warn.mockRestore();
  });
});

describe('rest notifications', () => {
  it('scheduleRestDone cancels previous and schedules TIME_INTERVAL on rest-timer channel', async () => {
    await svc.scheduleRestDone(89.6, 'Bench');
    expect(cancel).toHaveBeenCalledWith('rest-timer');
    expect(schedule).toHaveBeenCalledTimes(1);
    const arg = schedule.mock.calls[0][0];
    expect(arg.identifier).toBe('rest-timer');
    expect(arg.content.body).toBe('Time for your next set of Bench.');
    expect(arg.content.data).toEqual({ kind: 'rest' });
    expect(arg.trigger).toEqual({ type: 'timeInterval', seconds: 90, channelId: 'rest-timer' });
  });

  it('scheduleRestDone clamps to >= 1s and omits empty label', async () => {
    await svc.scheduleRestDone(0.2, '');
    const arg = schedule.mock.calls[0][0];
    expect(arg.trigger.seconds).toBe(1);
    expect(arg.content.body).toBe('Time for your next set.');
  });

  it('scheduleRestDone ignores non-positive seconds and missing permission', async () => {
    await svc.scheduleRestDone(0, 'x');
    await svc.scheduleRestDone(-5, 'x');
    await svc.scheduleRestDone(NaN, 'x');
    expect(getPerm).not.toHaveBeenCalled();
    getPerm.mockResolvedValue({ status: 'denied' });
    await svc.scheduleRestDone(30, 'x');
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('scheduleRestDone swallows errors', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    schedule.mockRejectedValueOnce(new Error('x'));
    await expect(svc.scheduleRestDone(30, 'x')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('cancelRestDone cancels rest id and swallows errors', async () => {
    await svc.cancelRestDone();
    expect(cancel).toHaveBeenCalledWith('rest-timer');
    cancel.mockRejectedValueOnce(new Error('none'));
    await expect(svc.cancelRestDone()).resolves.toBeUndefined();
  });
});

describe('permissions / init', () => {
  it('requestPermission short-circuits when granted, respects canAskAgain', async () => {
    expect(await svc.requestPermission()).toBe(true);
    expect(reqPerm).not.toHaveBeenCalled();
    getPerm.mockResolvedValue({ status: 'denied', canAskAgain: false });
    expect(await svc.requestPermission()).toBe(false);
    expect(reqPerm).not.toHaveBeenCalled();
    getPerm.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    reqPerm.mockResolvedValue({ status: 'granted' });
    expect(await svc.requestPermission()).toBe(true);
  });

  it('initNotifications installs handler once that silences rest-timer banners', async () => {
    await svc.initNotifications();
    await svc.initNotifications();
    expect(N.setNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = (N.setNotificationHandler as jest.Mock).mock.calls[0][0].handleNotification;
    expect(await handler({ request: { identifier: 'rest-timer' } })).toMatchObject({ shouldShowBanner: false, shouldPlaySound: false });
    expect(await handler({ request: { identifier: 'water-x' } })).toMatchObject({ shouldShowBanner: true, shouldPlaySound: true });
  });

  it('sendTestNotification schedules on reminders channel', async () => {
    expect(await svc.sendTestNotification()).toBe(true);
    expect(schedule.mock.calls[0][0].trigger).toEqual({ type: 'timeInterval', seconds: 5, channelId: 'reminders' });
  });
});
