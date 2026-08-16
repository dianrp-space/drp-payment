import { Router } from "express";
import { requireInternal } from "../../middlewares/auth.js";
import { handleCallback, handleMerchantCallback } from "../../controllers/callback.controller.js";
import { logger } from "../../config/logger.js";

const router = Router();

/**
 * Log setiap hit ke URL callback SEBELUM auth.
 * Kalau token salah, request tidak masuk handler — tanpa middleware ini
 * tidak ada jejak di pm2 logs.
 */
function logMacrodroidHit(req, res, next) {
  const started = Date.now();
  const q = req.query || {};
  const body = req.body && typeof req.body === "object" ? req.body : {};

  logger.info(
    {
      type: "callback.hit",
      method: req.method,
      path: req.originalUrl ?? req.url,
      ip: req.ip,
      ua: req.headers["user-agent"],
      hasInternalToken: !!req.headers["x-internal-token"],
      hasCallbackToken: !!req.headers["x-callback-token"],
      merchantId: req.params?.merchantId ?? null,
      // Preview aman dari pola Macrodroid (query string)
      notif_app: q.notif_app ?? body.app ?? null,
      notif_text: String(q.notif_text ?? body.text ?? "").slice(0, 160) || null,
      status: q.status ?? body.status ?? null,
      amount: q.amount ?? body.amount ?? null,
    },
    "[callback] Macrodroid hit"
  );

  res.on("finish", () => {
    logger.info(
      {
        type: "callback.done",
        method: req.method,
        path: req.originalUrl ?? req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        merchantId: req.params?.merchantId ?? null,
      },
      "[callback] Macrodroid response"
    );
  });

  next();
}

// Global callback (backward compatible) — auth via X-Internal-Token
router.post("/callback", logMacrodroidHit, requireInternal, handleCallback);

// Per-merchant callback — auth via X-Callback-Token (merchant.callbackToken)
router.post("/callback/:merchantId", logMacrodroidHit, handleMerchantCallback);

// Method selain POST tetap dicatat biar kelihatan di log kalau Macrodroid salah setting
router.all("/callback", logMacrodroidHit, (req, res) => {
  logger.warn(
    { type: "callback.method", method: req.method, path: req.originalUrl },
    "[callback] method not allowed — gunakan POST"
  );
  res.status(405).json({ error: "Method Not Allowed", allow: "POST" });
});
router.all("/callback/:merchantId", logMacrodroidHit, (req, res) => {
  logger.warn(
    {
      type: "callback.method",
      method: req.method,
      path: req.originalUrl,
      merchantId: req.params.merchantId,
    },
    "[callback] method not allowed — gunakan POST"
  );
  res.status(405).json({ error: "Method Not Allowed", allow: "POST" });
});

export default router;
