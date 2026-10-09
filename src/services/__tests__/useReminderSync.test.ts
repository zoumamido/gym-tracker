import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useStore } from '../../store/useStore';
import { useReminderSync } from '../useReminderSync';
import { applyReminderPlan, cancelRestDone } from '../notifications';
import { waterGoalMl } from '../../lib/water';
import { formatWater } from '../../lib/units';
import type { PlannedReminder } from '../../lib/reminders';
import type { Profile, Program } from '../../lib/types';

jest.mock('../notifications', () => ({
  applyReminderPlan: jest.fn(async () => undefined),
  cancelRestDone: jest.fn(async () => undefined),
}));
const cancelRest = cancelRestDone as jest.Mock;

const apply = applyReminderPlan as jest.Mock;
const NOW = new Date(2026, 9, 9, 10, 0); // Friday
const S = () => useStore.getState();

const profile: Profile = {
  name: 'T', sex: 'female', age: 28, heightCm: 165, weightKg: 60, goalWeightKg: null, bodyFatPct: null, waistCm: null, neckCm: null,
  hipCm: null, activity: 'light', goal: 'maintain', pace: 'slow', experience: 'beginner', trainingGoal: 'general', daysPerWeek: 3,
  equipment: 'home', sessionMinutes: 45,
};
const program: Program = {
  id: 'p', name: 'p', description: '', daysPerWeek: 1, createdAt: 0,
  schedule: [null, null, null, null, null, 'r', null],
  routines: [{ id: 'r', name: 'Full body', focus: '', exercises: [{ exerciseId: 'x', sets: 3, repMin: 8, repMax: 12, restSec: 90 }] }],
};

let appStateHandler: ((s: string) => void) | undefined;
const remove = jest.fn();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  S().resetAll();
  useStore.setState({ hydrated: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, h) => {
    appStateHandler = h as (s: string) => void;
    return { remove } as never;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const lastPlan = (): PlannedReminder[] => apply.mock.calls[apply.mock.calls.length - 1][0];

it('clears all reminders and rest alert when not onboarded (after debounce)', async () => {
  await renderHook(() => useReminderSync());
  await act(async () => { jest.advanceTimersByTime(799); });
  expect(apply).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(apply).toHaveBeenCalledTimes(1);
  expect(apply).toHaveBeenCalledWith([]);
  expect(cancelRest).toHaveBeenCalledTimes(1);
});

it('resetAll after onboarding re-syncs with an empty plan', async () => {
  S().completeOnboarding(profile, program);
  await renderHook(() => useReminderSync());
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(lastPlan().length).toBeGreaterThan(0);
  expect(cancelRest).not.toHaveBeenCalled();
  await act(async () => { S().resetAll(); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(lastPlan()).toEqual([]);
  expect(cancelRest).toHaveBeenCalledTimes(1);
});

const doneWorkout = (startedAt: number, endedAt: number | null) => ({ id: 'w' + startedAt, name: 'x', startedAt, endedAt, exercises: [] });

it('re-plans when workouts change and skips today workout reminder once trained today', async () => {
  S().completeOnboarding(profile, program);
  await renderHook(() => useReminderSync());
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(lastPlan().some((r) => r.id === 'workout-2026-10-09')).toBe(true);
  apply.mockClear();
  await act(async () => { useStore.setState({ workouts: [doneWorkout(new Date(2026, 9, 9, 7).getTime(), new Date(2026, 9, 9, 8).getTime())] }); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(apply).toHaveBeenCalledTimes(1);
  expect(lastPlan().some((r) => r.id === 'workout-2026-10-09')).toBe(false);
});

it('unfinished or yesterday workouts do not count as trained today', async () => {
  S().completeOnboarding(profile, program);
  useStore.setState({
    workouts: [doneWorkout(new Date(2026, 9, 9, 7).getTime(), null), doneWorkout(new Date(2026, 9, 8, 23).getTime(), new Date(2026, 9, 9, 0, 30).getTime())],
  });
  await renderHook(() => useReminderSync());
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(lastPlan().some((r) => r.id === 'workout-2026-10-09')).toBe(true);
});

it('water reminders cover 3 days by default', async () => {
  S().completeOnboarding(profile, program);
  await renderHook(() => useReminderSync());
  await act(async () => { jest.advanceTimersByTime(1000); });
  const days = new Set(lastPlan().filter((r) => r.kind === 'water').map((r) => r.id.slice(6, 16)));
  expect([...days].sort()).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
});

describe('water goal override', () => {
  const goalIn = (p: PlannedReminder[]) => p.find((r) => r.id.startsWith('water-2026-10-10'))!.body;
  const computed = () => waterGoalMl(60, (45 * 3) / 7);
  const fmt = (ml: number) => formatWater(ml, 'kg');

  it.each([[null], [0], [-500]])('override %p falls back to computed goal', async (override) => {
    S().completeOnboarding(profile, program);
    S().updateSettings({ water: { ...S().settings.water, goalOverrideMl: override as number | null } });
    await renderHook(() => useReminderSync());
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(goalIn(lastPlan())).toContain(`for ${fmt(computed())} today`);
    // today's water reminders still present (goal not 0)
    expect(lastPlan().some((r) => r.id.startsWith('water-2026-10-09'))).toBe(true);
  });

  it('positive override is used', async () => {
    S().completeOnboarding(profile, program);
    S().updateSettings({ water: { ...S().settings.water, goalOverrideMl: 3000 } });
    await renderHook(() => useReminderSync());
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(goalIn(lastPlan())).toContain(`for ${fmt(3000)} today`);
  });
});

it('syncs after debounce once onboarded and builds plan from store', async () => {
  S().completeOnboarding(profile, program);
  await renderHook(() => useReminderSync());
  await act(async () => { jest.advanceTimersByTime(799); });
  expect(apply).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(apply).toHaveBeenCalledTimes(1);
  const p = lastPlan();
  expect(p.some((r) => r.kind === 'water')).toBe(true);
  const w = p.find((r) => r.id === 'workout-2026-10-09');
  expect(w).toBeDefined();
  expect(w!.title).toContain('Full body');
  expect(w!.date).toEqual(new Date(2026, 9, 9, 17, 0));
});

it('debounces store changes and ignores unrelated ones', async () => {
  S().completeOnboarding(profile, program);
  await renderHook(() => useReminderSync());
  await act(async () => { jest.advanceTimersByTime(1000); });
  apply.mockClear();
  await act(async () => {
    S().startRest(30, 'x');
  });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(apply).not.toHaveBeenCalled();
  await act(async () => {
    S().addWater(250);
    S().addWater(250);
    S().logWeight(61);
  });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(apply).toHaveBeenCalledTimes(1);
  expect(lastPlan().find((r) => r.kind === 'water' && r.id.startsWith('water-2026-10-09'))!.body).toMatch(/^500 ml of/);
});

it('water reminders disabled removes water entries', async () => {
  S().completeOnboarding(profile, program);
  S().updateSettings({ water: { ...S().settings.water, remindersEnabled: false } });
  await renderHook(() => useReminderSync());
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(lastPlan().some((r) => r.kind === 'water')).toBe(false);
});

it('re-syncs on foreground and cleans up on unmount', async () => {
  S().completeOnboarding(profile, program);
  const r = await renderHook(() => useReminderSync());
  await act(async () => { jest.advanceTimersByTime(1000); });
  apply.mockClear();
  await act(async () => { appStateHandler!('background'); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(apply).not.toHaveBeenCalled();
  await act(async () => { appStateHandler!('active'); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(apply).toHaveBeenCalledTimes(1);

  apply.mockClear();
  await act(async () => { S().addWater(100); });
  await r.unmount();
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(apply).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalled();
  await act(async () => { S().addWater(100); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(apply).not.toHaveBeenCalled();
});
