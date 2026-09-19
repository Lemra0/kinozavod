import { apiFetch } from './client.js';

export const staffSessions = (lang) => apiFetch(`/staff/sessions?lang=${lang}`);
export const staffSeatMap = (sessionId, lang) =>
  apiFetch(`/staff/sessions/${sessionId}/seats?lang=${lang}`);
export const staffSell = (payload) => apiFetch('/staff/orders', { method: 'POST', body: payload });
export const staffSearchOrders = (q, lang) =>
  apiFetch(`/staff/orders?q=${encodeURIComponent(q)}&lang=${lang}`);
export const staffOrder = (id, lang) => apiFetch(`/staff/orders/${id}?lang=${lang}`);
export const staffRefund = (id) =>
  apiFetch(`/staff/orders/${id}/refund`, { method: 'POST', body: {} });
export const staffLookupTicket = (code, lang) =>
  apiFetch(`/staff/tickets/${encodeURIComponent(code)}?lang=${lang}`);
export const staffUseTicket = (code) =>
  apiFetch(`/staff/tickets/${encodeURIComponent(code)}/use`, { method: 'POST', body: {} });
export const staffShiftSummary = (date) =>
  apiFetch(`/staff/shift-summary${date ? `?date=${date}` : ''}`);
