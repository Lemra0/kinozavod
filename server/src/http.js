import { LOCALES, FALLBACK_LOCALE } from '@kinozavod/shared';
import { ApiError } from './errors.js';

/** Language from ?lang=, falling back to English. */
export function langOf(req) {
  const lang = String(req.query.lang ?? '');
  return LOCALES.includes(lang) ? lang : FALLBACK_LOCALE;
}

/** Validates query parameters with a zod schema. */
export function parseQuery(schema, req) {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw new ApiError(400, 'INVALID_QUERY', 'Invalid query parameters', result.error.issues);
  }
  return result.data;
}

export function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  return id;
}
