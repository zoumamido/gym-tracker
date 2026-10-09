import { useStore } from '../../store/useStore';
import { adjustRest, beginRest, endRest } from '../rest';
import { cancelRestDone, scheduleRestDone } from '../notifications';

jest.mock('../notifications', () => ({
  scheduleRestDone: jest.fn(async () => undefined),
  cancelRestDone: jest.fn(async () => undefined),
}));

const NOW = new Date(2026, 9, 9, 10, 0);
const S = () => useStore.getState();
const sched = scheduleRestDone as jest.Mock;
const cancel = cancelRestDone as jest.Mock;

const setNotify = (notify: boolean) => S().updateSettings({ restTimer: { ...S().settings.restTimer, notify } });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  S().resetAll();
  useStore.setState({ hydrated: true });
});

afterEach(() => jest.useRealTimers());

describe('beginRest', () => {
  it('starts store timer and schedules notification when notify on', () => {
    beginRest(90, 'Bench');
    expect(S().restTimer).toEqual({ endsAt: NOW.getTime() + 90_000, durationSec: 90, label: 'Bench' });
    expect(sched).toHaveBeenCalledWith(90, 'Bench');
  });

  it('does not schedule when notify off', () => {
    setNotify(false);
    beginRest(60, 'x');
    expect(S().restTimer).not.toBeNull();
    expect(sched).not.toHaveBeenCalled();
  });

  it('ignores non-positive seconds', () => {
    beginRest(0, 'x');
    beginRest(-1, 'x');
    expect(S().restTimer).toBeNull();
    expect(sched).not.toHaveBeenCalled();
  });
});

describe('adjustRest', () => {
  it('reschedules with remaining seconds', () => {
    beginRest(60, 'Row');
    sched.mockClear();
    jest.setSystemTime(NOW.getTime() + 20_000);
    adjustRest(15);
    expect(S().restTimer!.endsAt).toBe(NOW.getTime() + 75_000);
    expect(sched).toHaveBeenCalledWith(55, 'Row');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('cancels notification when adjustment ends the timer', () => {
    beginRest(30, 'Row');
    adjustRest(-30);
    expect(S().restTimer).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(sched).toHaveBeenCalledTimes(1); // only from beginRest
  });

  it('cancels (never schedules) when notify off', () => {
    setNotify(false);
    beginRest(60, 'Row');
    adjustRest(30);
    expect(S().restTimer).not.toBeNull();
    expect(sched).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it('without a running timer just cancels', () => {
    adjustRest(30);
    expect(S().restTimer).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('endRest', () => {
  it('stops timer and cancels notification', () => {
    beginRest(60, 'x');
    endRest();
    expect(S().restTimer).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
