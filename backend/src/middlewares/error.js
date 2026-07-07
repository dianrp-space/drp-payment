import { ZodError } from "zod";
import { HttpError } from "../utils/errors.js";
import { logger } from "../config/logger.js";

/** 404 handler for unmatched routes. */
export function notFound(_req, res) {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
}

/** Central error handler. */
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  if (err instanceof HttpError) {
    const body = { error: err.message, code: err.code };
    if (err.details) body.details = err.details;
    return res.status(err.statusCode).json(body);
  }

  logger.error({ err }, "Unhandled error");
  return res.status(500).json({ error: "Internal server error", code: "INTERNAL" });
}
