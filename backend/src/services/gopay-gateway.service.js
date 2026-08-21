import { prisma } from "../config/db.js";
import { logger } from "../config/logger.js";
import { decryptApiKey } from "../utils/crypto.js";
import { isValidQris } from "../utils/qris-builder.js";
import { badRequest } from "../utils/errors.js";
import { dispatchPaymentSuccess } from "./webhook.service.js";

const SETTING_ID = "default";
const CHECK_COOLDOWN_MS = 10_000;
const HTTP_TIMEOUT_MS = 10_000;
const POLL_BATCH_SIZE = 20;

/** @type {Map<string, number>} txId -> last check epoch ms */
const lastCheckedAt = new Map();

export function isCheckCooldownActive(txId) {
  const last = lastCheckedAt.get(txId);
  return last != null && Date.now() - last < CHECK_COOLDOWN_MS;
}

function markChecked(txId) {
  lastCheckedAt.set(txId, Date.now());
  if (lastCheckedAt.size > 2000) {
    const cutoff = Date.now() - CHECK_COOLDOWN_MS * 6;
    for (const [id, ts] of lastCheckedAt) {
      if (ts < cutoff) lastCheckedAt.delete(id);
    }
  }
}

function normalizeGatewayUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

/**
 * Resolve gopay-qris URL + API key. Merchant custom config wins over global.
 * @param {{ gopayGatewayUrl?: string|null, gopayGatewayApiKeyEncrypted?: string|null }} [merchant]
 */
export async function resolveGatewayConfig(merchant) {
  if (merchant?.gopayGatewayUrl && merchant?.gopayGatewayApiKeyEncrypted) {
    const apiKey = decryptApiKey(merchant.gopayGatewayApiKeyEncrypted);
    if (apiKey) {
      return {
        url: normalizeGatewayUrl(merchant.gopayGatewayUrl),
        apiKey,
        source: "merchant",
      };
    }
  }

  const settings = await prisma.appSetting.findUnique({
    where: { id: SETTING_ID },
    select: {
      gopayGatewayUrl: true,
      gopayGatewayApiKeyEncrypted: true,
    },
  });
  if (settings?.gopayGatewayUrl && settings?.gopayGatewayApiKeyEncrypted) {
    const apiKey = decryptApiKey(settings.gopayGatewayApiKeyEncrypted);
    if (apiKey) {
      return {
        url: normalizeGatewayUrl(settings.gopayGatewayUrl),
        apiKey,
        source: "global",
      };
    }
  }

  return null;
}

/**
 * Ambil QRIS statis dari instance gopay-qris.
 * @param {string} url
 * @param {string} apiKey
 */
export async function fetchStaticQris(url, apiKey) {
  try {
    const result = await gatewayFetch(normalizeGatewayUrl(url), apiKey, {
      method: "GET",
      path: "qris-static",
    });
    return {
      ok: result.ok,
      status: result.status,
      body: result.json ?? { success: false, message: result.text?.slice(0, 500) },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      body: {
        success: false,
        message: err.name === "AbortError" ? "timeout (10s)" : err.message,
      },
    };
  }
}

/**
 * Resolve config gateway (custom URL/key jika diberikan, else global/merchant)
 * lalu fetch QRIS statis dan validasi CRC. Throw badRequest dengan pesan jelas
 * jika gateway tidak terkonfigurasi / QRIS_STATIC kosong / QRIS tidak valid.
 *
 * @param {{ gopayGatewayUrl?: string|null, gopayGatewayApiKey?: string|null, merchantId?: string }} input
 * @param {{ gopayGatewayUrl?: string|null, gopayGatewayApiKeyEncrypted?: string|null }} [merchant]
 * @returns {Promise<{ staticQris: string, source: string }>}
 */
export async function fetchStaticQrisForInput(input = {}, merchant = null) {
  let cfg = null;
  let source = "global";

  if (input.gopayGatewayUrl && input.gopayGatewayApiKey) {
    cfg = {
      url: normalizeGatewayUrl(input.gopayGatewayUrl),
      apiKey: input.gopayGatewayApiKey,
      source: "merchant",
    };
  } else if (merchant) {
    cfg = await resolveGatewayConfig(merchant);
  } else {
    cfg = await resolveGatewayConfig(null);
  }

  if (!cfg) {
    throw badRequest(
      "Gateway Gopay belum dikonfigurasi. Isi URL & API key gateway dulu."
    );
  }
  source = cfg.source ?? source;

  const result = await fetchStaticQris(cfg.url, cfg.apiKey);
  if (!result.ok) {
    const msg = result.body?.message || `HTTP ${result.status}`;
    throw badRequest(
      `Gagal mengambil QRIS statis dari gateway Gopay (${msg}). Pastikan QRIS_STATIC diisi di .env gateway dan sesi GoBiz aktif.`
    );
  }

  const staticQris = String(result.body?.data?.qris_static ?? "").trim();
  if (!staticQris) {
    throw badRequest(
      "Gateway Gopay belum memiliki QRIS_STATIC. Isi QRIS_STATIC di .env gateway."
    );
  }
  if (!isValidQris(staticQris)) {
    throw badRequest(
      "QRIS statis dari gateway tidak valid (CRC check gagal). Periksa QRIS_STATIC di .env gateway."
    );
  }

  return { staticQris, source };
}

async function gatewayFetch(url, apiKey, { method = "GET", path, query, body } = {}) {
  const target = new URL(path, url.endsWith("/") ? url : url + "/");
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        target.searchParams.set(k, String(v));
      }
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(target.toString(), {
      method,
      headers: {
        Accept: "application/json",
        "X-Api-Key": apiKey,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Hit gopay-qris /check-payment and atomically mark the tx PAID on match.
 * Respects per-tx cooldown so job + on-demand checks don't burst Gojek API.
 */
export async function checkGopayPayment(tx, merchant) {
  if (!tx || tx.status !== "PENDING") {
    return { skipped: true, reason: "not_pending" };
  }
  if (tx.expiresAt && tx.expiresAt <= new Date()) {
    return { skipped: true, reason: "expired" };
  }
  if (isCheckCooldownActive(tx.id)) {
    return { skipped: true, reason: "cooldown" };
  }

  const cfg = await resolveGatewayConfig(merchant);
  if (!cfg) {
    logger.warn(
      { type: "gopay.not-configured", merchantId: merchant?.id, txId: tx.id },
      "[gopay] gateway URL/API key belum dikonfigurasi"
    );
    return { skipped: true, reason: "not_configured" };
  }

  markChecked(tx.id);

  let result;
  try {
    result = await gatewayFetch(cfg.url, cfg.apiKey, {
      method: "GET",
      path: "check-payment",
      query: {
        amount: tx.totalAmount,
        trx_id: tx.id,
        startTime: tx.createdAt?.toISOString?.() ?? new Date(tx.createdAt).toISOString(),
      },
    });
  } catch (err) {
    logger.warn(
      { err, type: "gopay.check-error", txId: tx.id, merchantId: merchant?.id },
      "[gopay] gagal hit /check-payment"
    );
    return { skipped: true, reason: "gateway_error", error: err.message };
  }

  const paid = result.json?.paid === true && result.json?.success !== false;
  if (!paid) {
    return { matched: false, status: result.status };
  }

  const now = new Date();
  const claimed = await prisma.transaction.updateMany({
    where: {
      id: tx.id,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    data: {
      status: "PAID",
      paidAmount: tx.totalAmount,
      paidAt: now,
      matchedBy: "gopay-gateway",
    },
  });

  if (claimed.count !== 1) {
    logger.info(
      { type: "gopay.lost-race", txId: tx.id },
      "[gopay] transaksi sudah diklaim jalur lain"
    );
    return { matched: true, lostRace: true };
  }

  logger.info(
    {
      type: "gopay.paid",
      transactionId: tx.id,
      merchantId: merchant?.id,
      amount: tx.totalAmount,
      gatewayTx: result.json?.transaction ?? null,
    },
    "[gopay] transaksi marked PAID — dispatching webhook"
  );

  await dispatchPaymentSuccess(tx.id);
  return { matched: true, transactionId: tx.id };
}

/** On-demand refresh used by GET /v2/payment-status. */
export async function maybeRefreshFromGopay(tx, merchant) {
  if (!tx || !merchant || merchant.qrisMode !== "GOPAY") return tx;
  const result = await checkGopayPayment(tx, merchant);
  if (!result?.matched || result.lostRace) return tx;
  const fresh = await prisma.transaction.findUnique({ where: { id: tx.id } });
  return fresh ?? tx;
}

export async function pollPendingGopayTransactions() {
  const pending = await prisma.transaction.findMany({
    where: {
      status: "PENDING",
      expiresAt: { gt: new Date() },
      merchant: { qrisMode: "GOPAY", status: "ACTIVE" },
    },
    include: { merchant: true },
    orderBy: { createdAt: "asc" },
    take: POLL_BATCH_SIZE,
  });

  if (pending.length === 0) {
    return { scanned: 0, matched: 0 };
  }

  let matched = 0;
  for (const tx of pending) {
    try {
      const result = await checkGopayPayment(tx, tx.merchant);
      if (result?.matched && !result.lostRace) matched += 1;
    } catch (err) {
      logger.warn({ err, txId: tx.id }, "[gopay] poll item failed");
    }
  }
  return { scanned: pending.length, matched };
}

export async function testGatewayConnection(url, apiKey) {
  const normalized = normalizeGatewayUrl(url);
  if (!normalized || !apiKey) {
    return {
      success: false,
      message: "URL gateway dan API key wajib diisi",
    };
  }
  try {
    const result = await gatewayFetch(normalized, apiKey, {
      method: "GET",
      path: "token-status",
    });
    const data = result.json?.data ?? result.json;
    const tokenStatus = data?.token_status;
    const message =
      data?.message ||
      result.json?.message ||
      (result.ok ? "Koneksi berhasil" : `HTTP ${result.status}`);
    return {
      success: result.ok && result.json?.success !== false && tokenStatus !== "invalid",
      tokenStatus: tokenStatus ?? null,
      message,
      status: result.status,
    };
  } catch (err) {
    return {
      success: false,
      tokenStatus: "invalid",
      message: err.name === "AbortError" ? "timeout (10s)" : err.message,
    };
  }
}

export async function getGopaySessionStatus(url, apiKey) {
  try {
    const result = await gatewayFetch(normalizeGatewayUrl(url), apiKey, {
      method: "GET",
      path: "login/session-status",
    });
    return {
      ok: result.ok,
      status: result.status,
      body: result.json ?? { success: false, message: result.text?.slice(0, 500) },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      body: {
        success: false,
        message: err.name === "AbortError" ? "timeout (10s)" : err.message,
      },
    };
  }
}

export async function startGopayLogin(url, apiKey) {
  try {
    const result = await gatewayFetch(normalizeGatewayUrl(url), apiKey, {
      method: "POST",
      path: "login/start",
      body: {},
    });
    return {
      ok: result.ok,
      status: result.status,
      body: result.json ?? { success: false, message: result.text?.slice(0, 500) },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      body: {
        success: false,
        message: err.name === "AbortError" ? "timeout (10s)" : err.message,
      },
    };
  }
}

export async function sendGopayLoginInput(url, apiKey, text) {
  try {
    const result = await gatewayFetch(normalizeGatewayUrl(url), apiKey, {
      method: "POST",
      path: "login/input",
      body: { text },
    });
    return {
      ok: result.ok,
      status: result.status,
      body: result.json ?? { success: false, message: result.text?.slice(0, 500) },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      body: {
        success: false,
        message: err.name === "AbortError" ? "timeout (10s)" : err.message,
      },
    };
  }
}

export async function getGopayLoginOutput(url, apiKey, since = 0) {
  try {
    const result = await gatewayFetch(normalizeGatewayUrl(url), apiKey, {
      method: "GET",
      path: "login/output",
      query: { since },
    });
    return {
      ok: result.ok,
      status: result.status,
      body: result.json ?? { success: false, message: result.text?.slice(0, 500) },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      body: {
        success: false,
        message: err.name === "AbortError" ? "timeout (10s)" : err.message,
      },
    };
  }
}
