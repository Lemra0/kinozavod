// Business constants shared by the server and the client.
// Values come from the project specification (section 9 "Business rules").

export const CINEMA = Object.freeze({
  name: 'KINOZAVOD',
  city: 'Tallinn',
  address: 'Vana-Kinotehase 3, Tallinn',
  timezone: 'Europe/Tallinn',
  currency: 'EUR',
  opensAt: '10:00',
  closesAt: '01:00',
  lastScreeningStartsAt: '23:30',
});

export const LOCALES = Object.freeze(['en', 'ru', 'et']);
export const FALLBACK_LOCALE = 'en';

export const ROLES = Object.freeze({
  USER: 'user',
  CASHIER: 'cashier',
  ADMIN: 'admin',
});

export const SEAT_TYPES = Object.freeze({
  standard: { viewers: 1 },
  vip: { viewers: 1 },
  sofa: { viewers: 2 },
});

export const FORMATS = Object.freeze(['2D', '3D']);

// Estonian film classification.
// "restricted" ratings block online purchase for younger buyers;
// the others only show a recommendation.
export const AGE_RATINGS = Object.freeze({
  PERE: { minAge: 0, restricted: false },
  L: { minAge: 0, restricted: false },
  'MS-6': { minAge: 6, restricted: false },
  'MS-12': { minAge: 12, restricted: false },
  'K-12': { minAge: 12, restricted: true },
  'K-14': { minAge: 14, restricted: true },
  'K-16': { minAge: 16, restricted: true },
});

// All money values are stored in cents.
export const DEFAULT_PRICES = Object.freeze({
  seatStandard: 800,
  seatVip: 1100,
  seatSofa: 1600,
  surcharge3dPerViewer: 200,
  morningDiscountPerViewer: 200,
  morningUntil: '12:00',
});

export const RULES = Object.freeze({
  seatHoldMinutes: 10,
  onlineSalesCloseMinutes: 15,
  refundDeadlineMinutes: 60,
  cleaningMinutes: 15,
  maxSeatsPerOrder: 10,
  checkInOpensMinutes: 60,
  lowSeatsThreshold: 0.15,
  scheduleHorizonDays: 28,
  homeScheduleDays: 7,
  minRegistrationAge: 13,
  adultAge: 18,
  nicknameChangeDays: 30,
  nicknameMinLength: 3,
  nicknameMaxLength: 20,
  tmdbMaxCacheDays: 183,
  avatarMaxBytes: 2 * 1024 * 1024,
  avatarSize: 256,
});

export const MASK_CHAR = '\u2571';
