/** Standard HTTP error with status code & machine-readable code. */
export class HttpError extends Error {
  constructor(statusCode, message, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg = "Bad request", details = null) =>
  new HttpError(400, msg, "BAD_REQUEST", details);

export const unauthorized = (msg = "Unauthorized") =>
  new HttpError(401, msg, "UNAUTHORIZED");

export const forbidden = (msg = "Forbidden") =>
  new HttpError(403, msg, "FORBIDDEN");

export const notFound = (msg = "Not found") =>
  new HttpError(404, msg, "NOT_FOUND");

export const conflict = (msg = "Conflict") =>
  new HttpError(409, msg, "CONFLICT");

export const unprocessable = (msg = "Unprocessable entity", details = null) =>
  new HttpError(422, msg, "UNPROCESSABLE_ENTITY", details);
