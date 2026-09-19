import { CINEMA, RULES, addDays, localDate, localTime, zonedTimeToDate } from '@kinozavod/shared';

const TZ = CINEMA.timezone;
const HALL_FIRST_START = { p1: '10:00', p2: '10:20', p3: '11:10' };
const ROUND_MINUTES = 10;

/** Small deterministic random generator, so the same day always gets the same schedule. */
function seededRandom(text) {
  let seed = 0;
  for (const ch of text) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundUp(date, minutes) {
  const step = minutes * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / step) * step);
}

function subtitlesFor(language) {
  return ['et', 'ru', 'en']
    .filter((l) => l !== language)
    .slice(0, 2)
    .join(',');
}

/** Returns an overlapping session in the hall (cleaning time included), or null. */
export function findOverlap(db, { hallId, start, end, excludeId = null }) {
  const cleaningMs = RULES.cleaningMinutes * 60 * 1000;
  const from = new Date(new Date(start).getTime() - cleaningMs).toISOString();
  const to = new Date(new Date(end).getTime() + cleaningMs).toISOString();
  return (
    db
      .prepare(
        `SELECT id, start_time AS startTime, end_time AS endTime FROM sessions
         WHERE hall_id = ? AND status = 'scheduled'
           AND start_time < ? AND end_time > ?
           AND (? IS NULL OR id <> ?)
         LIMIT 1`,
      )
      .get(hallId, to, from, excludeId, excludeId) ?? null
  );
}

/**
 * Generates sessions for every hall and day in [fromDate, fromDate + days).
 * Days that already have sessions in a hall are left untouched.
 */
export function generateSchedule(db, { fromDate, days }) {
  const halls = db.prepare('SELECT id, code, formats FROM halls ORDER BY code').all();
  const moviesOn = db.prepare(
    `SELECT id, duration_min, supports_3d, popularity, original_language
     FROM movies
     WHERE is_archived = 0 AND rental_start <= ?
       AND (rental_end IS NULL OR rental_end >= ?)
     ORDER BY id`,
  );
  const hasSessions = db.prepare(
    'SELECT 1 FROM sessions WHERE hall_id = ? AND start_time >= ? AND start_time < ? LIMIT 1',
  );
  const insert = db.prepare(
    `INSERT INTO sessions (movie_id, hall_id, start_time, end_time, format, language, subtitles)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  let created = 0;

  db.transaction(() => {
    for (let d = 0; d < days; d += 1) {
      const day = addDays(fromDate, d);
      const dayStart = zonedTimeToDate(day, '00:00', TZ).toISOString();
      const dayEnd = zonedTimeToDate(addDays(day, 1), '00:00', TZ).toISOString();
      const movies = moviesOn.all(day, day);
      if (movies.length === 0) continue;

      for (const hall of halls) {
        if (hasSessions.get(hall.id, dayStart, dayEnd)) continue;

        const random = seededRandom(`${day}:${hall.code}`);
        const allows3d = hall.formats.split(',').includes('3D');
        const order = movies
          .map((m) => {
            const boost = hall.code === 'p1' && m.supports_3d ? 1.6 : 1;
            const weight = Math.max(Math.sqrt(m.popularity || 1), 1) * boost;
            return { movie: m, score: weight * (0.35 + random()) };
          })
          .sort((a, b) => b.score - a.score)
          .map((x) => x.movie);

        let time = HALL_FIRST_START[hall.code] ?? '10:00';
        let index = 0;
        let use3d = true;

        while (time <= '23:30') {
          const movie = order[index % order.length];
          index += 1;

          const start = zonedTimeToDate(day, time, TZ);
          const end = new Date(start.getTime() + movie.duration_min * 60 * 1000);
          let format = '2D';
          if (allows3d && movie.supports_3d) {
            format = use3d ? '3D' : '2D';
            use3d = !use3d;
          }

          insert.run(
            movie.id,
            hall.id,
            start.toISOString(),
            end.toISOString(),
            format,
            movie.original_language,
            subtitlesFor(movie.original_language),
          );
          created += 1;

          const next = roundUp(
            new Date(end.getTime() + RULES.cleaningMinutes * 60 * 1000),
            ROUND_MINUTES,
          );
          if (localDate(next, TZ) !== day) break;
          time = localTime(next, TZ);
        }
      }
    }
  })();

  return created;
}

/** Makes sure the schedule covers today and the full planning horizon. */
export function ensureSchedule(db, now = new Date()) {
  const today = localDate(now, TZ);
  return generateSchedule(db, { fromDate: today, days: RULES.scheduleHorizonDays });
}
