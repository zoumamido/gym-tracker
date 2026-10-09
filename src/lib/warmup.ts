/**
 * Warm-up ramps and plate math. See docs/gym-science.md section 13.
 */
import { WeightUnit, kgToLb, lbToKg, roundTo } from './units';

export interface WarmupSet {
  weightKg: number;
  reps: number;
  label: string;
}

export const DEFAULT_BAR_KG = 20;

/** Smallest total jump on a barbell (two of the smallest plates). */
export function barbellStepKg(unit: WeightUnit): number {
  return unit === 'kg' ? 2.5 : lbToKg(5);
}

function roundLoad(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? roundTo(kg, 2.5) : lbToKg(roundTo(kgToLb(kg), 5));
}

/**
 * Warm-up ramp for a barbell lift: empty bar ×10, ~40% ×5, ~60% ×3, ~80% ×2,
 * plus ~90% ×1 when `heavy` (working near max). Loads are rounded to plate
 * steps, strictly increasing, and always lighter than the working weight.
 */
export function warmupSets(workingKg: number, opts: { unit?: WeightUnit; barKg?: number; heavy?: boolean } = {}): WarmupSet[] {
  const unit = opts.unit ?? 'kg';
  const bar = opts.barKg ?? (unit === 'lb' ? lbToKg(45) : DEFAULT_BAR_KG);
  if (!(workingKg > 0) || workingKg <= bar) return [];
  const steps: [number, number][] = [
    [0.4, 5],
    [0.6, 3],
    [0.8, 2],
  ];
  if (opts.heavy) steps.push([0.9, 1]);
  const out: WarmupSet[] = [{ weightKg: bar, reps: 10, label: 'Empty bar' }];
  const minGap = barbellStepKg(unit) - 1e-6;
  for (const [pct, reps] of steps) {
    const w = roundLoad(workingKg * pct, unit);
    const prev = out[out.length - 1].weightKg;
    if (w - prev < minGap) continue;
    if (workingKg - w < minGap) continue;
    out.push({ weightKg: w, reps, label: `${Math.round(pct * 100)}%` });
  }
  return out;
}

export interface PlateCount {
  plate: number;
  count: number;
}

export const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
export const PLATES_LB = [45, 35, 25, 10, 5, 2.5];

/**
 * Plates per side to load `total` on a bar (all values in the given unit).
 * Greedy is optimal for these standard denominations.
 */
export function plateLoadout(total: number, bar: number, plates: number[]): { perSide: PlateCount[]; achieved: number; remainder: number } {
  if (!Number.isFinite(total) || !Number.isFinite(bar) || total <= bar) {
    return { perSide: [], achieved: Math.max(0, bar), remainder: Math.max(0, (total || 0) - bar) };
  }
  let side = (total - bar) / 2;
  const perSide: PlateCount[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    const count = Math.floor(side / p + 1e-9);
    if (count > 0) {
      perSide.push({ plate: p, count });
      side -= count * p;
    }
  }
  const loadedPerSide = perSide.reduce((s, x) => s + x.plate * x.count, 0);
  const achieved = Number((bar + loadedPerSide * 2).toFixed(3));
  return { perSide, achieved, remainder: Number((total - achieved).toFixed(3)) };
}
