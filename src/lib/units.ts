/**
 * Unit conversion and number formatting. Everything is stored in metric
 * (kg, cm, ml); conversion happens only at the display/input boundary.
 */

export type WeightUnit = 'kg' | 'lb';

export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;
export const ML_PER_FL_OZ = 29.5735295625;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

/** Rounds to the nearest multiple of step (step <= 0 returns value unchanged). */
export function roundTo(value: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(value)) return value;
  // toFixed guards against binary float noise like 82.50000000001
  return Number((Math.round(value / step) * step).toFixed(6));
}

export function floorTo(value: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(value)) return value;
  return Number((Math.floor(value / step + 1e-9) * step).toFixed(6));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** kg -> number in the user's unit. */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kgToLb(kg);
}

/** number in the user's unit -> kg. */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : lbToKg(value);
}

/** Trims trailing zeros: 80 -> "80", 82.5 -> "82.5", 82.25 -> "82.25". */
export function formatNumber(value: number, maxDecimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(maxDecimals);
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  return trimmed === '-0' ? '0' : trimmed;
}

/** "1,234" */
export function formatInt(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "82.5 kg" / "181.9 lb" */
export function formatWeight(kg: number, unit: WeightUnit, maxDecimals = 1): string {
  if (!Number.isFinite(kg)) return '—';
  return `${formatNumber(toDisplayWeight(kg, unit), maxDecimals)} ${unit}`;
}

/** Display rounding used for loads: 0.25 kg / 0.5 lb resolution (fits micro-plates). */
export function displayLoad(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? roundTo(kg, 0.25) : roundTo(kgToLb(kg), 0.5);
}

/** Water: metric shows litres, imperial shows fl oz. */
export function formatWater(ml: number, unit: WeightUnit): string {
  if (!Number.isFinite(ml)) return '—';
  if (unit === 'lb') return `${formatInt(ml / ML_PER_FL_OZ)} oz`;
  return ml >= 1000 ? `${formatNumber(ml / 1000, 2)} L` : `${formatInt(ml)} ml`;
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalIn = cm / CM_PER_INCH;
  let feet = Math.floor(totalIn / 12);
  let inches = Math.round(totalIn - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

export function formatHeight(cm: number, unit: WeightUnit): string {
  if (!Number.isFinite(cm)) return '—';
  if (unit === 'kg') return `${Math.round(cm)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}′${inches}″`;
}

/** Parses user text input; accepts comma decimals ("82,5"). Returns NaN on garbage. */
export function parseDecimal(text: string): number {
  const t = text.trim().replace(',', '.');
  if (t === '' || !/^-?\d*\.?\d*$/.test(t) || t === '.' || t === '-') return NaN;
  return Number(t);
}
