import { useMemo } from 'react';
import { displayLoad, formatNumber, formatWater, formatWeight, fromDisplayWeight, toDisplayWeight, WeightUnit } from '../lib/units';
import { useStore } from './useStore';

export interface UnitHelpers {
  unit: WeightUnit;
  /** "82.5 kg" */
  w: (kg: number, decimals?: number) => string;
  /** number shown in inputs for a kg value */
  toDisplay: (kg: number) => number;
  /** parse input value in the user's unit into kg */
  fromDisplay: (v: number) => number;
  /** rounded bar load in display units */
  load: (kg: number) => string;
  water: (ml: number) => string;
}

export function useUnits(): UnitHelpers {
  const unit = useStore((s) => s.settings.unit);
  return useMemo(
    () => ({
      unit,
      w: (kg, decimals = 1) => formatWeight(kg, unit, decimals),
      toDisplay: (kg) => toDisplayWeight(kg, unit),
      fromDisplay: (v) => fromDisplayWeight(v, unit),
      load: (kg) => formatNumber(displayLoad(kg, unit), 2),
      water: (ml) => formatWater(ml, unit),
    }),
    [unit],
  );
}
