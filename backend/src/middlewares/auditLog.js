/**
 * Middleware untuk mencatat setiap panggilan API masuk (inbound) ke tabel ApiLog.
 * Dipasang di route V2 (merchant API) dan callback (Macrodroid / HTTP detector).
 * Fire-and-forget — tidak blocking response.
 */
import { prisma } from "../config/db.js";

export function auditLog(req, res, next) {
  const started = Date.now();

  res.on("finish", () => {
    const merchantId =
      req.merchant?.id ?? req.params?.merchantId ?? null;

    // Abaikan log untuk route yang tidak relevan (health, branding, etc.)
    // agar tabel tidak penuh noise.
    const path = req.originalUrl ?? req.url;
    if (path === "/health" || path.startsWith("/branding")) return;

    prisma.apiLog
      .create({
        data: {
          merchantId,
          method: req.method,
          path,
          statusCode: res.statusCode,
          ip: req.ip ?? req.socket?.remoteAddress ?? null,
          userAgent: req.headers["user-agent"] ?? null,
          durationMs: Date.now() - started,
        },
      })
      .catch(() => {
        // silent — audit log failure tidak boleh mengganggu request.
      });
  });

  next();
}
