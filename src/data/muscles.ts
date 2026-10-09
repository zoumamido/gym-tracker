import type { Muscle } from '../lib/types';

export const MUSCLES: Muscle[] = [
  'chest',
  'lats',
  'upper_back',
  'traps',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'lower_back',
];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  abs: 'Abs',
  lower_back: 'Lower back',
};

export type MuscleGroup = 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Legs' | 'Core';

export const MUSCLE_GROUP: Record<Muscle, MuscleGroup> = {
  chest: 'Chest',
  lats: 'Back',
  upper_back: 'Back',
  traps: 'Back',
  lower_back: 'Back',
  front_delts: 'Shoulders',
  side_delts: 'Shoulders',
  rear_delts: 'Shoulders',
  biceps: 'Arms',
  triceps: 'Arms',
  forearms: 'Arms',
  quads: 'Legs',
  hamstrings: 'Legs',
  glutes: 'Legs',
  calves: 'Legs',
  abs: 'Core',
};

/**
 * Weekly hard-set volume landmarks (Renaissance Periodization style, rounded).
 * mev = minimum effective volume, mav = productive range, mrv = max recoverable.
 */
export const VOLUME_LANDMARKS: Record<Muscle, { mev: number; mav: [number, number]; mrv: number }> = {
  chest: { mev: 8, mav: [12, 20], mrv: 22 },
  lats: { mev: 8, mav: [12, 20], mrv: 25 },
  upper_back: { mev: 6, mav: [10, 18], mrv: 25 },
  traps: { mev: 2, mav: [8, 16], mrv: 26 },
  front_delts: { mev: 0, mav: [6, 8], mrv: 12 },
  side_delts: { mev: 8, mav: [14, 22], mrv: 26 },
  rear_delts: { mev: 6, mav: [10, 18], mrv: 24 },
  biceps: { mev: 6, mav: [12, 20], mrv: 26 },
  triceps: { mev: 6, mav: [10, 14], mrv: 18 },
  forearms: { mev: 2, mav: [8, 14], mrv: 22 },
  quads: { mev: 8, mav: [12, 18], mrv: 20 },
  hamstrings: { mev: 6, mav: [10, 16], mrv: 20 },
  glutes: { mev: 2, mav: [6, 12], mrv: 16 },
  calves: { mev: 8, mav: [12, 16], mrv: 20 },
  abs: { mev: 4, mav: [12, 20], mrv: 25 },
  lower_back: { mev: 2, mav: [4, 10], mrv: 12 },
};
