// Reads and writes the search page state as URL query parameters,
// so a search can be shared by link and Back/Forward works.

const CSV_KEYS = new Set(['genres', 'weekdays']);
const BOOL_KEYS = new Set(['zavodSound', 'hasSeats', 'premiumSeats']);

export const DEFAULTS = {
  q: '',
  period: 'all',
  from: '',
  to: '',
  timeBand: '',
  timeFrom: '',
  timeTo: '',
  weekdays: [],
  genres: [],
  format: '',
  hall: '',
  language: '',
  zavodSound: false,
  age: 'all',
  hasSeats: false,
  premiumSeats: false,
  together: 1,
  maxDuration: 0,
  sort: 'time',
  view: 'movies',
  page: 0,
};

export function paramsToState(searchParams) {
  const state = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (!searchParams.has(key)) continue;
    const value = searchParams.get(key);
    if (CSV_KEYS.has(key)) state[key] = value ? value.split(',').map(Number) : [];
    else if (BOOL_KEYS.has(key)) state[key] = value === '1' || value === 'true';
    else if (key === 'together' || key === 'maxDuration' || key === 'page')
      state[key] = Number(value) || DEFAULTS[key];
    else state[key] = value;
  }
  return state;
}

/** Builds the query string for the API and the URL, omitting default values. */
export function stateToParams(state) {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULTS)) {
    const value = state[key];
    const def = DEFAULTS[key];
    if (CSV_KEYS.has(key)) {
      if (value.length) params.set(key, value.join(','));
    } else if (BOOL_KEYS.has(key)) {
      if (value) params.set(key, '1');
    } else if (value !== def && value !== '' && value !== 0) {
      params.set(key, String(value));
    }
  }
  return params;
}

/** Active filters as removable chips (excludes text, sort, view, page). */
export function activeChips(state, { t, genresById }) {
  const chips = [];
  const add = (key, label, reset = DEFAULTS[key]) => chips.push({ key, label, reset });

  if (state.period !== 'all') add('period', t(`search.period.${state.period}`));
  if (state.timeBand) add('timeBand', t(`search.time.${state.timeBand}`));
  if (state.timeFrom || state.timeTo)
    chips.push({
      key: 'time',
      label: `${state.timeFrom || '00:00'}–${state.timeTo || '24:00'}`,
      reset: { timeFrom: '', timeTo: '' },
    });
  if (state.format) add('format', state.format);
  if (state.hall) add('hall', t(`halls.${state.hall}`));
  if (state.language) add('language', state.language.toUpperCase());
  if (state.zavodSound) add('zavodSound', 'ZAVOD SOUND');
  if (state.age !== 'all') add('age', t(`search.age.${state.age}`));
  if (state.hasSeats) add('hasSeats', t('search.seats.available'));
  if (state.premiumSeats) add('premiumSeats', t('search.seats.premium'));
  if (state.together > 1) add('together', t('search.seats.together', { n: state.together }));
  if (state.maxDuration) add('maxDuration', t('search.maxDurationChip', { n: state.maxDuration }));
  for (const id of state.genres)
    chips.push({
      key: `genre-${id}`,
      label: genresById.get(id) ?? '',
      reset: { genres: state.genres.filter((g) => g !== id) },
    });
  for (const day of state.weekdays)
    chips.push({
      key: `weekday-${day}`,
      label: t(`search.weekdayShort.${day}`),
      reset: { weekdays: state.weekdays.filter((d) => d !== day) },
    });
  return chips;
}
