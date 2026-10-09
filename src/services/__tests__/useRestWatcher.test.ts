import { act, renderHook } from '@testing-library/react-native';
import { Vibration } from 'react-native';
import { useStore } from '../../store/useStore';
import { useRestWatcher } from '../useRestWatcher';
import { cancelRestDone } from '../notifications';

jest.mock('../notifications', () => ({
  scheduleRestDone: jest.fn(async () => undefined),
  cancelRestDone: jest.fn(async () => undefined),
}));

const NOW = new Date(2026, 9, 9, 10, 0).getTime();
const S = () => useStore.getState();
const cancel = cancelRestDone as jest.Mock;
let vibrate: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  S().resetAll();
  useStore.setState({ hydrated: true });
  vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
});

afterEach(() => {
  vibrate.mockRestore();
  jest.useRealTimers();
});

const setTimer = (endsAt: number) => useStore.setState({ restTimer: { endsAt, durationSec: 60, label: 'x' } });

it('does nothing without a timer', async () => {
  await renderHook(() => useRestWatcher());
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(vibrate).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});

it('vibrates and ends rest when endsAt passes', async () => {
  setTimer(NOW + 60_000);
  await renderHook(() => useRestWatcher());
  await act(async () => { jest.advanceTimersByTime(59_999); });
  expect(vibrate).not.toHaveBeenCalled();
  expect(S().restTimer).not.toBeNull();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(vibrate).toHaveBeenCalledTimes(1);
  expect(vibrate).toHaveBeenCalledWith([0, 300, 150, 300]);
  expect(S().restTimer).toBeNull();
  expect(cancel).toHaveBeenCalledTimes(1);
});

it('does not vibrate when haptics disabled but still ends rest', async () => {
  S().updateSettings({ haptics: false });
  setTimer(NOW + 1000);
  await renderHook(() => useRestWatcher());
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(vibrate).not.toHaveBeenCalled();
  expect(S().restTimer).toBeNull();
  expect(cancel).toHaveBeenCalledTimes(1);
});

it('reschedules when the timer is adjusted', async () => {
  setTimer(NOW + 10_000);
  await renderHook(() => useRestWatcher());
  await act(async () => { S().adjustRest(20); });
  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect(vibrate).not.toHaveBeenCalled();
  expect(S().restTimer).not.toBeNull();
  await act(async () => { jest.advanceTimersByTime(20_000); });
  expect(vibrate).toHaveBeenCalledTimes(1);
  expect(S().restTimer).toBeNull();
});

it('stopping the timer cancels the pending fire', async () => {
  setTimer(NOW + 5000);
  await renderHook(() => useRestWatcher());
  await act(async () => { S().stopRest(); });
  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect(vibrate).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});

it('fires immediately if expired within the last 5 s at mount', async () => {
  setTimer(NOW - 3000);
  await renderHook(() => useRestWatcher());
  expect(vibrate).toHaveBeenCalledTimes(1);
  expect(S().restTimer).toBeNull();
});

it('clears silently if expired more than 5 s ago at mount', async () => {
  setTimer(NOW - 6000);
  await renderHook(() => useRestWatcher());
  expect(vibrate).not.toHaveBeenCalled();
  expect(S().restTimer).toBeNull();
  expect(cancel).toHaveBeenCalledTimes(1);
});

it('unmount clears the pending timeout', async () => {
  setTimer(NOW + 5000);
  const r = await renderHook(() => useRestWatcher());
  await r.unmount();
  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect(vibrate).not.toHaveBeenCalled();
  expect(S().restTimer).not.toBeNull();
});
