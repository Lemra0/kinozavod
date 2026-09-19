import { HALLS, buildSeats } from '../data/halls.js';

/** Creates the three halls and their seats if they do not exist yet. */
export function seedHalls(db) {
  const findHall = db.prepare('SELECT id FROM halls WHERE code = ?');
  const insertHall = db.prepare(
    'INSERT INTO halls (code, name_key, formats, has_zavod_sound) VALUES (?, ?, ?, ?)',
  );
  const insertSeat = db.prepare(
    `INSERT INTO seats (hall_id, row, number, type, grid_x, grid_y, width)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  db.transaction(() => {
    for (const hall of HALLS) {
      if (findHall.get(hall.code)) continue;
      const hallId = insertHall.run(
        hall.code,
        hall.nameKey,
        hall.formats.join(','),
        hall.hasZavodSound ? 1 : 0,
      ).lastInsertRowid;
      for (const seat of buildSeats(hall)) {
        insertSeat.run(
          hallId,
          seat.row,
          seat.number,
          seat.type,
          seat.gridX,
          seat.gridY,
          seat.width,
        );
      }
    }
  })();
}

export function listHalls(db) {
  return db
    .prepare(
      `SELECT h.id, h.code, h.name_key AS nameKey, h.formats, h.has_zavod_sound AS hasZavodSound,
              COUNT(s.id) AS seatsTotal,
              SUM(CASE WHEN s.type = 'sofa' THEN 2 ELSE 1 END) AS viewersTotal
       FROM halls h
       LEFT JOIN seats s ON s.hall_id = h.id AND s.is_active = 1
       GROUP BY h.id
       ORDER BY h.code`,
    )
    .all()
    .map((hall) => ({
      ...hall,
      formats: hall.formats.split(','),
      hasZavodSound: Boolean(hall.hasZavodSound),
    }));
}
