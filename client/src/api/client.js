/** Error thrown for non-2xx API responses. `code` matches the server error code. */
export class ApiRequestError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Small fetch wrapper for the KINOZAVOD API. Sends CSRF header on unsafe methods. */
export async function apiFetch(path, { method = 'GET', body, signal, formData } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method)) {
    const csrf = readCookie('kz_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  const res = await fetch(`/api${path}`, {
    method,
    signal,
    credentials: 'same-origin',
    headers,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      data?.error?.code ?? 'HTTP_ERROR',
      data?.error?.message ?? res.statusText,
      data?.error?.details,
    );
  }

  return data;
}
