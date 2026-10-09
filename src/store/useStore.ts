import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { dayKey } from '../lib/dates';
import { uid } from '../lib/ids';
import { debouncedStorage } from './storage';
import type { WeighIn } from '../lib/projection';
import type {
  Exercise,
  Measurement,
  Profile,
  Program,
  Routine,
  RoutineExercise,
  SetLog,
  Settings,
  Workout,
  WorkoutExercise,
  WaterEntry,
} from '../lib/types';

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kg',
  water: { remindersEnabled: true, startHour: 8, endHour: 22, intervalMin: 90, goalOverrideMl: null },
  workoutReminder: { enabled: true, hour: 17, minute: 0 },
  restTimer: { autoStart: true, notify: true },
  haptics: true,
};

/** Deep-merges (possibly partial / older) settings over the defaults so new keys always exist. */
export function mergeSettings(s?: Partial<Settings> | null): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(s ?? {}),
    water: { ...DEFAULT_SETTINGS.water, ...(s?.water ?? {}) },
    workoutReminder: { ...DEFAULT_SETTINGS.workoutReminder, ...(s?.workoutReminder ?? {}) },
    restTimer: { ...DEFAULT_SETTINGS.restTimer, ...(s?.restTimer ?? {}) },
  };
}

export interface RestTimer {
  endsAt: number;
  durationSec: number;
  label: string;
}

export interface DataState {
  onboarded: boolean;
  profile: Profile | null;
  settings: Settings;
  program: Program | null;
  workouts: Workout[];
  activeWorkout: Workout | null;
  weighIns: WeighIn[];
  water: Record<string, WaterEntry[]>;
  measurements: Measurement[];
  customExercises: Exercise[];
  restTimer: RestTimer | null;
}

export interface Actions {
  completeOnboarding: (profile: Profile, program: Program) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  setProgram: (program: Program) => void;
  upsertRoutine: (routine: Routine) => void;
  deleteRoutine: (routineId: string) => void;
  setScheduleDay: (weekday: number, routineId: string | null) => void;

  startWorkout: (routineId?: string | null) => void;
  discardWorkout: () => void;
  finishWorkout: () => string | null;
  renameWorkout: (name: string) => void;
  setWorkoutNotes: (notes: string) => void;
  addExercise: (exerciseId: string) => void;
  removeExercise: (workoutExerciseId: string) => void;
  replaceExercise: (workoutExerciseId: string, exerciseId: string) => void;
  moveExercise: (workoutExerciseId: string, direction: -1 | 1) => void;
  addSet: (workoutExerciseId: string, type?: SetLog['type']) => void;
  insertWarmups: (workoutExerciseId: string, sets: { weightKg: number; reps: number }[]) => void;
  updateSet: (workoutExerciseId: string, setId: string, patch: Partial<SetLog>) => void;
  removeSet: (workoutExerciseId: string, setId: string) => void;
  deleteWorkout: (workoutId: string) => void;

  logWeight: (weightKg: number, date?: string) => void;
  deleteWeighIn: (date: string) => void;
  addWater: (ml: number, at?: Date) => void;
  removeWater: (date: string, entryId: string) => void;
  addMeasurement: (m: Measurement) => void;
  addCustomExercise: (e: Omit<Exercise, 'id' | 'custom'>) => string;

  startRest: (seconds: number, label: string) => void;
  adjustRest: (deltaSec: number) => void;
  stopRest: () => void;

  resetAll: () => void;
  importData: (data: Partial<DataState>) => void;
}

export type StoreState = DataState & Actions & { hydrated: boolean };

const initialData: DataState = {
  onboarded: false,
  profile: null,
  settings: DEFAULT_SETTINGS,
  program: null,
  workouts: [],
  activeWorkout: null,
  weighIns: [],
  water: {},
  measurements: [],
  customExercises: [],
  restTimer: null,
};

const newSet = (type: SetLog['type'] = 'normal', from?: Partial<SetLog>): SetLog => ({
  id: uid('s_'),
  type,
  weightKg: from?.weightKg ?? null,
  reps: from?.reps ?? null,
  rpe: null,
  done: false,
  completedAt: null,
});

function exerciseFromRoutine(re: RoutineExercise): WorkoutExercise {
  return {
    id: uid('we_'),
    exerciseId: re.exerciseId,
    repMin: re.repMin,
    repMax: re.repMax,
    restSec: re.restSec,
    sets: Array.from({ length: Math.max(1, re.sets) }, () => newSet()),
  };
}

const DEFAULT_REST = 120;

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      /** Applies fn to the active workout (no-op if none). */
      const editWorkout = (fn: (w: Workout) => Workout) => {
        const w = get().activeWorkout;
        if (w) set({ activeWorkout: fn(w) });
      };
      const editExercise = (weId: string, fn: (e: WorkoutExercise) => WorkoutExercise) =>
        editWorkout((w) => ({ ...w, exercises: w.exercises.map((e) => (e.id === weId ? fn(e) : e)) }));

      return {
        ...initialData,
        hydrated: false,

        completeOnboarding: (profile, program) =>
          set((s) => ({
            onboarded: true,
            profile,
            program,
            weighIns: s.weighIns.length ? s.weighIns : [{ date: dayKey(), weightKg: profile.weightKg }],
          })),

        updateProfile: (patch) => set((s) => (s.profile ? { profile: { ...s.profile, ...patch } } : {})),

        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

        setProgram: (program) => set({ program }),

        upsertRoutine: (routine) =>
          set((s) => {
            if (!s.program) return {};
            const exists = s.program.routines.some((r) => r.id === routine.id);
            const routines = exists ? s.program.routines.map((r) => (r.id === routine.id ? routine : r)) : [...s.program.routines, routine];
            return { program: { ...s.program, routines } };
          }),

        deleteRoutine: (routineId) =>
          set((s) => {
            if (!s.program) return {};
            return {
              program: {
                ...s.program,
                routines: s.program.routines.filter((r) => r.id !== routineId),
                schedule: s.program.schedule.map((id) => (id === routineId ? null : id)),
              },
            };
          }),

        setScheduleDay: (weekday, routineId) =>
          set((s) => {
            if (!s.program || weekday < 0 || weekday > 6) return {};
            const schedule = [...s.program.schedule];
            schedule[weekday] = routineId;
            return { program: { ...s.program, schedule, daysPerWeek: schedule.filter(Boolean).length } };
          }),

        startWorkout: (routineId) => {
          if (get().activeWorkout) return;
          const routine = routineId ? get().program?.routines.find((r) => r.id === routineId) : undefined;
          const workout: Workout = {
            id: uid('w_'),
            name: routine?.name ?? 'Quick workout',
            routineId: routine?.id ?? null,
            startedAt: Date.now(),
            endedAt: null,
            exercises: routine ? routine.exercises.map(exerciseFromRoutine) : [],
          };
          set({ activeWorkout: workout });
        },

        discardWorkout: () => set({ activeWorkout: null, restTimer: null }),

        finishWorkout: () => {
          const w = get().activeWorkout;
          if (!w) return null;
          const exercises = w.exercises
            .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done && s.reps != null && s.reps > 0) }))
            .filter((e) => e.sets.length > 0);
          if (exercises.length === 0) {
            set({ activeWorkout: null, restTimer: null });
            return null;
          }
          const latest = [...get().weighIns].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
          const finished: Workout = {
            ...w,
            exercises,
            endedAt: Date.now(),
            bodyweightKg: latest?.weightKg ?? get().profile?.weightKg ?? null,
          };
          set((s) => ({ workouts: [...s.workouts, finished], activeWorkout: null, restTimer: null }));
          return finished.id;
        },

        renameWorkout: (name) => editWorkout((w) => ({ ...w, name: name.trim() || w.name })),
        setWorkoutNotes: (notes) => editWorkout((w) => ({ ...w, notes })),

        addExercise: (exerciseId) =>
          editWorkout((w) => ({
            ...w,
            exercises: [
              ...w.exercises,
              { id: uid('we_'), exerciseId, repMin: 8, repMax: 12, restSec: DEFAULT_REST, sets: [newSet(), newSet(), newSet()] },
            ],
          })),

        removeExercise: (weId) => editWorkout((w) => ({ ...w, exercises: w.exercises.filter((e) => e.id !== weId) })),

        replaceExercise: (weId, exerciseId) =>
          editWorkout((w) => {
            const i = w.exercises.findIndex((e) => e.id === weId);
            if (i < 0) return w;
            const e = w.exercises[i];
            const fresh = (n: number) => Array.from({ length: Math.max(1, n) }, () => newSet());
            if (!e.sets.some((s) => s.done)) {
              // Nothing logged yet: swap in place with clean sets.
              const exercises = [...w.exercises];
              exercises[i] = { ...e, exerciseId, sets: fresh(e.sets.filter((s) => s.type !== 'warmup').length) };
              return { ...w, exercises };
            }
            // Keep the completed sets on the original exercise; move the remaining sets to the new one.
            const remaining = e.sets.filter((s) => !s.done && s.type !== 'warmup').length;
            const kept = { ...e, sets: e.sets.filter((s) => s.done) };
            const added: WorkoutExercise = { ...e, id: uid('we_'), exerciseId, sets: fresh(remaining || 3) };
            const exercises = [...w.exercises];
            exercises.splice(i, 1, kept, added);
            return { ...w, exercises };
          }),

        moveExercise: (weId, direction) =>
          editWorkout((w) => {
            const i = w.exercises.findIndex((e) => e.id === weId);
            const j = i + direction;
            if (i < 0 || j < 0 || j >= w.exercises.length) return w;
            const exercises = [...w.exercises];
            [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
            return { ...w, exercises };
          }),

        addSet: (weId, type = 'normal') =>
          editExercise(weId, (e) => {
            const last = [...e.sets].reverse().find((s) => s.type !== 'warmup');
            return { ...e, sets: [...e.sets, newSet(type, last ? { weightKg: last.weightKg, reps: last.reps } : undefined)] };
          }),

        insertWarmups: (weId, warmups) =>
          editExercise(weId, (e) => ({
            ...e,
            sets: [
              ...warmups.map((w) => newSet('warmup', { weightKg: w.weightKg, reps: w.reps })),
              ...e.sets.filter((s) => s.type !== 'warmup' || s.done),
            ],
          })),

        updateSet: (weId, setId, patch) =>
          editExercise(weId, (e) => ({
            ...e,
            sets: e.sets.map((s) => {
              if (s.id !== setId) return s;
              const next = { ...s, ...patch };
              if (patch.done === true && !s.done) next.completedAt = Date.now();
              if (patch.done === false) next.completedAt = null;
              return next;
            }),
          })),

        removeSet: (weId, setId) => editExercise(weId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) })),

        deleteWorkout: (workoutId) => set((s) => ({ workouts: s.workouts.filter((w) => w.id !== workoutId) })),

        logWeight: (weightKg, date = dayKey()) => {
          if (!(weightKg > 0) || weightKg > 500) return;
          set((s) => ({
            weighIns: [...s.weighIns.filter((w) => w.date !== date), { date, weightKg }].sort((a, b) => (a.date < b.date ? -1 : 1)),
          }));
        },

        deleteWeighIn: (date) => set((s) => ({ weighIns: s.weighIns.filter((w) => w.date !== date) })),

        addWater: (ml, at = new Date()) => {
          if (!(ml > 0) || ml > 5000) return;
          const key = dayKey(at);
          set((s) => ({ water: { ...s.water, [key]: [...(s.water[key] ?? []), { id: uid('h_'), at: at.getTime(), ml }] } }));
        },

        removeWater: (date, entryId) =>
          set((s) => ({ water: { ...s.water, [date]: (s.water[date] ?? []).filter((e) => e.id !== entryId) } })),

        addMeasurement: (m) =>
          set((s) => {
            const measurements = [...s.measurements.filter((x) => x.date !== m.date), m].sort((a, b) => (a.date < b.date ? -1 : 1));
            const latest = measurements[measurements.length - 1];
            const profile = s.profile
              ? {
                  ...s.profile,
                  waistCm: latest.waistCm ?? s.profile.waistCm,
                  neckCm: latest.neckCm ?? s.profile.neckCm,
                  hipCm: latest.hipCm ?? s.profile.hipCm,
                  bodyFatPct: latest.bodyFatPct ?? s.profile.bodyFatPct,
                }
              : s.profile;
            return { measurements, profile };
          }),

        addCustomExercise: (e) => {
          const id = uid('custom_');
          set((s) => ({ customExercises: [...s.customExercises, { ...e, id, custom: true }] }));
          return id;
        },

        startRest: (seconds, label) => {
          if (!(seconds > 0)) return;
          set({ restTimer: { endsAt: Date.now() + seconds * 1000, durationSec: seconds, label } });
        },

        adjustRest: (deltaSec) =>
          set((s) => {
            if (!s.restTimer) return {};
            const endsAt = s.restTimer.endsAt + deltaSec * 1000;
            if (endsAt <= Date.now()) return { restTimer: null };
            return { restTimer: { ...s.restTimer, endsAt, durationSec: Math.max(1, s.restTimer.durationSec + deltaSec) } };
          }),

        stopRest: () => set({ restTimer: null }),

        resetAll: () => set({ ...initialData }),

        importData: (data) => set({ ...initialData, ...data, settings: mergeSettings(data.settings), restTimer: null }),
      };
    },
    {
      name: 'gym-tracker-v1',
      version: 1,
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (s): DataState => ({
        onboarded: s.onboarded,
        profile: s.profile,
        settings: s.settings,
        program: s.program,
        workouts: s.workouts,
        activeWorkout: s.activeWorkout,
        weighIns: s.weighIns,
        water: s.water,
        measurements: s.measurements,
        customExercises: s.customExercises,
        restTimer: s.restTimer,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DataState>;
        return { ...current, ...p, settings: mergeSettings(p.settings) };
      },
      onRehydrateStorage: () => () => {
        useStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Snapshot of persisted data (for export). */
export function exportData(): DataState {
  const s = useStore.getState();
  return {
    onboarded: s.onboarded,
    profile: s.profile,
    settings: s.settings,
    program: s.program,
    workouts: s.workouts,
    activeWorkout: s.activeWorkout,
    weighIns: s.weighIns,
    water: s.water,
    measurements: s.measurements,
    customExercises: s.customExercises,
    restTimer: null,
  };
}
