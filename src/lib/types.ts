/** Shared domain types. All weights in kg, lengths in cm, water in ml, times in epoch ms. */
import type { ActivityLevel, Sex } from './body';
import type { BodyGoal, Experience, Pace } from './nutrition';
import type { StandardLift } from './strength';
import type { WeightUnit } from './units';

export type Muscle =
  | 'chest'
  | 'lats'
  | 'upper_back'
  | 'traps'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs'
  | 'lower_back';

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'ez_bar' | 'smith' | 'cardio_machine';

export type EquipmentAccess = 'gym' | 'home' | 'bodyweight';

export type TrainingGoal = 'strength' | 'hypertrophy' | 'endurance' | 'general';

/** strength: weight × reps · timed: seconds held · cardio: minutes */
export type ExerciseKind = 'strength' | 'timed' | 'cardio';

export interface Exercise {
  id: string;
  name: string;
  primary: Muscle[];
  secondary: Muscle[];
  equipment: Equipment;
  category: 'compound' | 'isolation';
  kind: ExerciseKind;
  lowerBody: boolean;
  /** Maps to strength standards when applicable. */
  standard?: StandardLift;
  /** MET value for calorie estimates. */
  met: number;
  tips: string[];
  custom?: boolean;
}

export type SetType = 'warmup' | 'normal' | 'drop' | 'failure';

export interface SetLog {
  id: string;
  type: SetType;
  weightKg: number | null;
  /** Reps (strength), seconds (timed) or minutes (cardio). */
  reps: number | null;
  rpe?: number | null;
  done: boolean;
  completedAt?: number | null;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  sets: SetLog[];
  repMin: number;
  repMax: number;
  restSec: number;
  notes?: string;
}

export interface Workout {
  id: string;
  name: string;
  routineId?: string | null;
  startedAt: number;
  endedAt?: number | null;
  exercises: WorkoutExercise[];
  notes?: string;
  bodyweightKg?: number | null;
}

export interface RoutineExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
}

export interface Routine {
  id: string;
  name: string;
  focus: string;
  exercises: RoutineExercise[];
}

export interface Program {
  id: string;
  name: string;
  description: string;
  daysPerWeek: number;
  /** 7 entries, index 0 = Sunday. Each is a routine id or null (rest day). */
  schedule: (string | null)[];
  routines: Routine[];
  createdAt: number;
}

export interface Profile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  /** Starting weight; the latest weigh-in supersedes it. */
  weightKg: number;
  goalWeightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  neckCm: number | null;
  hipCm: number | null;
  activity: ActivityLevel;
  goal: BodyGoal;
  pace: Pace;
  experience: Experience;
  trainingGoal: TrainingGoal;
  daysPerWeek: number;
  equipment: EquipmentAccess;
  sessionMinutes: number;
}

export interface WaterEntry {
  id: string;
  at: number;
  ml: number;
}

export interface Settings {
  unit: WeightUnit;
  water: {
    remindersEnabled: boolean;
    startHour: number;
    endHour: number;
    intervalMin: number;
    /** Overrides the computed goal when set. */
    goalOverrideMl: number | null;
  };
  workoutReminder: {
    enabled: boolean;
    hour: number;
    minute: number;
  };
  restTimer: {
    autoStart: boolean;
    notify: boolean;
  };
  haptics: boolean;
}

export interface Measurement {
  date: string;
  waistCm?: number | null;
  neckCm?: number | null;
  hipCm?: number | null;
  chestCm?: number | null;
  armCm?: number | null;
  thighCm?: number | null;
  bodyFatPct?: number | null;
}
