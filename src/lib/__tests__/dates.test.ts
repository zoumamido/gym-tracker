import {
  dayKey,
  parseDayKey,
  addDays,
  addDaysToKey,
  daysBetween,
  startOfDay,
  startOfWeek,
  formatShortDate,
  formatLongDate,
  formatDuration,
  formatMinutes,
  greeting,
  WEEKDAY_SHORT,
  WEEKDAY_LONG,
} from '../dates';

const NOW = new Date(2026, 9, 9, 10, 0); // Fri Oct 9 2026, 10:00 local

describe('dayKey', () => {
  it('formats local date with zero padding', () => {
    expect(dayKey(NOW)).toBe('2026-10-09');
    expect(dayKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
    expect(dayKey(new Date(2026, 11, 31, 23, 59, 59, 999))).toBe('2026-12-31');
  });
});

describe('parseDayKey', () => {
  it('parses to local midnight', () => {
    const d = parseDayKey('2026-10-09')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(9);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
  it('round-trips with dayKey', () => {
    for (const k of ['2024-02-29', '2026-03-29', '2026-11-01', '2000-01-01']) expect(dayKey(parseDayKey(k)!)).toBe(k);
  });
  it.each([
    '',
    '2026-1-09',
    '2026-10-9',
    '26-10-09',
    '2026/10/09',
    '2026-13-01',
    '2026-00-10',
    '2026-02-29',
    '2026-02-30',
    '2026-04-31',
    'abcd-ef-gh',
    ' 2026-10-09',
    '2026-10-09T00:00',
  ])('rejects malformed key %p', (k) => {
    expect(parseDayKey(k)).toBeNull();
  });
  it('accepts leap day in leap year', () => {
    expect(parseDayKey('2028-02-29')).not.toBeNull();
  });
});

describe('addDays', () => {
  it('adds and subtracts preserving time of day', () => {
    const r = addDays(NOW, 3);
    expect(dayKey(r)).toBe('2026-10-12');
    expect(r.getHours()).toBe(10);
    expect(dayKey(addDays(NOW, -9))).toBe('2026-09-30');
    expect(dayKey(addDays(NOW, 0))).toBe('2026-10-09');
  });
  it('crosses month/year boundaries', () => {
    expect(dayKey(addDays(new Date(2026, 11, 31, 12), 1))).toBe('2027-01-01');
    expect(dayKey(addDays(new Date(2028, 1, 28, 12), 1))).toBe('2028-02-29');
  });
  it('is DST safe (keeps wall-clock time across EU and US transitions)', () => {
    const cases: [number, number, number][] = [
      [2026, 2, 28], // EU spring forward Mar 29
      [2026, 2, 7], // US spring forward Mar 8
      [2026, 9, 24], // EU fall back Oct 25
      [2026, 9, 31], // US fall back Nov 1
    ];
    for (const [y, m, d] of cases) {
      const start = new Date(y, m, d, 0, 30);
      const next = addDays(start, 1);
      expect(dayKey(next)).toBe(dayKey(new Date(y, m, d + 1, 12)));
      expect(next.getHours()).toBe(0);
      expect(next.getMinutes()).toBe(30);
      expect(dayKey(addDays(next, -1))).toBe(dayKey(start));
      // 7 days in a row lands exactly one week later
      expect(dayKey(addDays(start, 7))).toBe(dayKey(new Date(y, m, d + 7, 12)));
    }
  });
  it('does not mutate the input', () => {
    const d = new Date(NOW);
    addDays(d, 5);
    expect(d.getTime()).toBe(NOW.getTime());
  });
});

describe('addDaysToKey', () => {
  it('adds days to a key', () => {
    expect(addDaysToKey('2026-10-09', 1)).toBe('2026-10-10');
    expect(addDaysToKey('2026-10-09', -10)).toBe('2026-09-29');
    expect(addDaysToKey('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDaysToKey('2026-10-24', 365)).toBe('2027-10-24');
    expect(addDaysToKey('2026-10-09', 0)).toBe('2026-10-09');
  });
  it('throws on malformed key', () => {
    expect(() => addDaysToKey('2026-02-30', 1)).toThrow(/Invalid day key/);
    expect(() => addDaysToKey('nope', 1)).toThrow();
  });
});

describe('daysBetween', () => {
  it('counts whole calendar days (b - a)', () => {
    expect(daysBetween('2026-10-09', '2026-10-09')).toBe(0);
    expect(daysBetween('2026-10-01', '2026-10-09')).toBe(8);
    expect(daysBetween('2026-10-09', '2026-10-01')).toBe(-8);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });
  it('is DST safe', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
  });
  it('is consistent with addDaysToKey', () => {
    for (const n of [-400, -30, -1, 0, 1, 13, 200, 1000]) expect(daysBetween('2026-10-09', addDaysToKey('2026-10-09', n))).toBe(n);
  });
  it('throws on malformed keys', () => {
    expect(() => daysBetween('bad', '2026-10-09')).toThrow(/bad/);
    expect(() => daysBetween('2026-10-09', '2026-10-32')).toThrow(/2026-10-32/);
  });
});

describe('startOfDay / startOfWeek', () => {
  it('startOfDay zeroes time', () => {
    const s = startOfDay(NOW);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getSeconds()).toBe(0);
    expect(dayKey(s)).toBe('2026-10-09');
  });
  it('Monday-based week (default) for a Friday', () => {
    expect(NOW.getDay()).toBe(5);
    const s = startOfWeek(NOW);
    expect(dayKey(s)).toBe('2026-10-05');
    expect(s.getDay()).toBe(1);
    expect(s.getHours()).toBe(0);
  });
  it('Sunday-based week', () => {
    expect(dayKey(startOfWeek(NOW, 0))).toBe('2026-10-04');
  });
  it('Monday maps to itself, Sunday maps to previous Monday', () => {
    expect(dayKey(startOfWeek(new Date(2026, 9, 5, 23)))).toBe('2026-10-05');
    expect(dayKey(startOfWeek(new Date(2026, 9, 11, 23)))).toBe('2026-10-05');
    expect(dayKey(startOfWeek(new Date(2026, 9, 11, 1), 0))).toBe('2026-10-11');
  });
  it('is DST safe', () => {
    const s = startOfWeek(new Date(2026, 2, 30, 12)); // Monday after EU DST
    expect(dayKey(s)).toBe('2026-03-30');
    const s2 = startOfWeek(new Date(2026, 2, 29, 12)); // Sunday of DST change
    expect(dayKey(s2)).toBe('2026-03-23');
    expect(s2.getHours()).toBe(0);
  });
});

describe('formatting', () => {
  it('formats short/long dates', () => {
    expect(formatShortDate(NOW)).toBe('Oct 9');
    expect(formatLongDate(NOW)).toBe('Oct 9, 2026');
    expect(formatShortDate(new Date(2026, 0, 31))).toBe('Jan 31');
  });
  it('formatDuration', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(309)).toBe('5:09');
    expect(formatDuration(3599)).toBe('59:59');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3909)).toBe('1:05:09');
    expect(formatDuration(65.9)).toBe('1:05');
    expect(formatDuration(-10)).toBe('0:00');
  });
  it('formatMinutes', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(59.6)).toBe('1h 0m');
    expect(formatMinutes(65)).toBe('1h 5m');
    expect(formatMinutes(120)).toBe('2h 0m');
    expect(formatMinutes(-5)).toBe('0m');
  });
  it('weekday names align with getDay()', () => {
    expect(WEEKDAY_SHORT[NOW.getDay()]).toBe('Fri');
    expect(WEEKDAY_LONG[0]).toBe('Sunday');
    expect(WEEKDAY_SHORT).toHaveLength(7);
    expect(WEEKDAY_LONG).toHaveLength(7);
  });
});

describe('greeting', () => {
  const at = (h: number, m = 0) => greeting(new Date(2026, 9, 9, h, m));
  it('uses hour thresholds 5/12/18', () => {
    expect(at(0)).toBe('Good night');
    expect(at(4, 59)).toBe('Good night');
    expect(at(5)).toBe('Good morning');
    expect(at(11, 59)).toBe('Good morning');
    expect(at(12)).toBe('Good afternoon');
    expect(at(17, 59)).toBe('Good afternoon');
    expect(at(18)).toBe('Good evening');
    expect(at(23, 59)).toBe('Good evening');
  });
});
