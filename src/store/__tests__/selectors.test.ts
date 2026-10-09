import { act, renderHook } from '@testing-library/react-native';
import { useStore } from '../useStore';
import {
  useAllExercises,
  useCoachReport,
  useCurrentWeight,
  useExercise,
  useTodayRoutine,
  useWaterGoal,
  useWaterToday,
} from '../selectors';
import { waterGoalMl } from '../../lib/water';
import type { Profile, Program } from '../../lib/types';

const NOW = new Date(2026, 9, 9, 10, 0); // Friday
const TODAY = '2026-10-09';

const profile: Profile = {
  name: 'Test',
  sex: 'male',
  age: 30,
  heightCm: 180,
  weightKg: 80,
  goalWeightKg: 75,
  bodyFatPct: null,
  waistCm: 85,
  neckCm: 38,
  hipCm: null,
  activity: 'moderate',
  goal: 'lose',
  pace: 'moderate',
  experience: 'intermediate',
  trainingGoal: 'hypertrophy',
  daysPerWeek: 3,
  equipment: 'gym',
  sessionMinutes: 70,
};

const program: Program = {
  id: 'p1',
  name: 'P',
  description: '',
  daysPerWeek: 2,
  schedule: [null, 'rA', null, null, null, 'rB', null],
  routines: [
    { id: 'rA', name: 'A', focus: '', exercises: [] },
    { id: 'rB', name: 'B', focus: '', exercises: [] },
  ],
  createdAt: 0,
};

const S = () => useStore.getState();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  S().resetAll();
  useStore.setState({ hydrated: true });
});

afterEach(() => {
  jest.useRealTimers();
});

/** Renders a hook while counting renders, to detect getSnapshot loops. */
async function renderCounted<T>(hook: () => T) {
  let renders = 0;
  const r = await renderHook(() => {
    renders++;
    return hook();
  });
  return { ...r, renders: () => renders };
}

describe('useCurrentWeight', () => {
  it('null with no data, profile weight as fallback, latest weigh-in otherwise', async () => {
    const r = await renderCounted(useCurrentWeight);
    expect(r.result.current).toBeNull();
    await act(async () => useStore.setState({ profile }));
    expect(r.result.current).toBe(80);
    await act(async () => {
      useStore.setState({
        weighIns: [
          { date: '2026-10-05', weightKg: 78 },
          { date: '2026-10-01', weightKg: 82 },
        ],
      });
    });
    expect(r.result.current).toBe(78);
    expect(r.renders()).toBeLessThan(10);
  });
});

describe('useWaterGoal', () => {
  it('defaults to 2500 without profile', async () => {
    const r = await renderCounted(useWaterGoal);
    expect(r.result.current).toBe(2500);
  });

  it('computes from weight and training load', async () => {
    useStore.setState({ profile });
    S().logWeight(90);
    const r = await renderCounted(useWaterGoal);
    expect(r.result.current).toBe(waterGoalMl(90, (70 * 3) / 7));
    expect(r.renders()).toBeLessThan(5);
  });

  it('override wins when positive; 0 falls back to computed', async () => {
    useStore.setState({ profile });
    S().updateSettings({ water: { ...S().settings.water, goalOverrideMl: 3333 } });
    const r = await renderCounted(useWaterGoal);
    expect(r.result.current).toBe(3333);
    await act(async () => S().updateSettings({ water: { ...S().settings.water, goalOverrideMl: 0 } }));
    expect(r.result.current).toBe(waterGoalMl(80, 30));
  });
});

describe('useWaterToday', () => {
  it('sums today entries and updates', async () => {
    const r = await renderCounted(() => useWaterToday());
    expect(r.result.current).toBe(0);
    await act(async () => {
      S().addWater(250);
      S().addWater(500);
      S().addWater(999, new Date(2026, 9, 8, 12));
    });
    expect(r.result.current).toBe(750);
    expect(r.renders()).toBeLessThan(10);
  });

  it('accepts an explicit date', async () => {
    S().addWater(300, new Date(2026, 9, 8, 12));
    const r = await renderHook(() => useWaterToday(new Date(2026, 9, 8, 20)));
    expect(r.result.current).toBe(300);
    expect(S().water[TODAY]).toBeUndefined();
  });
});

describe('useTodayRoutine', () => {
  it('null without program or on rest day; routine on scheduled day', async () => {
    let r = await renderHook(() => useTodayRoutine());
    expect(r.result.current).toBeNull();
    await act(async () => useStore.setState({ program }));
    r = await renderHook(() => useTodayRoutine()); // Friday = 5
    expect(r.result.current?.id).toBe('rB');
    r = await renderHook(() => useTodayRoutine(new Date(2026, 9, 10))); // Saturday
    expect(r.result.current).toBeNull();
  });

  it('null when scheduled id has no routine', async () => {
    useStore.setState({ program: { ...program, schedule: [null, null, null, null, null, 'ghost', null] } });
    const r = await renderHook(() => useTodayRoutine());
    expect(r.result.current).toBeNull();
  });
});

describe('useCoachReport', () => {
  it('returns null without profile', async () => {
    const r = await renderCounted(useCoachReport);
    expect(r.result.current).toBeNull();
  });

  it('returns a report with profile', async () => {
    S().completeOnboarding(profile, program);
    const r = await renderCounted(useCoachReport);
    expect(r.result.current).not.toBeNull();
    expect(r.result.current!.weightKg).toBe(80);
    expect(r.renders()).toBeLessThan(5);
  });
});

describe('exercise lookup', () => {
  it('useExercise falls back to unknown and sees custom exercises', async () => {
    const r = await renderHook(() => useExercise('nope'));
    expect(r.result.current).toMatchObject({ id: 'nope', name: 'Unknown exercise' });
    let id = "";
    await act(async () => { id = S().addCustomExercise({
      name: 'AAA custom', primary: [], secondary: [], equipment: 'band', category: 'isolation', kind: 'strength', lowerBody: false, met: 3, tips: [],
    }); });
    const r2 = await renderHook(() => useExercise(id));
    expect(r2.result.current.name).toBe('AAA custom');
    const r3 = await renderHook(() => useAllExercises());
    expect(r3.result.current.some((e) => e.id === id)).toBe(true);
  });
});

describe('render stability (no getSnapshot loops)', () => {
  it('all selector hooks render a bounded number of times and do not re-render on unrelated changes', async () => {
    S().completeOnboarding(profile, program);
    S().addWater(250);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const r = await renderCounted(() => ({
      w: useCurrentWeight(),
      g: useWaterGoal(),
      t: useWaterToday(),
      r: useTodayRoutine(),
      c: useCoachReport(),
      a: useAllExercises(),
    }));
    const initial = r.renders();
    expect(initial).toBeLessThanOrEqual(2);
    // An unrelated state change must not re-render (selected slices are stable references).
    await act(async () => useStore.setState({ restTimer: { endsAt: 1, durationSec: 1, label: 'x' } }));
    expect(r.renders()).toBe(initial);
    expect(errors.mock.calls.some((c) => String(c[0]).includes('getSnapshot'))).toBe(false);
    errors.mockRestore();
  });
});
