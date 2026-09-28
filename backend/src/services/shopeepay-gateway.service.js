import { prisma } from "../config/db.js";
import { logger } from "../config/logger.js";
import { decryptApiKey } from "../utils/crypto.js";
import { isValidQris } from "../utils/qris-builder.js";
import { badRequest } from "../utils/errors.js";
import { dispatchPaymentSuccess } from "./webhook.service.js";

const SETTING_ID = "default";
const HTTP_TIMEOUT_MS = 10_000;
const CHECK_COOLDOWN_MS = 10_000;
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
 * Resolve shopeepay URL + API key. Merchant custom config menang over global.
 * @param {{ shopeepayGatewayUrl?: string|null, shopeepayGatewayApiKeyEncrypted?: string|null }} [merchant]
 */
export async function resolveGatewayConfig(merchant) {
  if (merchant?.shopeepayGatewayUrl && merchant?.shopeepayGatewayApiKeyEncrypted) {
    const apiKey = decryptApiKey(merchant.shopeepayGatewayApiKeyEncrypted);
    if (apiKey) {
      return {
        url: normalizeGatewayUrl(merchant.shopeepayGatewayUrl),
        apiKey,
        source: "merchant",
      };
    }
  }

  const settings = await prisma.appSetting.findUnique({
    where: { id: SETTING_ID },
    select: {
      shopeepayGatewayUrl: true,
      shopeepayGatewayApiKeyEncrypted: true,
    },
  });
  if (settings?.shopeepayGatewayUrl && settings?.shopeepayGatewayApiKeyEncrypted) {
    const apiKey = decryptApiKey(settings.shopeepayGatewayApiKeyEncrypted);
    if (apiKey) {
      return {
        url: normalizeGatewayUrl(settings.shopeepayGatewayUrl),
        apiKey,
        source: "global",
      };
    }
  }
  return null;
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
 * Ambil QRIS statis dari instance qris-shopeepay (endpoint GET /qris-static).
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
 * Resolve config (custom URL/key jika diberikan, else merchant, else global)
 * lalu fetch QRIS statis dan validasi CRC. Throw badRequest dengan pesan jelas
 * jika gateway tidak terkonfigurasi / QRIS_STATIC kosong / QRIS tidak valid.
 *
 * @param {{ shopeepayGatewayUrl?: string|null, shopeepayGatewayApiKey?: string|null }} [input]
 * @param {{ shopeepayGatewayUrl?: string|null, shopeepayGatewayApiKeyEncrypted?: string|null }} [merchant]
 * @returns {Promise<{ staticQris: string, source: string }>}
 */
export async function fetchStaticQrisForInput(input = {}, merchant = null) {
  let cfg;
  let source = "global";

  if (input.shopeepayGatewayUrl && input.shopeepayGatewayApiKey) {
    cfg = {
      url: normalizeGatewayUrl(input.shopeepayGatewayUrl),
      apiKey: input.shopeepayGatewayApiKey,
      source: "merchant",
    };
  } else {
    cfg = await resolveGatewayConfig(merchant);
  }

  if (!cfg) {
    throw badRequest(
      "Gateway ShopeePay belum dikonfigurasi. Isi URL & API key gateway dulu."
    );
  }
  source = cfg.source ?? source;

  const result = await fetchStaticQris(cfg.url, cfg.apiKey);
  if (!result.ok) {
    const msg = result.body?.error || result.body?.message || `HTTP ${result.status}`;
    throw badRequest(
      `Gagal mengambil QRIS statis dari gateway ShopeePay (${msg}). Pastikan QRIS_STATIC diisi di .env gateway.`
    );
  }

  const staticQris = String(result.body?.data?.qris_static ?? "").trim();
  if (!staticQris) {
    throw badRequest(
      "Gateway ShopeePay belum memiliki QRIS_STATIC. Isi QRIS_STATIC di .env gateway."
    );
  }
  if (!isValidQris(staticQris)) {
    throw badRequest(
      "QRIS statis dari gateway tidak valid (CRC check gagal). Periksa QRIS_STATIC di .env gateway."
    );
  }

  return { staticQris, source };
}

/**
 * Test koneksi ke gateway: panggil /token-status lalu laporkan status token.
 * Endpoint ini butuh SHOPEE_TOKEN aktif di gateway supaya jawabannya bermakna.
 */
export async function testGatewayConnection(url, apiKey) {
  const normalized = normalizeGatewayUrl(url);
  if (!normalized || !apiKey) {
    return {
      success: false,
      tokenStatus: null,
      message: "URL gateway dan API key wajib diisi",
    };
  }
  try {
    const result = await gatewayFetch(normalized, apiKey, {
      method: "GET",
      path: "token-status",
    });
    const data = result.json?.data ?? result.json;
    const tokenStatus = data?.token_status ?? null;
    const message =
      data?.message ||
      result.json?.error ||
      result.json?.message ||
      (result.ok ? "Koneksi berhasil" : `HTTP ${result.status}`);
    return {
      success: result.ok && result.json?.success !== false && tokenStatus !== "invalid",
      tokenStatus,
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

/**
 * Hit qris-shopeepay /check-payment lalu claim tx jadi PAID secara atomik.
 *
 * Kunci pencocokan adalah `tx.totalAmount` (= amount + fee + uniqueDigit),
 * yang dijamin unik antar transaksi PENDING satu merchant oleh partial unique
 * index Transaction_merchantId_totalAmount_pending_unique. Jadi nominal yang
 * dikirim ke gateway sudah mengunci transaksi tertentu — tidak perlu trx_id.
 *
 * @param {object} tx - baris Transaction
 * @param {object} [merchant] - baris Merchant
 */
export async function checkShopeepayPayment(tx, merchant) {
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
      { type: "shopeepay.not-configured", merchantId: merchant?.id, txId: tx.id },
      "[shopeepay] gateway URL/API key belum dikonfigurasi"
    );
    return { skipped: true, reason: "not_configured" };
  }

  markChecked(tx.id);

  // startTime = saat transaksi dibuat, dipotong 5 menit untuk menyerap selisih
  // jam server gateway vs gateway ini.
  const createdAtSec = Math.floor(
    (tx.createdAt ? new Date(tx.createdAt).getTime() : Date.now()) / 1000
  );
  const startTime = createdAtSec - 300;

  let result;
  try {
    result = await gatewayFetch(cfg.url, cfg.apiKey, {
      method: "POST",
      path: "check-payment",
      body: { amount: tx.totalAmount, startTime },
    });
  } catch (err) {
    logger.warn(
      { err, type: "shopeepay.check-error", txId: tx.id, merchantId: merchant?.id },
      "[shopeepay] gagal hit /check-payment"
    );
    return { skipped: true, reason: "gateway_error", error: err.message };
  }

  // Gateway balas { success, paid, transaction }. paid:true hanya kalau ada
  // transaksi SUCCEED dengan nominal cocok di dalam jendela waktu.
  const paid = result.json?.paid === true && result.json?.success !== false;
  if (!paid) {
    if (result.status >= 400 || result.json?.success === false) {
      logger.warn(
        {
          type: "shopeepay.gateway-rejected",
          txId: tx.id,
          status: result.status,
          error: result.json?.error,
        },
        "[shopeepay] gateway menolak /check-payment"
      );
    }
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
      matchedBy: "shopeepay-gateway",
    },
  });

  if (claimed.count !== 1) {
    logger.info(
      { type: "shopeepay.lost-race", txId: tx.id },
      "[shopeepay] transaksi sudah diklaim jalur lain"
    );
    return { matched: true, lostRace: true };
  }

  logger.info(
    {
      type: "shopeepay.paid",
      transactionId: tx.id,
      merchantId: merchant?.id,
      amount: tx.totalAmount,
      gatewayTx: result.json?.transaction ?? null,
    },
    "[shopeepay] transaksi marked PAID — dispatching webhook"
  );

  await dispatchPaymentSuccess(tx.id);
  return { matched: true, transactionId: tx.id };
}

/** On-demand refresh dipakai oleh GET /v2/payment-status. */
export async function maybeRefreshFromShopeepay(tx, merchant) {
  if (!tx || !merchant || merchant.qrisMode !== "SHOPEEPAY") return tx;
  const result = await checkShopeepayPayment(tx, merchant);
  if (!result?.matched || result.lostRace) return tx;
  const fresh = await prisma.transaction.findUnique({ where: { id: tx.id } });
  return fresh ?? tx;
}

export async function pollPendingShopeepayTransactions() {
  const pending = await prisma.transaction.findMany({
    where: {
      status: "PENDING",
      expiresAt: { gt: new Date() },
      merchant: { qrisMode: "SHOPEEPAY", status: "ACTIVE" },
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
      const result = await checkShopeepayPayment(tx, tx.merchant);
      if (result?.matched && !result.lostRace) matched += 1;
    } catch (err) {
      logger.warn({ err, txId: tx.id }, "[shopeepay] poll item failed");
    }
  }
  return { scanned: pending.length, matched };
}

export { normalizeGatewayUrl, gatewayFetch, HTTP_TIMEOUT_MS };
