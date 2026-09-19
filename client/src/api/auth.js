import { apiFetch } from './client.js';

export const registerRequest = (data) => apiFetch('/auth/register', { method: 'POST', body: data });
export const loginRequest = (data) => apiFetch('/auth/login', { method: 'POST', body: data });
export const logoutRequest = () => apiFetch('/auth/logout', { method: 'POST', body: {} });

export const nicknameAvailable = (nickname) =>
  apiFetch(`/auth/nickname-available?nickname=${encodeURIComponent(nickname)}`);

export const updateProfileRequest = (patch) => apiFetch('/me', { method: 'PATCH', body: patch });
export const changePasswordRequest = (data) =>
  apiFetch('/me/password', { method: 'POST', body: data });
export const setGenresRequest = (genres) =>
  apiFetch('/me/genres', { method: 'PUT', body: { genres } });
export const deleteAccountRequest = () => apiFetch('/me', { method: 'DELETE' });
export const myOrdersRequest = (lang) => apiFetch(`/me/orders?lang=${lang}`);
export const myWatchlistRequest = (lang) => apiFetch(`/me/watchlist?lang=${lang}`);
export const addWatchlistRequest = (movieId) =>
  apiFetch(`/me/watchlist/${movieId}`, { method: 'PUT', body: {} });
export const removeWatchlistRequest = (movieId) =>
  apiFetch(`/me/watchlist/${movieId}`, { method: 'DELETE' });

export async function uploadAvatarRequest(file) {
  const form = new FormData();
  form.append('avatar', file);
  return apiFetch('/me/avatar', { method: 'POST', formData: form });
}
export const deleteAvatarRequest = () => apiFetch('/me/avatar', { method: 'DELETE' });

export const demoLoginRequest = (role) =>
  apiFetch(`/auth/demo/${role}`, { method: 'POST', body: {} });
