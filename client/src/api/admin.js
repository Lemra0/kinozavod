import { apiFetch } from './client.js';

const qs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

// movies
export const adminMovies = (lang) => apiFetch(`/admin/movies?lang=${lang}`);
export const adminUpdateMovie = (id, patch) =>
  apiFetch(`/admin/movies/${id}`, { method: 'PATCH', body: patch });
export const adminArchiveMovie = (id, archived) =>
  apiFetch(`/admin/movies/${id}/archive`, { method: 'POST', body: { archived } });
export const adminRefreshMovie = (id) =>
  apiFetch(`/admin/movies/${id}/refresh`, { method: 'POST', body: {} });
export const adminTmdbSearch = (q) => apiFetch(`/admin/tmdb/search?q=${encodeURIComponent(q)}`);
export const adminTmdbImport = (tmdbId) =>
  apiFetch('/admin/tmdb/import', { method: 'POST', body: { tmdbId } });

// prices
export const adminPrices = () => apiFetch('/admin/prices');
export const adminUpdatePrices = (patch) =>
  apiFetch('/admin/prices', { method: 'PATCH', body: patch });

// halls
export const adminHalls = () => apiFetch('/admin/halls');

// sessions
export const adminSessions = (date, lang) => apiFetch(`/admin/sessions?${qs({ date, lang })}`);
export const adminCreateSession = (body) => apiFetch('/admin/sessions', { method: 'POST', body });
export const adminBulkSessions = (body) =>
  apiFetch('/admin/sessions/bulk', { method: 'POST', body });
export const adminCancelSession = (id) =>
  apiFetch(`/admin/sessions/${id}/cancel`, { method: 'POST', body: {} });

// users
export const adminUsers = (q) => apiFetch(`/admin/users?${qs({ q })}`);
export const adminUpdateUser = (id, patch) =>
  apiFetch(`/admin/users/${id}`, { method: 'PATCH', body: patch });

// reviews
export const adminReviews = (lang, onlyHate) =>
  apiFetch(`/admin/reviews?${qs({ lang, onlyHate: onlyHate ? 1 : '' })}`);
export const adminHideReview = (id, hidden) =>
  apiFetch(`/admin/reviews/${id}/hide`, { method: 'POST', body: { hidden } });

// word filter
export const adminWordFilter = () => apiFetch('/admin/word-filter');
export const adminAddWord = (body) => apiFetch('/admin/word-filter', { method: 'POST', body });
export const adminRemoveWord = (id) => apiFetch(`/admin/word-filter/${id}`, { method: 'DELETE' });
export const adminTestWord = (text) =>
  apiFetch('/admin/word-filter/test', { method: 'POST', body: { text } });
