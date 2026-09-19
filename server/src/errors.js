/**
 * Error with a stable machine-readable code.
 * The client translates `code`; `message` is a fallback for developers.
 */
export class ApiError extends Error {
  constructor(status, code, message = code, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
