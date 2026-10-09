import {
  KG_PER_LB,
  CM_PER_INCH,
  ML_PER_FL_OZ,
  kgToLb,
  lbToKg,
  roundTo,
  floorTo,
  clamp,
  toDisplayWeight,
  fromDisplayWeight,
  formatNumber,
  formatInt,
  formatWeight,
  displayLoad,
  formatWater,
  cmToFeetInches,
  feetInchesToCm,
  formatHeight,
  parseDecimal,
} from '../units';

describe('constants and conversions', () => {
  it('uses exact international definitions', () => {
    expect(KG_PER_LB).toBe(0.45359237);
    expect(CM_PER_INCH).toBe(2.54);
    expect(ML_PER_FL_OZ).toBeCloseTo(29.5735, 4);
  });
  it('kg <-> lb', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
    expect(lbToKg(225)).toBeCloseTo(102.058, 3);
    expect(kgToLb(0)).toBe(0);
    for (const v of [0.5, 20, 82.5, 140, 300]) expect(lbToKg(kgToLb(v))).toBeCloseTo(v, 10);
  });
  it('display conversions', () => {
    expect(toDisplayWeight(80, 'kg')).toBe(80);
    expect(toDisplayWeight(80, 'lb')).toBeCloseTo(176.37, 2);
    expect(fromDisplayWeight(80, 'kg')).toBe(80);
    expect(fromDisplayWeight(176.37, 'lb')).toBeCloseTo(80, 2);
    expect(fromDisplayWeight(toDisplayWeight(61.3, 'lb'), 'lb')).toBeCloseTo(61.3, 10);
  });
});

describe('roundTo / floorTo / clamp', () => {
  it('roundTo nearest step', () => {
    expect(roundTo(82.4, 2.5)).toBe(82.5);
    expect(roundTo(81.2, 2.5)).toBe(80);
    expect(roundTo(81.25, 2.5)).toBe(82.5);
    expect(roundTo(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(roundTo(2835, 50)).toBe(2850);
    expect(roundTo(17, 5)).toBe(15);
    expect(roundTo(-3.7, 1)).toBe(-4);
  });
  it('roundTo returns value unchanged for bad step / non-finite value', () => {
    expect(roundTo(3.3, 0)).toBe(3.3);
    expect(roundTo(3.3, -1)).toBe(3.3);
    expect(roundTo(3.3, NaN)).toBe(3.3);
    expect(roundTo(NaN, 1)).toBeNaN();
    expect(roundTo(Infinity, 1)).toBe(Infinity);
  });
  it('floorTo floors with float tolerance', () => {
    expect(floorTo(84.9, 2.5)).toBe(82.5);
    expect(floorTo(85, 2.5)).toBe(85);
    expect(floorTo(0.3, 0.1)).toBe(0.3);
    expect(floorTo(5, 0)).toBe(5);
    expect(floorTo(NaN, 1)).toBeNaN();
  });
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(0, 0, 10)).toBe(0);
  });
});

describe('formatNumber / formatInt', () => {
  it('trims trailing zeros', () => {
    expect(formatNumber(80)).toBe('80');
    expect(formatNumber(82.5)).toBe('82.5');
    expect(formatNumber(82.25, 2)).toBe('82.25');
    expect(formatNumber(82.26)).toBe('82.3');
    expect(formatNumber(100, 0)).toBe('100');
    expect(formatNumber(100.04)).toBe('100');
    expect(formatNumber(1.6, 0)).toBe('2');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(10.0, 2)).toBe('10');
    expect(formatNumber(-2.5)).toBe('-2.5');
  });
  it('never renders negative zero', () => {
    expect(formatNumber(-0.04)).toBe('0');
    expect(formatNumber(-0.4, 0)).toBe('0');
  });
  it('non-finite renders dash', () => {
    expect(formatNumber(NaN)).toBe('—');
    expect(formatNumber(Infinity)).toBe('—');
    expect(formatInt(NaN)).toBe('—');
  });
  it('formatInt groups thousands', () => {
    expect(formatInt(0)).toBe('0');
    expect(formatInt(999)).toBe('999');
    expect(formatInt(1000)).toBe('1,000');
    expect(formatInt(1234.6)).toBe('1,235');
    expect(formatInt(1234567)).toBe('1,234,567');
    expect(formatInt(-1234)).toBe('-1,234');
  });
});

describe('formatWeight / displayLoad', () => {
  it('formats in unit', () => {
    expect(formatWeight(82.5, 'kg')).toBe('82.5 kg');
    expect(formatWeight(82.5, 'lb')).toBe('181.9 lb');
    expect(formatWeight(100, 'lb', 0)).toBe('220 lb');
    expect(formatWeight(NaN, 'kg')).toBe('—');
  });
  it('displayLoad rounds to 0.25 kg / 0.5 lb', () => {
    expect(displayLoad(82.4, 'kg')).toBe(82.5);
    expect(displayLoad(82.1, 'kg')).toBe(82);
    expect(displayLoad(100, 'lb')).toBe(220.5);
    expect(displayLoad(lbToKg(225), 'lb')).toBe(225);
  });
});

describe('formatWater', () => {
  it('metric', () => {
    expect(formatWater(500, 'kg')).toBe('500 ml');
    expect(formatWater(999, 'kg')).toBe('999 ml');
    expect(formatWater(1000, 'kg')).toBe('1 L');
    expect(formatWater(2500, 'kg')).toBe('2.5 L');
    expect(formatWater(2850, 'kg')).toBe('2.85 L');
  });
  it('imperial uses fl oz', () => {
    expect(formatWater(1000, 'lb')).toBe('34 oz');
    expect(formatWater(ML_PER_FL_OZ * 8, 'lb')).toBe('8 oz');
  });
  it('non-finite', () => {
    expect(formatWater(NaN, 'kg')).toBe('—');
  });
});

describe('height', () => {
  it('cmToFeetInches', () => {
    expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(cmToFeetInches(182.88)).toEqual({ feet: 6, inches: 0 });
    expect(cmToFeetInches(152.4)).toEqual({ feet: 5, inches: 0 });
    // 182.5 cm = 71.85 in -> rounds to 72 in -> 6'0", never 5'12"
    expect(cmToFeetInches(182.5)).toEqual({ feet: 6, inches: 0 });
  });
  it('feetInchesToCm', () => {
    expect(feetInchesToCm(6, 0)).toBeCloseTo(182.88, 6);
    expect(feetInchesToCm(5, 11)).toBeCloseTo(180.34, 6);
  });
  it('formatHeight', () => {
    expect(formatHeight(180.4, 'kg')).toBe('180 cm');
    expect(formatHeight(180, 'lb')).toBe('5′11″');
    expect(formatHeight(NaN, 'kg')).toBe('—');
  });
});

describe('parseDecimal', () => {
  it.each([
    ['82.5', 82.5],
    ['82,5', 82.5],
    [' 80 ', 80],
    ['0', 0],
    ['.5', 0.5],
    ['5.', 5],
    ['-2.5', -2.5],
  ])('parses %p', (t, v) => {
    expect(parseDecimal(t)).toBe(v);
  });
  it.each(['', '   ', '.', '-', 'abc', '1e3', '1.2.3', '1,2,3', '12kg', '+5', '--1'])('rejects %p', (t) => {
    expect(parseDecimal(t)).toBeNaN();
  });
});
