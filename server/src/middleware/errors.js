import { ZodError } from 'zod';
import { ApiError } from '../errors.js';

export function notFoundHandler(_req, _res, next) {
  next(new ApiError(404, 'NOT_FOUND', 'Route not found'));
}

// Express recognises error handlers by their four arguments, so `_next` must stay.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    const body = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
    return res.status(err.status).json(body);
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'INVALID_BODY', message: 'Invalid request body', details: err.issues },
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } });
  }

  console.error(err);
  return res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server' } });
}
