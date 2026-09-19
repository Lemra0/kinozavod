import { CINEMA, addDays, formatPrice as sharedFormatPrice } from '@kinozavod/shared';

const INTL_LOCALE = { en: 'en-GB', ru: 'ru-RU', et: 'et-EE' };

export const intlLocale = (lang) => INTL_LOCALE[lang] ?? 'en-GB';

function dateFromString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** "Today", "Tomorrow" or "Fri, 18 Sep". */
export function formatDayLabel(dateStr, today, lang, t) {
  if (dateStr === today) return t('common.today');
  if (dateStr === addDays(today, 1)) return t('common.tomorrow');
  return new Intl.DateTimeFormat(intlLocale(lang), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(dateFromString(dateStr));
}

/** "Wednesday, 16 September". */
export function formatLongDate(dateStr, lang) {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(dateFromString(dateStr));
}

export function formatReleaseDate(dateStr, lang) {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dateFromString(dateStr));
}

export function formatTime(iso, lang) {
  return new Intl.DateTimeFormat(intlLocale(lang), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: CINEMA.timezone,
  }).format(new Date(iso));
}

export function formatDuration(minutes, t) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t('common.minutes', { m });
  return t('common.hoursMinutes', { h, m });
}

export const formatPrice = (cents, lang) => sharedFormatPrice(cents, intlLocale(lang));

export function hallNumber(code) {
  return String(code ?? '')
    .replace(/\D/g, '')
    .padStart(2, '0');
}

export function languageName(code, lang) {
  try {
    return new Intl.DisplayNames([intlLocale(lang)], { type: 'language' }).of(code);
  } catch {
    return code.toUpperCase();
  }
}
