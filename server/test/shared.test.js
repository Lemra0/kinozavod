import { describe, expect, it } from 'vitest';
import {
  addDays,
  ageOn,
  DEFAULT_PRICES,
  localDate,
  localTime,
  normalizeText,
  seatPrice,
  weekdayOf,
  zonedTimeToDate,
} from '@kinozavod/shared';

const TZ = 'Europe/Tallinn';

describe('time helpers', () => {
  it('converts Tallinn summer time to UTC (UTC+3)', () => {
    expect(zonedTimeToDate('2026-07-01', '18:30', TZ).toISOString()).toBe(
      '2026-07-01T15:30:00.000Z',
    );
  });

  it('converts Tallinn winter time to UTC (UTC+2)', () => {
    expect(zonedTimeToDate('2026-12-01', '18:30', TZ).toISOString()).toBe(
      '2026-12-01T16:30:00.000Z',
    );
  });

  it('handles the day when clocks go back', () => {
    const date = zonedTimeToDate('2026-10-25', '12:00', TZ);
    expect(localTime(date, TZ)).toBe('12:00');
    expect(localDate(date, TZ)).toBe('2026-10-25');
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('knows the weekday', () => {
    expect(weekdayOf('2026-09-16')).toBe(3);
    expect(weekdayOf('2026-09-20')).toBe(7);
  });

  it('counts age on a given date', () => {
    expect(ageOn('2010-09-17', '2026-09-16')).toBe(15);
    expect(ageOn('2010-09-16', '2026-09-16')).toBe(16);
  });
});

describe('seat prices', () => {
  const price = (seatType, format, localStartTime) =>
    seatPrice({ seatType, format, localStartTime, prices: DEFAULT_PRICES });

  it('uses base prices for daytime 2D', () => {
    expect(price('standard', '2D', '15:00')).toBe(800);
    expect(price('vip', '2D', '15:00')).toBe(1100);
    expect(price('sofa', '2D', '15:00')).toBe(1600);
  });

  it('adds the 3D surcharge per viewer', () => {
    expect(price('standard', '3D', '15:00')).toBe(1000);
    expect(price('sofa', '3D', '15:00')).toBe(2000);
  });

  it('gives the morning discount per viewer before 12:00', () => {
    expect(price('standard', '2D', '11:50')).toBe(600);
    expect(price('sofa', '2D', '10:00')).toBe(1200);
    expect(price('sofa', '3D', '10:00')).toBe(1600);
    expect(price('standard', '2D', '12:00')).toBe(800);
  });
});

describe('text normalization', () => {
  it('ignores case, ё and diacritics', () => {
    expect(normalizeText('Ёлки  ÕHTU')).toBe('елки ohtu');
    expect(normalizeText('Tram No. 4!')).toBe('tram no 4');
  });
});
