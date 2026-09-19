import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CINEMA, localDate, localTime } from '@kinozavod/shared';
import { buildSeats, HALLS } from '../src/data/halls.js';
import { seedCatalog } from '../src/modules/catalog.js';
import { findOverlap, generateSchedule } from '../src/modules/schedule.js';
import { searchMovieIds } from '../src/modules/search.js';
import { demoPosterSvg } from '../src/modules/demo.js';
import { createTestDb, testConfig } from './helpers.js';

const TZ = CINEMA.timezone;
const NOW = new Date('2026-09-16T07:00:00.000Z');
const silent = () => {};

describe('hall layouts', () => {
  const seats = Object.fromEntries(HALLS.map((h) => [h.code, buildSeats(h)]));

  it('has the planned sizes', () => {
    expect(seats.p1.length).toBe(183);
    expect(seats.p2.length).toBe(110);
    expect(seats.p3.length).toBe(36);
  });

  it('uses all three seat types', () => {
    for (const code of ['p1', 'p2', 'p3']) {
      const types = new Set(seats[code].map((s) => s.type));
      expect([...types].sort()).toEqual(['sofa', 'standard', 'vip']);
    }
  });

  it('does not place two seats in the same cell', () => {
    for (const list of Object.values(seats)) {
      const cells = new Set();
      for (const s of list) {
        for (let dx = 0; dx < s.width; dx += 1) {
          const key = `${s.gridX + dx}:${s.gridY}`;
          expect(cells.has(key)).toBe(false);
          cells.add(key);
        }
      }
    }
  });
});

describe('demo catalog', () => {
  let db;

  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: silent, now: NOW });
  });

  afterEach(() => db.close());

  it('creates demo movies, halls and four weeks of sessions', () => {
    expect(db.prepare('SELECT COUNT(*) FROM movies').pluck().get()).toBe(10);
    expect(db.prepare('SELECT COUNT(*) FROM halls').pluck().get()).toBe(3);
    const days = db
      .prepare('SELECT start_time FROM sessions')
      .pluck()
      .all()
      .map((t) => localDate(new Date(t), TZ));
    expect(new Set(days).size).toBe(28);
  });

  it('keeps sessions inside opening hours without overlaps', () => {
    const sessions = db
      .prepare('SELECT hall_id, start_time, end_time FROM sessions ORDER BY hall_id, start_time')
      .all();
    for (let i = 0; i < sessions.length; i += 1) {
      const s = sessions[i];
      const time = localTime(new Date(s.start_time), TZ);
      expect(time >= '10:00' && time <= '23:30').toBe(true);
      const next = sessions[i + 1];
      if (next && next.hall_id === s.hall_id) {
        const gap = (new Date(next.start_time) - new Date(s.end_time)) / 60000;
        expect(gap).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('shows 3D only in halls that support it and only for 3D movies', () => {
    const bad = db
      .prepare(
        `SELECT COUNT(*) FROM sessions s
         JOIN halls h ON h.id = s.hall_id
         JOIN movies m ON m.id = s.movie_id
         WHERE s.format = '3D' AND (h.code = 'p3' OR m.supports_3d = 0)`,
      )
      .pluck()
      .get();
    expect(bad).toBe(0);
    const threeD = db.prepare("SELECT COUNT(*) FROM sessions WHERE format = '3D'").pluck().get();
    expect(threeD).toBeGreaterThan(0);
  });

  it('does not schedule upcoming movies before their release', () => {
    const early = db
      .prepare(
        `SELECT COUNT(*) FROM sessions s JOIN movies m ON m.id = s.movie_id
         WHERE s.start_time < m.rental_start`,
      )
      .pluck()
      .get();
    expect(early).toBe(0);
  });

  it('does not duplicate days that already have sessions', () => {
    const before = db.prepare('SELECT COUNT(*) FROM sessions').pluck().get();
    expect(generateSchedule(db, { fromDate: '2026-09-16', days: 28 })).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get()).toBe(before);
  });

  it('detects overlaps including cleaning time', () => {
    const s = db.prepare('SELECT hall_id, start_time, end_time FROM sessions LIMIT 1').get();
    const tenMinutesAfterEnd = new Date(new Date(s.end_time).getTime() + 10 * 60000);
    expect(
      findOverlap(db, {
        hallId: s.hall_id,
        start: tenMinutesAfterEnd.toISOString(),
        end: new Date(tenMinutesAfterEnd.getTime() + 3600000).toISOString(),
      }),
    ).not.toBeNull();
    expect(
      findOverlap(db, {
        hallId: s.hall_id,
        start: '2030-01-01T10:00:00.000Z',
        end: '2030-01-01T12:00:00.000Z',
      }),
    ).toBeNull();
  });

  it('finds movies by title in any language, director and without diacritics', () => {
    const find = (q) =>
      searchMovieIds(db, q).map((id) =>
        db.prepare('SELECT original_title FROM movies WHERE id = ?').pluck().get(id),
      );
    expect(find('ржав')).toEqual(['Rust Sky']);
    expect(find('roostes')).toEqual(['Rust Sky']);
    expect(find('mura')).toEqual(['Static']);
    expect(find('Müra')).toEqual(['Static']);
    expect(find('marta kivi')).toEqual(['The Last Reel']);
    expect(find('zzz')).toEqual([]);
  });

  it('generates demo posters', () => {
    expect(demoPosterSvg('rust-sky')).toContain('<svg');
    expect(demoPosterSvg('unknown')).toBeNull();
  });
});
