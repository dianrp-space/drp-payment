import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as detectionService from "../services/detection.service.js";
import { prisma } from "../config/db.js";
import { safeEqualHex } from "../utils/crypto.js";
import { unauthorized, notFound } from "../utils/errors.js";
import { logger } from "../config/logger.js";

const callbackSchema = z
  .object({
    // Pre-parsed amount (opsional). Bisa datang sebagai string dari query.
    amount: z.coerce.number().int().positive().optional(),
    // Identitas app e-wallet / m-banking (utk debug/logging)
    app: z.string().max(100).optional(),
    package: z.string().max(200).optional(),
    // Isi notifikasi (salah satu wajib ada kalau amount gak dikasih)
    title: z.string().max(500).optional(),
    text: z.string().max(2000).optional(),
    bigText: z.string().max(2000).optional(),
    summary: z.string().max(500).optional(),
    ticker: z.string().max(500).optional(),
    // Status notifikasi dari Macrodroid: "paid" = pembayaran masuk.
    // Selain paid (mis. "pending"/"failed"/"refund") akan di-skip.
    // Kosong = tetap diproses (backward compat dgn payload lama tanpa status).
    status: z.string().max(50).optional(),
    // Optional metadata dari macrodroid
    timestamp: z.union([z.string(), z.number()]).optional(),
    device: z.string().max(100).optional(),
  })
  .refine(
    (d) => d.amount || d.title || d.text || d.bigText || d.summary || d.ticker,
    { message: "Either `amount` or a notification text field is required" }
  );

/**
 * Normalisasi input callback dari Macrodroid.
 *
 * Macrodroid bisa kirim data via JSON body (field camelCase) ATAU via query
 * string (field snake_case `notif_*`). Helper ini menggabungkan keduanya:
 * query dipakai sebagai fallback untuk field yang tidak ada di body.
 *
 * Mapping query → field:
 *   notif_text    -> text
 *   notif_app     -> app
 *   notif_title   -> title
 *   notif_big_text-> bigText
 *   notif_summary -> summary
 *   notif_ticker  -> ticker
 *   status        -> status
 *   timestamp     -> timestamp
 *   amount        -> amount
 *   device        -> device
 *
 * @param {import("express").Request} req
 * @returns {Record<string, unknown>}
 */
function normalizeCallbackInput(req) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const q = req.query || {};

  const pick = (key, ...aliases) => {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      return body[key];
    }
    // Cek alias query, lalu canonical key di query sebagai fallback terakhir
    // (supaya ?status=paid & ?notif_status=paid sama-sama kebaca).
    const tryKeys = [...aliases, key];
    for (const alias of tryKeys) {
      const v = q[alias];
      if (v !== undefined && v !== null && v !== "") {
        return Array.isArray(v) ? v[0] : v;
      }
    }
    return undefined;
  };

  return {
    amount: pick("amount"),
    app: pick("app", "notif_app"),
    package: pick("package", "notif_package", "package_name"),
    title: pick("title", "notif_title"),
    text: pick("text", "notif_text"),
    bigText: pick("bigText", "notif_big_text", "notif_bigtext"),
    summary: pick("summary", "notif_summary"),
    ticker: pick("ticker", "notif_ticker"),
    status: pick("status", "notif_status", "payment_status"),
    timestamp: pick("timestamp", "notif_time", "notification_time"),
    device: pick("device", "notif_device"),
  };
}

/**
 * @openapi
 * /v2/callback:
 *   post:
 *     tags: [Internal]
 *     summary: Payment notification callback (global, from Macrodroid / detector)
 *     description: |
 *       Dipanggil oleh aplikasi pendeteksi (Macrodroid) setiap kali notifikasi
 *       masuk dari e-wallet / m-banking. Server akan parse nominal, cocokkan
 *       ke PENDING transaction (lintas merchant), dan trigger webhook ke merchant.
 *
 *       **Auth**: kirim header `X-Internal-Token: <INTERNAL_TOKEN>`.
 *       Untuk callback per-merchant, lihat `POST /v2/callback/:merchantId`.
 *
 *       Input diterima dari **JSON body** (field camelCase) maupun **query
 *       string** (field snake_case `notif_*`). Macrodroid biasanya kirim via
 *       query string. Contoh:
 *       `POST /v2/callback?notif_text=Anda+menerima+Rp25.711&notif_app=GoPay&status=paid`
 *
 *       Jika `status` diberikan dan bukan `paid` (mis. "pending"), notifikasi
 *       di-skip (HTTP 202, `matched:false`, `reason:"status-not-paid"`).
 *     security:
 *       - internalAuth: []
 *     parameters:
 *       - in: query
 *         name: notif_text
 *         schema: { type: string }
 *         description: Isi notifikasi (berisi nominal)
 *       - in: query
 *         name: notif_app
 *         schema: { type: string }
 *       - in: query
 *         name: notif_title
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, example: paid }
 *       - in: query
 *         name: timestamp
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount: { type: integer }
 *               app: { type: string }
 *               title: { type: string }
 *               text: { type: string }
 *               status: { type: string }
 *               timestamp: { type: string }
 *     responses:
 *       200:
 *         description: Notification processed (matched or not)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 matched: { type: boolean }
 *                 transactionId: { type: string, nullable: true }
 *                 amount: { type: integer, nullable: true }
 *                 source: { type: string }
 *                 reason: { type: string, nullable: true }
 */
export const handleCallback = asyncHandler(async (req, res) => {
  logger.info(
    {
      type: "callback.global.hit",
      ip: req.ip,
      ua: req.headers["user-agent"],
      method: req.method,
      query: req.query,
      body: req.body,
    },
    "[callback] incoming /v2/callback"
  );

  const parsed = callbackSchema.parse(normalizeCallbackInput(req));
  logger.info(
    {
      type: "callback.global.normalized",
      app: parsed.app,
      status: parsed.status,
      amount: parsed.amount,
      text: parsed.text?.slice(0, 200),
      title: parsed.title,
    },
    "[callback] normalized input"
  );

  if (parsed.status && parsed.status.toLowerCase() !== "paid") {
    logger.info(
      { type: "callback.global.skip", reason: "status-not-paid", status: parsed.status },
      "[callback] skip: status not paid"
    );
    return res.status(202).json({
      matched: false,
      transactionId: null,
      amount: null,
      source: "unknown",
      candidates: [],
      reason: "status-not-paid",
      status: parsed.status,
    });
  }

  const result = await detectionService.processNotification(parsed);
  logger.info(
    {
      type: "callback.global.result",
      matched: result.matched,
      transactionId: result.transactionId,
      amount: result.amount,
      source: result.source,
      provider: result.provider,
      candidates: result.candidates,
    },
    "[callback] detection result"
  );

  res.status(result.matched ? 200 : 202).json({
    matched: result.matched,
    transactionId: result.transactionId ?? null,
    amount: result.amount ?? null,
    source: result.source,
    provider: result.provider ?? null,
    candidates: result.candidates,
  });
});

/**
 * @openapi
 * /v2/callback/{merchantId}:
 *   post:
 *     tags: [Internal]
 *     summary: Payment notification callback (per-merchant, from Macrodroid)
 *     description: |
 *       Sama seperti `POST /v2/callback` tetapi hanya mencocokkan transaksi
 *       PENDING milik merchant `{merchantId}`. Dipakai kalau tiap merchant
 *       punya HP pendeteksi / konfigurasi Macrodroid sendiri.
 *
 *       **Auth**: kirim header `X-Callback-Token: <merchant.callbackToken>`.
 *       Token ini di-generate saat merchant dibuat & bisa dirotasi dari dashboard.
 *
 *       Input diterima dari JSON body maupun query string (field `notif_*`).
 *     security:
 *       - callbackAuth: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: notif_text
 *         schema: { type: string }
 *       - in: query
 *         name: notif_app
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, example: paid }
 *     responses:
 *       200:
 *         description: Notification processed (matched or not)
 *       401: { description: "Missing/invalid X-Callback-Token" }
 *       404: { description: "Merchant not found or callback not configured" }
 */
export const handleMerchantCallback = asyncHandler(async (req, res) => {
  logger.info(
    {
      type: "callback.merchant.hit",
      merchantId: req.params.merchantId,
      ip: req.ip,
      ua: req.headers["user-agent"],
      method: req.method,
      query: req.query,
      body: req.body,
      hasCallbackToken: !!req.headers["x-callback-token"],
    },
    "[callback] incoming /v2/callback/:merchantId"
  );

  const merchant = await prisma.merchant.findUnique({
    where: { id: req.params.merchantId },
    select: { id: true, callbackToken: true, status: true },
  });
  if (!merchant) {
    logger.warn(
      { type: "callback.merchant.404", merchantId: req.params.merchantId },
      "[callback] merchant not found"
    );
    throw notFound("Merchant not found");
  }
  if (!merchant.callbackToken) {
    logger.warn(
      { type: "callback.merchant.no-token", merchantId: req.params.merchantId },
      "[callback] callback not configured for merchant"
    );
    throw notFound("Callback belum dikonfigurasi untuk merchant ini");
  }

  const token = req.headers["x-callback-token"];
  const presented = Array.isArray(token) ? token[0] : token;
  if (!presented) {
    logger.warn(
      { type: "callback.merchant.401", merchantId: merchant.id, reason: "missing-header" },
      "[callback] missing X-Callback-Token"
    );
    throw unauthorized("Missing X-Callback-Token header");
  }

  const a = Buffer.from(presented, "utf8").toString("hex");
  const b = Buffer.from(merchant.callbackToken, "utf8").toString("hex");
  if (!safeEqualHex(a, b)) {
    logger.warn(
      { type: "callback.merchant.401", merchantId: merchant.id, reason: "invalid-token" },
      "[callback] invalid X-Callback-Token"
    );
    throw unauthorized("Invalid callback token");
  }
  logger.info(
    { type: "callback.merchant.authed", merchantId: merchant.id },
    "[callback] token OK"
  );

  const parsed = callbackSchema.parse(normalizeCallbackInput(req));
  logger.info(
    {
      type: "callback.merchant.normalized",
      merchantId: merchant.id,
      app: parsed.app,
      status: parsed.status,
      amount: parsed.amount,
      text: parsed.text?.slice(0, 200),
      title: parsed.title,
    },
    "[callback] normalized input"
  );

  if (parsed.status && parsed.status.toLowerCase() !== "paid") {
    logger.info(
      {
        type: "callback.merchant.skip",
        merchantId: merchant.id,
        reason: "status-not-paid",
        status: parsed.status,
      },
      "[callback] skip: status not paid"
    );
    return res.status(202).json({
      matched: false,
      transactionId: null,
      amount: null,
      source: "unknown",
      candidates: [],
      reason: "status-not-paid",
      status: parsed.status,
    });
  }

  const result = await detectionService.processNotification(parsed, merchant.id);
  logger.info(
    {
      type: "callback.merchant.result",
      merchantId: merchant.id,
      matched: result.matched,
      transactionId: result.transactionId,
      amount: result.amount,
      source: result.source,
      provider: result.provider,
      candidates: result.candidates,
    },
    "[callback] detection result"
  );

  res.status(result.matched ? 200 : 202).json({
    matched: result.matched,
    transactionId: result.transactionId ?? null,
    amount: result.amount ?? null,
    source: result.source,
    provider: result.provider ?? null,
    candidates: result.candidates,
  });
});
