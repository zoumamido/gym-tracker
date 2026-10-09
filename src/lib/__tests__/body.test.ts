import {
  ACTIVITY_FACTORS,
  ACTIVITY_LABELS,
  BMI_CATEGORY_LABEL,
  BODY_FAT_CATEGORY_LABEL,
  FFMI_CATEGORY_LABEL,
  bmi,
  bmiCategory,
  healthyWeightRange,
  weightAtBmi,
  idealBodyWeight,
  bmrMifflin,
  bmrKatchMcArdle,
  bmr,
  tdee,
  bodyFatNavy,
  bodyFatDeurenberg,
  bodyFatCategory,
  estimateBodyFat,
  leanBodyMass,
  leanBodyMassBoer,
  ffmi,
  ffmiCategory,
  maxHeartRate,
  heartRateZones,
  netActivityCalories,
  BODY_FAT_MIN,
  BODY_FAT_MAX,
  isPlausibleBodyFat,
} from '../body';

const MALE = { sex: 'male' as const, age: 30, heightCm: 180, weightKg: 80 };
const FEMALE = { sex: 'female' as const, age: 30, heightCm: 165, weightKg: 60 };

describe('BMI', () => {
  it('computes W / H^2', () => {
    expect(bmi(80, 180)).toBeCloseTo(24.691, 3);
    expect(bmi(60, 165)).toBeCloseTo(22.039, 3);
    expect(bmi(100, 200)).toBeCloseTo(25, 10);
  });
  it.each([
    [0, 180],
    [80, 0],
    [-80, 180],
    [NaN, 180],
    [80, Infinity],
  ])('returns NaN for invalid (%p, %p)', (w, h) => {
    expect(bmi(w, h)).toBeNaN();
  });
  it('categories at WHO thresholds', () => {
    expect(bmiCategory(18.49)).toBe('underweight');
    expect(bmiCategory(18.5)).toBe('normal');
    expect(bmiCategory(24.99)).toBe('normal');
    expect(bmiCategory(25)).toBe('overweight');
    expect(bmiCategory(29.99)).toBe('overweight');
    expect(bmiCategory(30)).toBe('obese1');
    expect(bmiCategory(34.99)).toBe('obese1');
    expect(bmiCategory(35)).toBe('obese2');
    expect(bmiCategory(39.99)).toBe('obese2');
    expect(bmiCategory(40)).toBe('obese3');
    expect(bmiCategory(60)).toBe('obese3');
  });
  it('category null for invalid', () => {
    expect(bmiCategory(0)).toBeNull();
    expect(bmiCategory(-5)).toBeNull();
    expect(bmiCategory(NaN)).toBeNull();
    expect(bmiCategory(Infinity)).toBeNull();
  });
  it('labels exist for every category', () => {
    expect(Object.keys(BMI_CATEGORY_LABEL).sort()).toEqual(['normal', 'obese1', 'obese2', 'obese3', 'overweight', 'underweight']);
  });
  it('healthy range 18.5–24.9 × H²', () => {
    const r = healthyWeightRange(180);
    expect(r.min).toBeCloseTo(59.94, 2);
    expect(r.max).toBeCloseTo(80.676, 3);
    expect(bmi(r.min, 180)).toBeCloseTo(18.5, 10);
    const bad = healthyWeightRange(0);
    expect(bad.min).toBeNaN();
    expect(bad.max).toBeNaN();
  });
  it('weightAtBmi', () => {
    expect(weightAtBmi(25, 180)).toBeCloseTo(81, 10);
    expect(weightAtBmi(0, 180)).toBeNaN();
    expect(weightAtBmi(25, -1)).toBeNaN();
  });
});

describe('idealBodyWeight', () => {
  it('male 180 cm (10.866 in over 5 ft)', () => {
    const r = idealBodyWeight(180, 'male');
    expect(r.devine).toBeCloseTo(74.992, 3);
    expect(r.robinson).toBeCloseTo(72.646, 3);
    expect(r.miller).toBeCloseTo(71.521, 3);
    expect(r.hamwi).toBeCloseTo(77.339, 3);
    expect(r.average).toBeCloseTo((74.992 + 72.646 + 71.521 + 77.339) / 4, 2);
  });
  it('female 165 cm', () => {
    const inch = 165 / 2.54 - 60;
    const r = idealBodyWeight(165, 'female');
    expect(r.devine).toBeCloseTo(45.5 + 2.3 * inch, 6);
    expect(r.robinson).toBeCloseTo(49 + 1.7 * inch, 6);
    expect(r.miller).toBeCloseTo(53.1 + 1.36 * inch, 6);
    expect(r.hamwi).toBeCloseTo(45.5 + 2.2 * inch, 6);
  });
  it('clamps inches at 0 below 5 ft', () => {
    const r = idealBodyWeight(140, 'male');
    expect(r.devine).toBe(50);
    expect(r.robinson).toBe(52);
    expect(r.miller).toBe(56.2);
    expect(r.hamwi).toBe(48);
    expect(idealBodyWeight(152.4, 'female').devine).toBeCloseTo(45.5, 10);
  });
  it('NaN for invalid height', () => {
    const r = idealBodyWeight(0, 'male');
    expect(r.average).toBeNaN();
    expect(r.devine).toBeNaN();
  });
});

describe('BMR / TDEE', () => {
  it('Mifflin-St Jeor (30y male 180cm 80kg = 1780; female 1614)', () => {
    expect(bmrMifflin(MALE)).toBe(1780);
    expect(bmrMifflin({ ...MALE, sex: 'female' })).toBe(1614);
    expect(bmrMifflin(FEMALE)).toBeCloseTo(10 * 60 + 6.25 * 165 - 150 - 161, 10);
  });
  it('Mifflin NaN on invalid input', () => {
    expect(bmrMifflin({ ...MALE, age: 0 })).toBeNaN();
    expect(bmrMifflin({ ...MALE, weightKg: -1 })).toBeNaN();
    expect(bmrMifflin({ ...MALE, heightCm: NaN })).toBeNaN();
  });
  it('Katch-McArdle', () => {
    expect(bmrKatchMcArdle(64)).toBeCloseTo(1752.4, 6);
    expect(bmrKatchMcArdle(0)).toBeNaN();
    expect(bmrKatchMcArdle(NaN)).toBeNaN();
  });
  it('bmr() chooses Katch only for plausible body fat 3–60%', () => {
    expect(bmr({ ...MALE, bodyFatPct: 20 })).toEqual({ value: expect.closeTo(1752.4, 6), method: 'katch' });
    expect(bmr({ ...MALE, bodyFatPct: 3 }).method).toBe('katch');
    expect(bmr({ ...MALE, bodyFatPct: 60 }).method).toBe('katch');
    expect(bmr({ ...MALE, bodyFatPct: 2.9 })).toEqual({ value: 1780, method: 'mifflin' });
    expect(bmr({ ...MALE, bodyFatPct: 61 }).method).toBe('mifflin');
    expect(bmr({ ...MALE, bodyFatPct: null }).method).toBe('mifflin');
    expect(bmr({ ...MALE, bodyFatPct: NaN }).method).toBe('mifflin');
    expect(bmr(MALE).value).toBe(1780);
  });
  it('tdee multiplies by activity factor', () => {
    expect(ACTIVITY_FACTORS).toEqual({ sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725, extra: 1.9 });
    expect(tdee(1780, 'sedentary')).toBeCloseTo(2136, 6);
    expect(tdee(1780, 'light')).toBeCloseTo(2447.5, 6);
    expect(tdee(1780, 'moderate')).toBeCloseTo(2759, 6);
    expect(tdee(1780, 'very')).toBeCloseTo(3070.5, 6);
    expect(tdee(1780, 'extra')).toBeCloseTo(3382, 6);
    expect(tdee(NaN, 'moderate')).toBeNaN();
    expect(tdee(0, 'moderate')).toBeNaN();
    expect(Object.keys(ACTIVITY_LABELS).sort()).toEqual(Object.keys(ACTIVITY_FACTORS).sort());
  });
});

describe('body fat', () => {
  it('US Navy male (180 cm, waist 85, neck 38)', () => {
    expect(bodyFatNavy({ sex: 'male', heightCm: 180, waistCm: 85, neckCm: 38 })).toBeCloseTo(16.107, 2);
  });
  it('US Navy female (165 cm, waist 75, hip 100, neck 34)', () => {
    expect(bodyFatNavy({ sex: 'female', heightCm: 165, waistCm: 75, hipCm: 100, neckCm: 34 })).toBeCloseTo(28.936, 2);
  });
  it('Navy returns null on missing / implausible measurements', () => {
    expect(bodyFatNavy({ sex: 'male', heightCm: 180, waistCm: 38, neckCm: 38 })).toBeNull();
    expect(bodyFatNavy({ sex: 'male', heightCm: 180, waistCm: 30, neckCm: 38 })).toBeNull();
    expect(bodyFatNavy({ sex: 'male', heightCm: 0, waistCm: 85, neckCm: 38 })).toBeNull();
    expect(bodyFatNavy({ sex: 'male', heightCm: 180, waistCm: NaN, neckCm: 38 })).toBeNull();
    expect(bodyFatNavy({ sex: 'female', heightCm: 165, waistCm: 75, neckCm: 34 })).toBeNull();
    expect(bodyFatNavy({ sex: 'female', heightCm: 165, waistCm: 75, neckCm: 34, hipCm: 0 })).toBeNull();
  });
  it('plausible range 3–60%', () => {
    expect(BODY_FAT_MIN).toBe(3);
    expect(BODY_FAT_MAX).toBe(60);
    expect(isPlausibleBodyFat(3)).toBe(true);
    expect(isPlausibleBodyFat(60)).toBe(true);
    expect(isPlausibleBodyFat(20)).toBe(true);
    expect(isPlausibleBodyFat(2.9)).toBe(false);
    expect(isPlausibleBodyFat(60.1)).toBe(false);
    expect(isPlausibleBodyFat(0)).toBe(false);
    expect(isPlausibleBodyFat(NaN)).toBe(false);
    expect(isPlausibleBodyFat(null)).toBe(false);
    expect(isPlausibleBodyFat(undefined)).toBe(false);
  });
  it('Navy is clamped to 3–60%', () => {
    expect(bodyFatNavy({ sex: 'male', heightCm: 180, waistCm: 39, neckCm: 38 })).toBe(3);
    expect(bodyFatNavy({ sex: 'male', heightCm: 150, waistCm: 200, neckCm: 30 })).toBe(60);
  });
  it('Deurenberg', () => {
    expect(bodyFatDeurenberg(bmi(80, 180), 30, 'male')).toBeCloseTo(20.33, 2);
    expect(bodyFatDeurenberg(22, 30, 'female')).toBeCloseTo(1.2 * 22 + 6.9 - 5.4, 10);
    expect(bodyFatDeurenberg(10, 18, 'male')).toBe(3);
    expect(bodyFatDeurenberg(60, 80, 'female')).toBe(60);
    expect(bodyFatDeurenberg(NaN, 30, 'male')).toBeNaN();
    expect(bodyFatDeurenberg(24, 0, 'male')).toBeNaN();
  });
  it('ACE categories (male thresholds 6/14/18/25)', () => {
    expect(bodyFatCategory(5.9, 'male')).toBe('essential');
    expect(bodyFatCategory(6, 'male')).toBe('athletic');
    expect(bodyFatCategory(13.9, 'male')).toBe('athletic');
    expect(bodyFatCategory(14, 'male')).toBe('fitness');
    expect(bodyFatCategory(18, 'male')).toBe('average');
    expect(bodyFatCategory(24.9, 'male')).toBe('average');
    expect(bodyFatCategory(25, 'male')).toBe('obese');
  });
  it('ACE categories (female thresholds 14/21/25/32)', () => {
    expect(bodyFatCategory(13.9, 'female')).toBe('essential');
    expect(bodyFatCategory(14, 'female')).toBe('athletic');
    expect(bodyFatCategory(21, 'female')).toBe('fitness');
    expect(bodyFatCategory(25, 'female')).toBe('average');
    expect(bodyFatCategory(32, 'female')).toBe('obese');
  });
  it('category null for invalid', () => {
    expect(bodyFatCategory(0, 'male')).toBeNull();
    expect(bodyFatCategory(NaN, 'female')).toBeNull();
    expect(Object.keys(BODY_FAT_CATEGORY_LABEL)).toHaveLength(5);
  });
  it('estimateBodyFat priority: measured > navy > bmi', () => {
    expect(estimateBodyFat({ ...MALE, bodyFatPct: 15, waistCm: 85, neckCm: 38 })).toEqual({ value: 15, method: 'measured' });
    const navy = estimateBodyFat({ ...MALE, bodyFatPct: null, waistCm: 85, neckCm: 38 })!;
    expect(navy.method).toBe('navy');
    expect(navy.value).toBeCloseTo(16.107, 2);
    const viaBmi = estimateBodyFat({ ...MALE, waistCm: null, neckCm: 38 })!;
    expect(viaBmi.method).toBe('bmi');
    expect(viaBmi.value).toBeCloseTo(20.33, 2);
    // implausible navy falls back to bmi
    expect(estimateBodyFat({ ...MALE, waistCm: 30, neckCm: 38 })!.method).toBe('bmi');
    // implausible measured (>= 75 or <= 0) is ignored
    expect(estimateBodyFat({ ...MALE, bodyFatPct: 80 })!.method).toBe('bmi');
    expect(estimateBodyFat({ ...MALE, bodyFatPct: 0 })!.method).toBe('bmi');
    // measured accepted only within 3–60
    expect(estimateBodyFat({ ...MALE, bodyFatPct: 3 })).toEqual({ value: 3, method: 'measured' });
    expect(estimateBodyFat({ ...MALE, bodyFatPct: 60 })).toEqual({ value: 60, method: 'measured' });
    expect(estimateBodyFat({ ...MALE, bodyFatPct: 2.5 })!.method).toBe('bmi');
    expect(estimateBodyFat({ ...MALE, bodyFatPct: 65, waistCm: 85, neckCm: 38 })!.method).toBe('navy');
  });
  it('estimateBodyFat null when nothing usable', () => {
    expect(estimateBodyFat({ ...MALE, weightKg: 0 })).toBeNull();
    expect(estimateBodyFat({ ...MALE, age: NaN })).toBeNull();
  });
});

describe('lean mass / FFMI', () => {
  it('leanBodyMass', () => {
    expect(leanBodyMass(80, 20)).toBeCloseTo(64, 10);
    expect(leanBodyMass(80, 0)).toBe(80);
    expect(leanBodyMass(80, 100)).toBeNaN();
    expect(leanBodyMass(80, -1)).toBeNaN();
    expect(leanBodyMass(0, 20)).toBeNaN();
    expect(leanBodyMass(80, NaN)).toBeNaN();
  });
  it('Boer', () => {
    expect(leanBodyMassBoer('male', 80, 180)).toBeCloseTo(61.42, 6);
    expect(leanBodyMassBoer('female', 60, 165)).toBeCloseTo(0.252 * 60 + 0.473 * 165 - 48.3, 6);
    expect(leanBodyMassBoer('male', 30, 200)).toBeLessThanOrEqual(30); // capped at body weight
    expect(leanBodyMassBoer('male', 0, 180)).toBeNaN();
  });
  it('ffmi + normalized', () => {
    const a = ffmi(64, 180);
    expect(a.ffmi).toBeCloseTo(19.753, 3);
    expect(a.normalized).toBeCloseTo(19.753, 3);
    const b = ffmi(60, 170);
    expect(b.ffmi).toBeCloseTo(60 / 2.89, 6);
    expect(b.normalized).toBeCloseTo(60 / 2.89 + 6.1 * 0.1, 6);
    expect(ffmi(0, 180).ffmi).toBeNaN();
    expect(ffmi(NaN, 180).normalized).toBeNaN();
  });
  it('ffmi categories (male)', () => {
    expect(ffmiCategory(17.99, 'male')).toBe('below');
    expect(ffmiCategory(18, 'male')).toBe('average');
    expect(ffmiCategory(20, 'male')).toBe('above');
    expect(ffmiCategory(22, 'male')).toBe('excellent');
    expect(ffmiCategory(23, 'male')).toBe('elite');
    expect(ffmiCategory(26, 'male')).toBe('elite');
  });
  it('ffmi categories (female shifted by 3.5)', () => {
    expect(ffmiCategory(14.49, 'female')).toBe('below');
    expect(ffmiCategory(14.5, 'female')).toBe('average');
    expect(ffmiCategory(19.5, 'female')).toBe('elite');
  });
  it('ffmi category null for invalid', () => {
    expect(ffmiCategory(NaN, 'male')).toBeNull();
    expect(ffmiCategory(0, 'male')).toBeNull();
    expect(Object.keys(FFMI_CATEGORY_LABEL)).toHaveLength(5);
  });
});

describe('heart rate / activity', () => {
  it('Tanaka max HR', () => {
    expect(maxHeartRate(30)).toBeCloseTo(187, 10);
    expect(maxHeartRate(50)).toBeCloseTo(173, 10);
    expect(maxHeartRate(0)).toBeNaN();
    expect(maxHeartRate(-1)).toBeNaN();
  });
  it('zones at 50/60/70/80/90–100%', () => {
    const z = heartRateZones(30);
    expect(z).toHaveLength(5);
    expect(z.map((x) => x.zone)).toEqual([1, 2, 3, 4, 5]);
    expect(z[0]).toMatchObject({ min: 94, max: 112 });
    expect(z[1]).toMatchObject({ min: 112, max: 131 });
    expect(z[4]).toMatchObject({ min: 168, max: 187 });
    for (let i = 1; i < 5; i++) expect(z[i].min).toBe(z[i - 1].max);
    expect(heartRateZones(NaN)).toEqual([]);
  });
  it('net activity calories', () => {
    expect(netActivityCalories(6, 80, 60)).toBeCloseTo(400, 10);
    expect(netActivityCalories(3.5, 70, 30)).toBeCloseTo(87.5, 10);
    expect(netActivityCalories(0.5, 80, 60)).toBe(0);
    expect(netActivityCalories(6, 80, 0)).toBe(0);
    expect(netActivityCalories(6, 80, -1)).toBeNaN();
    expect(netActivityCalories(0, 80, 60)).toBeNaN();
    expect(netActivityCalories(6, 0, 60)).toBeNaN();
  });
});
