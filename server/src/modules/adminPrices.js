import { ApiError } from '../errors.js';
import { getPriceSettings } from '../settings.js';

const KEYS = {
  seatStandard: 'price.seat.standard',
  seatVip: 'price.seat.vip',
  seatSofa: 'price.seat.sofa',
  surcharge3dPerViewer: 'price.surcharge_3d_per_viewer',
  morningDiscountPerViewer: 'price.morning_discount_per_viewer',
};

/** Updates price settings. Amounts are cents; morningUntil is 'HH:MM'. */
export function updatePrices(db, patch) {
  const set = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  );
  db.transaction(() => {
    for (const [field, key] of Object.entries(KEYS)) {
      if (patch[field] === undefined) continue;
      const value = Number(patch[field]);
      if (!Number.isInteger(value) || value < 0) {
        throw new ApiError(400, 'BAD_PRICE', `Invalid value for ${field}`);
      }
      set.run(key, String(value));
    }
    if (patch.morningUntil !== undefined) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.morningUntil)) {
        throw new ApiError(400, 'BAD_TIME', 'morningUntil must be HH:MM');
      }
      set.run('price.morning_until', patch.morningUntil);
    }
  })();
  return getPriceSettings(db);
}
