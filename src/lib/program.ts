/**
 * Training-program generator. Picks a split from days/week, fills each day with
 * exercises available for the user's equipment, and assigns sets/reps/rest by goal.
 * See docs/gym-science.md sections 10 and 12.
 */
import { ACCESS_EQUIPMENT, EXERCISE_MAP } from '../data/exercises';
import { uid } from './ids';
import type { Experience } from './nutrition';
import type { EquipmentAccess, Program, Routine, RoutineExercise, TrainingGoal } from './types';

type Role = 'main' | 'secondary' | 'accessory';

interface Slot {
  role: Role;
  /** Exercise ids in order of preference; the first one the user has equipment for wins. */
  options: string[];
}

interface DayTemplate {
  name: string;
  focus: string;
  slots: Slot[];
}

const S = (role: Role, ...options: string[]): Slot => ({ role, options });

const SQUAT = ['squat', 'goblet_squat', 'bodyweight_squat'];
const HINGE = ['rdl', 'db_rdl', 'kb_swing', 'glute_bridge'];
const H_PUSH = ['bench_press', 'db_bench_press', 'push_up'];
const INCLINE = ['incline_db_press', 'incline_bench_press', 'push_up'];
const V_PUSH = ['ohp', 'db_shoulder_press', 'pike_push_up'];
const H_PULL = ['barbell_row', 'db_row', 'inverted_row'];
const V_PULL = ['lat_pulldown', 'pull_up', 'inverted_row'];
const CABLE_ROW = ['seated_cable_row', 'chest_supported_row', 'db_row', 'inverted_row'];
const SINGLE_LEG = ['bulgarian_split_squat', 'lunge', 'step_up', 'bodyweight_squat'];
const KNEE_DOM = ['leg_press', 'hack_squat', 'goblet_squat', 'bulgarian_split_squat'];
const HAM_CURL = ['leg_curl', 'db_rdl', 'glute_bridge'];
const QUAD_ISO = ['leg_extension', 'step_up', 'bodyweight_squat'];
const CALVES = ['calf_raise', 'single_leg_calf_raise'];
const SIDE_DELT = ['lateral_raise', 'cable_lateral_raise', 'pike_push_up'];
const REAR_DELT = ['face_pull', 'reverse_pec_deck', 'reverse_fly', 'pike_push_up'];
const BICEPS = ['barbell_curl', 'db_curl', 'hammer_curl', 'chin_up'];
const BICEPS_2 = ['incline_db_curl', 'hammer_curl', 'cable_curl', 'db_curl', 'chin_up'];
const TRICEPS = ['triceps_pushdown', 'db_overhead_extension', 'bench_dip'];
const TRICEPS_2 = ['overhead_triceps_extension', 'skull_crusher', 'db_overhead_extension', 'bench_dip'];
const CORE = ['hanging_leg_raise', 'cable_crunch', 'ab_wheel', 'crunch'];
const PLANK = ['plank', 'dead_bug'];
const GLUTE = ['hip_thrust', 'glute_bridge'];
const CHEST_2 = ['dip', 'machine_chest_press', 'db_bench_press', 'push_up'];

const FULL_A: DayTemplate = {
  name: 'Full Body A',
  focus: 'Squat · Bench · Row',
  slots: [S('main', ...SQUAT), S('main', ...H_PUSH), S('secondary', ...H_PULL), S('secondary', ...HINGE), S('accessory', ...SIDE_DELT), S('accessory', ...CALVES), S('accessory', ...PLANK)],
};
const FULL_B: DayTemplate = {
  name: 'Full Body B',
  focus: 'Deadlift · Press · Pull-down',
  slots: [
    S('main', 'deadlift', 'db_rdl', 'kb_swing', 'glute_bridge'),
    S('main', ...V_PUSH),
    S('secondary', ...V_PULL),
    S('secondary', ...CHEST_2),
    S('secondary', ...SINGLE_LEG),
    S('accessory', ...BICEPS),
    S('accessory', ...TRICEPS),
  ],
};
const FULL_C: DayTemplate = {
  name: 'Full Body C',
  focus: 'Legs · Incline · Rows',
  slots: [
    S('main', 'front_squat', 'leg_press', 'goblet_squat', 'bulgarian_split_squat'),
    S('secondary', ...INCLINE),
    S('secondary', ...CABLE_ROW),
    S('secondary', ...GLUTE),
    S('accessory', ...SIDE_DELT),
    S('accessory', ...REAR_DELT),
    S('accessory', ...CALVES),
    S('accessory', ...CORE),
  ],
};

const UPPER_A: DayTemplate = {
  name: 'Upper A',
  focus: 'Strength focus',
  slots: [S('main', ...H_PUSH), S('main', ...H_PULL), S('secondary', ...V_PUSH), S('secondary', ...V_PULL), S('accessory', ...TRICEPS), S('accessory', ...BICEPS)],
};
const LOWER_A: DayTemplate = {
  name: 'Lower A',
  focus: 'Squat focus',
  slots: [S('main', ...SQUAT), S('secondary', ...HINGE), S('accessory', ...HAM_CURL), S('accessory', ...CALVES), S('accessory', ...CORE)],
};
const UPPER_B: DayTemplate = {
  name: 'Upper B',
  focus: 'Hypertrophy focus',
  slots: [
    S('secondary', ...INCLINE),
    S('secondary', ...V_PULL),
    S('secondary', ...CABLE_ROW),
    S('accessory', ...SIDE_DELT),
    S('accessory', ...BICEPS_2),
    S('accessory', ...TRICEPS_2),
  ],
};
const LOWER_B: DayTemplate = {
  name: 'Lower B',
  focus: 'Deadlift focus',
  slots: [
    S('main', 'deadlift', 'db_rdl', 'kb_swing', 'glute_bridge'),
    S('secondary', ...SINGLE_LEG),
    S('accessory', ...QUAD_ISO),
    S('accessory', ...HAM_CURL),
    S('accessory', 'seated_calf_raise', ...CALVES),
    S('accessory', ...PLANK),
  ],
};

const PUSH_A: DayTemplate = {
  name: 'Push',
  focus: 'Chest · Shoulders · Triceps',
  slots: [S('main', ...H_PUSH), S('secondary', ...V_PUSH), S('secondary', ...INCLINE), S('accessory', ...SIDE_DELT), S('accessory', ...TRICEPS), S('accessory', ...TRICEPS_2)],
};
const PULL_A: DayTemplate = {
  name: 'Pull',
  focus: 'Back · Rear delts · Biceps',
  slots: [S('main', ...H_PULL), S('secondary', ...V_PULL), S('secondary', ...CABLE_ROW), S('accessory', ...REAR_DELT), S('accessory', ...BICEPS), S('accessory', 'hammer_curl', ...BICEPS_2)],
};
const LEGS_A: DayTemplate = {
  name: 'Legs',
  focus: 'Quads · Hamstrings · Calves',
  slots: [S('main', ...SQUAT), S('secondary', ...HINGE), S('secondary', ...KNEE_DOM), S('accessory', ...HAM_CURL), S('accessory', ...QUAD_ISO), S('accessory', ...CALVES)],
};
const PUSH_B: DayTemplate = {
  name: 'Push B',
  focus: 'Shoulders · Upper chest',
  slots: [
    S('main', ...V_PUSH),
    S('secondary', 'incline_bench_press', ...INCLINE),
    S('secondary', 'dip', 'machine_chest_press', 'db_bench_press', 'push_up'),
    S('accessory', 'cable_fly', 'pec_deck', 'db_fly'),
    S('accessory', ...SIDE_DELT),
    S('accessory', ...TRICEPS_2),
  ],
};
const PULL_B: DayTemplate = {
  name: 'Pull B',
  focus: 'Lats · Traps · Arms',
  slots: [
    S('main', 'pull_up', 'lat_pulldown', 'inverted_row'),
    S('secondary', 't_bar_row', 'chest_supported_row', 'db_row', 'inverted_row'),
    S('accessory', 'straight_arm_pulldown', 'db_row'),
    S('accessory', 'shrug', 'db_shrug'),
    S('accessory', ...REAR_DELT),
    S('accessory', ...BICEPS_2),
  ],
};
const LEGS_B: DayTemplate = {
  name: 'Legs B',
  focus: 'Posterior chain',
  slots: [
    S('main', 'deadlift', 'db_rdl', 'kb_swing', 'glute_bridge'),
    S('secondary', 'front_squat', 'hack_squat', 'leg_press', 'goblet_squat'),
    S('secondary', ...GLUTE),
    S('accessory', ...SINGLE_LEG),
    S('accessory', 'seated_calf_raise', ...CALVES),
    S('accessory', ...CORE),
  ],
};

interface Split {
  name: string;
  description: string;
  days: DayTemplate[];
  /** Weekday indices (0 = Sunday) for each training day, in order. */
  weekdays: number[];
}

export function splitFor(daysPerWeek: number): Split {
  const d = Number.isFinite(daysPerWeek) ? Math.min(6, Math.max(2, Math.round(daysPerWeek))) : 3;
  switch (d) {
    case 2:
      return {
        name: 'Full Body ×2',
        description: 'Two full-body sessions — every muscle trained twice a week.',
        days: [FULL_A, FULL_B],
        weekdays: [1, 4],
      };
    case 3:
      return {
        name: 'Full Body ×3',
        description: 'Three full-body sessions — the best starting point for most lifters.',
        days: [FULL_A, FULL_B, FULL_C],
        weekdays: [1, 3, 5],
      };
    case 4:
      return {
        name: 'Upper / Lower',
        description: 'Four days alternating upper and lower body — each muscle 2× per week.',
        days: [UPPER_A, LOWER_A, UPPER_B, LOWER_B],
        weekdays: [1, 2, 4, 5],
      };
    case 5:
      return {
        name: 'Upper / Lower + PPL',
        description: 'Upper, Lower, then Push, Pull, Legs — high frequency and volume.',
        days: [UPPER_A, LOWER_A, PUSH_A, PULL_A, LEGS_A],
        weekdays: [1, 2, 3, 5, 6],
      };
    default:
      return {
        name: 'Push / Pull / Legs ×2',
        description: 'Six days, each muscle twice a week — for experienced lifters with good recovery.',
        days: [PUSH_A, PULL_A, LEGS_A, PUSH_B, PULL_B, LEGS_B],
        weekdays: [1, 2, 3, 4, 5, 6],
      };
  }
}

interface Scheme {
  sets: number;
  repMin: number;
  repMax: number;
  restSec: number;
}

const SCHEMES: Record<TrainingGoal, Record<Role, Scheme>> = {
  strength: {
    main: { sets: 4, repMin: 3, repMax: 5, restSec: 180 },
    secondary: { sets: 3, repMin: 6, repMax: 8, restSec: 150 },
    accessory: { sets: 3, repMin: 8, repMax: 12, restSec: 90 },
  },
  hypertrophy: {
    main: { sets: 3, repMin: 6, repMax: 10, restSec: 150 },
    secondary: { sets: 3, repMin: 8, repMax: 12, restSec: 120 },
    accessory: { sets: 3, repMin: 10, repMax: 15, restSec: 75 },
  },
  endurance: {
    main: { sets: 3, repMin: 12, repMax: 15, restSec: 75 },
    secondary: { sets: 3, repMin: 12, repMax: 15, restSec: 60 },
    accessory: { sets: 2, repMin: 15, repMax: 20, restSec: 45 },
  },
  general: {
    main: { sets: 3, repMin: 5, repMax: 8, restSec: 150 },
    secondary: { sets: 3, repMin: 8, repMax: 12, restSec: 90 },
    accessory: { sets: 3, repMin: 10, repMax: 15, restSec: 60 },
  },
};

/** Sets/reps/rest for an exercise given its role, goal and experience. */
export function schemeFor(role: Role, goal: TrainingGoal, experience: Experience, exerciseId: string): Scheme {
  const base = { ...SCHEMES[goal][role] };
  if (experience === 'beginner' && role === 'main' && goal === 'strength') base.sets = 3;
  if (experience === 'advanced' && role !== 'accessory') base.sets += 1;
  const ex = EXERCISE_MAP[exerciseId];
  if (ex?.kind === 'timed') return { sets: 3, repMin: 30, repMax: 60, restSec: 60 };
  // Bodyweight compounds can't be loaded easily: use a higher rep range.
  if (ex?.equipment === 'bodyweight' && ex.category === 'compound' && goal === 'strength') {
    return { ...base, repMin: 6, repMax: 12 };
  }
  return base;
}

export interface GenerateOptions {
  daysPerWeek: number;
  experience: Experience;
  trainingGoal: TrainingGoal;
  equipment: EquipmentAccess;
  /** Cap on exercises per session (from session length). */
  maxExercises?: number;
}

/** Exercises per session that fit a time budget (≈ 9–10 min per exercise incl. rest). */
export function exercisesForMinutes(minutes: number): number {
  if (!(minutes > 0)) return 6;
  return Math.min(8, Math.max(3, Math.floor(minutes / 9.5)));
}

export function generateProgram(opts: GenerateOptions): Program {
  const split = splitFor(opts.daysPerWeek);
  const available = ACCESS_EQUIPMENT[opts.equipment];
  const max = opts.maxExercises ?? 8;

  const routines: Routine[] = split.days.map((day) => {
    const used = new Set<string>();
    const exercises: RoutineExercise[] = [];
    for (const slot of day.slots) {
      if (exercises.length >= max) break;
      const pick = slot.options.find((id) => {
        const ex = EXERCISE_MAP[id];
        return ex && available.has(ex.equipment) && !used.has(id);
      });
      if (!pick) continue;
      used.add(pick);
      const s = schemeFor(slot.role, opts.trainingGoal, opts.experience, pick);
      exercises.push({ exerciseId: pick, sets: s.sets, repMin: s.repMin, repMax: s.repMax, restSec: s.restSec });
    }
    return { id: uid('r_'), name: day.name, focus: day.focus, exercises };
  });

  const schedule: (string | null)[] = Array(7).fill(null);
  split.weekdays.forEach((wd, i) => {
    schedule[wd] = routines[i].id;
  });

  return {
    id: uid('p_'),
    name: split.name,
    description: split.description,
    daysPerWeek: split.days.length,
    schedule,
    routines,
    createdAt: Date.now(),
  };
}

/** Recommended days per week for an experience level. */
export function recommendedDays(experience: Experience): number {
  return experience === 'beginner' ? 3 : experience === 'intermediate' ? 4 : 5;
}
