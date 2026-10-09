import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createDebouncedStorage } from '../storage';

const setItem = AsyncStorage.setItem as jest.Mock;

let appStateHandler: (s: string) => void;

function make(delay = 400) {
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_t, h) => {
    appStateHandler = h as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
  const storage = createDebouncedStorage(delay);
  spy.mockRestore();
  return storage;
}

/** Lets pending promise callbacks run. */
const flushPromises = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(() => jest.useRealTimers());

it('registers an AppState change listener', () => {
  const spy = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  createDebouncedStorage(100);
  expect(spy).toHaveBeenCalledWith('change', expect.any(Function));
  spy.mockRestore();
});

it('buffers writes and flushes once after delayMs with the latest value per key', async () => {
  const s = make(400);
  s.setItem('a', '1');
  jest.advanceTimersByTime(200);
  s.setItem('a', '2');
  s.setItem('b', 'x');
  expect(setItem).not.toHaveBeenCalled();
  jest.advanceTimersByTime(199);
  expect(setItem).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  await flushPromises();
  expect(setItem).toHaveBeenCalledTimes(2);
  expect(setItem).toHaveBeenCalledWith('a', '2');
  expect(setItem).toHaveBeenCalledWith('b', 'x');
  expect(await AsyncStorage.getItem('a')).toBe('2');

  // a later write starts a new window
  s.setItem('a', '3');
  jest.advanceTimersByTime(400);
  await flushPromises();
  expect(setItem).toHaveBeenCalledTimes(3);
  expect(await AsyncStorage.getItem('a')).toBe('3');
});

it('getItem returns a pending value before flush, else falls back to AsyncStorage', async () => {
  await AsyncStorage.setItem('k', 'stored');
  setItem.mockClear();
  const s = make();
  expect(await s.getItem('k')).toBe('stored');
  s.setItem('k', 'pending');
  expect(await s.getItem('k')).toBe('pending');
  expect(await AsyncStorage.getItem('k')).toBe('stored');
  expect(await s.getItem('missing')).toBeNull();
});

it('removeItem drops the pending value and removes from AsyncStorage', async () => {
  await AsyncStorage.setItem('k', 'old');
  setItem.mockClear();
  const s = make();
  s.setItem('k', 'new');
  await s.removeItem('k');
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('k');
  expect(await s.getItem('k')).toBeNull();
  jest.advanceTimersByTime(1000);
  await flushPromises();
  expect(setItem).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem('k')).toBeNull();
});

it('flush() writes immediately and cancels the pending timer', async () => {
  const s = make(400);
  s.setItem('a', '1');
  await s.flush();
  expect(setItem).toHaveBeenCalledTimes(1);
  expect(await AsyncStorage.getItem('a')).toBe('1');
  jest.advanceTimersByTime(1000);
  await flushPromises();
  expect(setItem).toHaveBeenCalledTimes(1);
  await s.flush(); // nothing pending
  expect(setItem).toHaveBeenCalledTimes(1);
});

it('flushes when the app leaves the foreground, not on active', async () => {
  const s = make(10_000);
  s.setItem('a', '1');
  appStateHandler('active');
  await flushPromises();
  expect(setItem).not.toHaveBeenCalled();
  appStateHandler('background');
  await flushPromises();
  expect(setItem).toHaveBeenCalledWith('a', '1');

  s.setItem('b', '2');
  appStateHandler('inactive');
  await flushPromises();
  expect(setItem).toHaveBeenCalledWith('b', '2');
});

it('swallows write errors on timed/AppState flush', async () => {
  const s = make(100);
  setItem.mockRejectedValueOnce(new Error('disk full'));
  s.setItem('a', '1');
  jest.advanceTimersByTime(100);
  await flushPromises();
  expect(setItem).toHaveBeenCalledTimes(1);
});
