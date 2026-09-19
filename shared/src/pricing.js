import { SEAT_TYPES } from './constants.js';

/**
 * Ticket price in cents.
 * The 3D surcharge and the morning discount apply per viewer,
 * so a sofa (two viewers) gets them twice.
 */
export function seatPrice({ seatType, format, localStartTime, prices }) {
  const base = {
    standard: prices.seatStandard,
    vip: prices.seatVip,
    sofa: prices.seatSofa,
  }[seatType];

  if (base === undefined) throw new Error(`Unknown seat type: ${seatType}`);

  const viewers = SEAT_TYPES[seatType].viewers;
  let price = base;
  if (format === '3D') price += prices.surcharge3dPerViewer * viewers;
  if (localStartTime < prices.morningUntil) price -= prices.morningDiscountPerViewer * viewers;
  return Math.max(price, 0);
}

/** Formats cents as a price string, e.g. 1650 → "16.50 €" (locale-aware). */
export function formatPrice(cents, locale = 'en') {
  return new Intl.NumberFormat(locale === 'en' ? 'en-IE' : locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
