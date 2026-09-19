/** Reads the price settings stored in the `settings` table. */
export function getPriceSettings(db) {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'price.%'").all();
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    seatStandard: Number(map['price.seat.standard']),
    seatVip: Number(map['price.seat.vip']),
    seatSofa: Number(map['price.seat.sofa']),
    surcharge3dPerViewer: Number(map['price.surcharge_3d_per_viewer']),
    morningDiscountPerViewer: Number(map['price.morning_discount_per_viewer']),
    morningUntil: map['price.morning_until'],
  };
}
