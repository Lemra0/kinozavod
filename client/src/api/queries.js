import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiFetch } from './client.js';

function toQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  return search.toString();
}

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: ({ signal }) => apiFetch('/meta', { signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSchedule({ date, hall, format }) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useQuery({
    queryKey: ['schedule', { date, hall, format, lang }],
    queryFn: ({ signal }) =>
      apiFetch(`/schedule?${toQuery({ date, hall, format, lang })}`, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: 60 * 1000,
  });
}

export function useMovies(status) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useQuery({
    queryKey: ['movies', { status, lang }],
    queryFn: ({ signal }) => apiFetch(`/movies?${toQuery({ status, lang })}`, { signal }),
  });
}

export function useHalls() {
  return useQuery({
    queryKey: ['halls'],
    queryFn: ({ signal }) => apiFetch('/halls', { signal }),
    staleTime: 10 * 60 * 1000,
  });
}

export function useMovie(id) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useQuery({
    queryKey: ['movie', { id, lang }],
    queryFn: ({ signal }) => apiFetch(`/movies/${id}?lang=${lang}`, { signal }),
    retry: (count, error) => error.status !== 404 && count < 2,
  });
}

export function useSearchFilters() {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useQuery({
    queryKey: ['search-filters', lang],
    queryFn: ({ signal }) => apiFetch(`/search/filters?lang=${lang}`, { signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSearch(paramsString) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useQuery({
    queryKey: ['search', paramsString, lang],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams(paramsString);
      qs.set('lang', lang);
      return apiFetch(`/search?${qs.toString()}`, { signal });
    },
    placeholderData: keepPreviousData,
  });
}

export async function fetchSuggest(q, lang, signal) {
  return apiFetch(`/search/suggest?q=${encodeURIComponent(q)}&lang=${lang}`, { signal });
}

export function useSeatMap(sessionId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['seats', sessionId],
    queryFn: ({ signal }) => apiFetch(`/sessions/${sessionId}/seats`, { signal }),
    enabled: enabled && Boolean(sessionId),
    // Live updates come over Socket.IO (see useSeatRealtime). A slow poll stays
    // as a safety net in case an event is missed or the socket is down.
    refetchInterval: 60 * 1000,
  });
}

export function useOrder(orderId, token) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useQuery({
    queryKey: ['order', orderId, token, lang],
    queryFn: ({ signal }) =>
      apiFetch(`/orders/${orderId}?token=${encodeURIComponent(token ?? '')}&lang=${lang}`, {
        signal,
      }),
    enabled: Boolean(orderId && token),
    retry: (count, error) => error.status !== 403 && error.status !== 404 && count < 2,
  });
}

export async function fetchBestSeats(sessionId, count, type, signal) {
  const params = new URLSearchParams({ count: String(count) });
  if (type && type !== 'any') params.set('type', type);
  return apiFetch(`/sessions/${sessionId}/best-seats?${params}`, { signal });
}

export async function createOrderRequest(payload) {
  return apiFetch('/orders', { method: 'POST', body: payload });
}

export async function payOrderRequest(orderId, token, cardNumber) {
  return apiFetch(`/orders/${orderId}/pay?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    body: { cardNumber },
  });
}

export async function refundOrderRequest(orderId, token) {
  return apiFetch(`/orders/${orderId}/refund?token=${encodeURIComponent(token)}`, {
    method: 'POST',
  });
}

export async function checkAgeRequest(sessionId, isikukood) {
  return apiFetch('/age-check/demo', { method: 'POST', body: { sessionId, isikukood } });
}

export function useReviews(movieId) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useQuery({
    queryKey: ['reviews', movieId, lang],
    queryFn: ({ signal }) => apiFetch(`/movies/${movieId}/reviews`, { signal }),
    enabled: Boolean(movieId),
  });
}

export const createReviewRequest = (movieId, body) =>
  apiFetch(`/movies/${movieId}/reviews`, { method: 'POST', body });
export const updateReviewRequest = (reviewId, body) =>
  apiFetch(`/reviews/${reviewId}`, { method: 'PATCH', body });
export const deleteReviewRequest = (reviewId) =>
  apiFetch(`/reviews/${reviewId}`, { method: 'DELETE' });
export const myReviewsRequest = (lang) => apiFetch(`/me/reviews?lang=${lang}`);
