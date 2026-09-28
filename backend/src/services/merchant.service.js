import { prisma } from "../config/db.js";
import {
  generateApiKey,
  generateWebhookSecret,
  encryptApiKey,
  decryptApiKey,
} from "../utils/crypto.js";
import { randomBytes } from "node:crypto";
import { isValidQris } from "../utils/qris-builder.js";
import { parseQrisFromImage } from "../utils/qris-parser.js";
import { conflict, badRequest, notFound } from "../utils/errors.js";
import { assertSafeWebhookUrl } from "../utils/ssrf.js";
import * as gopayGateway from "./gopay-gateway.service.js";
import * as shopeepayGateway from "./shopeepay-gateway.service.js";

/** Generate a per-merchant Macrodroid callback token. */
function generateCallbackToken() {
  return "drp_cb_" + randomBytes(24).toString("hex");
}

function maskSecretHint(raw) {
  if (!raw) return null;
  const s = String(raw);
  return "...." + s.slice(-4).toUpperCase();
}

export function gopayPublicFields(merchant) {
  const rawKey = decryptApiKey(merchant.gopayGatewayApiKeyEncrypted);
  return {
    qrisMode: merchant.qrisMode ?? "OTHERS",
    gopayGatewayUrl: merchant.gopayGatewayUrl ?? null,
    hasGopayGatewayApiKey: !!merchant.gopayGatewayApiKeyEncrypted,
    gopayGatewayApiKeyHint: maskSecretHint(rawKey),
  };
}

export function shopeepayPublicFields(merchant) {
  const rawKey = decryptApiKey(merchant.shopeepayGatewayApiKeyEncrypted);
  return {
    shopeepayGatewayUrl: merchant.shopeepayGatewayUrl ?? null,
    hasShopeepayGatewayApiKey: !!merchant.shopeepayGatewayApiKeyEncrypted,
    shopeepayGatewayApiKeyHint: maskSecretHint(rawKey),
  };
}

function normalizeOptionalUrl(url) {
  if (url === undefined) return undefined;
  if (url === null) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  assertSafeWebhookUrl(trimmed);
  return trimmed.replace(/\/+$/, "");
}

function applyGopayConfig(payload, input, { isCreate = false, existing = null } = {}) {
  const qrisMode = input.qrisMode ?? (isCreate ? "OTHERS" : undefined);
  if (qrisMode !== undefined) payload.qrisMode = qrisMode;

  const nextMode = qrisMode ?? existing?.qrisMode ?? "OTHERS";
  if (nextMode === "OTHERS") {
    if (isCreate || input.qrisMode !== undefined) {
      payload.gopayGatewayUrl = null;
      payload.gopayGatewayApiKeyEncrypted = null;
    }
    return;
  }

  if (input.gopayGatewayUrl !== undefined) {
    payload.gopayGatewayUrl = normalizeOptionalUrl(input.gopayGatewayUrl);
    if (payload.gopayGatewayUrl === null) {
      payload.gopayGatewayApiKeyEncrypted = null;
    }
  }

  if (input.gopayGatewayApiKey !== undefined) {
    const key = input.gopayGatewayApiKey;
    if (key === null || String(key).trim() === "") {
      payload.gopayGatewayApiKeyEncrypted = null;
    } else {
      payload.gopayGatewayApiKeyEncrypted = encryptApiKey(String(key).trim());
    }
  }

  const nextUrl =
    payload.gopayGatewayUrl !== undefined
      ? payload.gopayGatewayUrl
      : existing?.gopayGatewayUrl ?? null;
  const nextHasKey =
    payload.gopayGatewayApiKeyEncrypted !== undefined
      ? !!payload.gopayGatewayApiKeyEncrypted
      : !!existing?.gopayGatewayApiKeyEncrypted;

  if (nextUrl && !nextHasKey) {
    throw badRequest("gopayGatewayApiKey wajib jika mengisi gopayGatewayUrl");
  }
  if (!nextUrl && nextHasKey) {
    throw badRequest("gopayGatewayUrl wajib jika mengisi gopayGatewayApiKey");
  }
}

/** Sama seperti applyGopayConfig, tapi untuk kolom ShopeePay. */
function applyShopeepayConfig(payload, input, { isCreate = false, existing = null } = {}) {
  const qrisMode = input.qrisMode ?? (isCreate ? "OTHERS" : undefined);
  const nextMode = qrisMode ?? existing?.qrisMode ?? "OTHERS";
  if (nextMode !== "SHOPEEPAY") {
    if (isCreate || qrisMode !== undefined) {
      payload.shopeepayGatewayUrl = null;
      payload.shopeepayGatewayApiKeyEncrypted = null;
    }
    return;
  }

  if (input.shopeepayGatewayUrl !== undefined) {
    payload.shopeepayGatewayUrl = normalizeOptionalUrl(input.shopeepayGatewayUrl);
    if (payload.shopeepayGatewayUrl === null) {
      payload.shopeepayGatewayApiKeyEncrypted = null;
    }
  }

  if (input.shopeepayGatewayApiKey !== undefined) {
    const key = input.shopeepayGatewayApiKey;
    if (key === null || String(key).trim() === "") {
      payload.shopeepayGatewayApiKeyEncrypted = null;
    } else {
      payload.shopeepayGatewayApiKeyEncrypted = encryptApiKey(String(key).trim());
    }
  }

  const nextUrl =
    payload.shopeepayGatewayUrl !== undefined
      ? payload.shopeepayGatewayUrl
      : existing?.shopeepayGatewayUrl ?? null;
  const nextHasKey =
    payload.shopeepayGatewayApiKeyEncrypted !== undefined
      ? !!payload.shopeepayGatewayApiKeyEncrypted
      : !!existing?.shopeepayGatewayApiKeyEncrypted;

  if (nextUrl && !nextHasKey) {
    throw badRequest(
      "shopeepayGatewayApiKey wajib jika mengisi shopeepayGatewayUrl"
    );
  }
  if (!nextUrl && nextHasKey) {
    throw badRequest(
      "shopeepayGatewayUrl wajib jika mengisi shopeepayGatewayApiKey"
    );
  }
}

/**
 * Create a new merchant. Returns the merchant row + the RAW api key
 * (only shown once — caller must persist/return immediately).
 *
 * @param {{ name: string, email?: string, staticQris?: string, qrisImageBase64?: string, webhookUrl?: string, qrisMode?: string, gopayGatewayUrl?: string|null, gopayGatewayApiKey?: string|null }} input
 */
export async function createMerchant(input) {
  let { name, email, staticQris, qrisImageBase64, webhookUrl } = input;
  const qrisMode = input.qrisMode ?? "OTHERS";

  if (!name) throw badRequest("Merchant name is required");

  if (qrisMode === "OTHERS") {
    // Parse QR from image if no string provided
    if (!staticQris) {
      if (!qrisImageBase64) {
        throw badRequest(
          "staticQris atau qrisImageBase64 wajib diisi"
        );
      }
      staticQris = await parseQrisFromImage(qrisImageBase64);
    }

    if (!isValidQris(staticQris)) {
      throw badRequest(
        "staticQris tidak valid (CRC check gagal). Pastikan string QRIS utuh & benar."
      );
    }
  } else if (qrisMode === "GOPAY") {
    // QRIS statis diambil otomatis dari gateway GoBiz (custom atau global).
    const fetched = await gopayGateway.fetchStaticQrisForInput(input, null);
    staticQris = fetched.staticQris;
  } else if (qrisMode === "SHOPEEPAY") {
    // QRIS statis diambil otomatis dari gateway qris-shopeepay (custom atau global).
    const fetched = await shopeepayGateway.fetchStaticQrisForInput(input, null);
    staticQris = fetched.staticQris;
  }

  if (email) {
    const existing = await prisma.merchant.findUnique({ where: { email } });
    if (existing) throw conflict("Email already registered");
  }

  const { raw, hash, hint } = generateApiKey();
  const gopayData = {};
  applyGopayConfig(gopayData, input, { isCreate: true });
  applyShopeepayConfig(gopayData, input, { isCreate: true });
  const merchant = await prisma.merchant.create({
    data: {
      name,
      email,
      apiKeyHash: hash,
      apiKeyHint: hint,
      apiKeyEncrypted: encryptApiKey(raw),
      webhookSecret: generateWebhookSecret(),
      callbackToken: generateCallbackToken(),
      webhookUrl,
      staticQris,
      ...gopayData,
    },
  });

  return { merchant, rawApiKey: raw };
}

export async function listMerchants() {
  return prisma.merchant.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      apiKeyHint: true,
      webhookUrl: true,
      avatarPath: true,
      status: true,
      qrisMode: true,
      createdAt: true,
      _count: { select: { transactions: true } },
    },
  });
}

export async function getMerchantById(id) {
  const merchant = await prisma.merchant.findUnique({ where: { id } });
  if (!merchant) throw notFound("Merchant not found");
  return merchant;
}

/**
 * Rotate the API key of a merchant. Invalidates the previous key immediately.
 * Returns the new raw key (only shown once).
 */
export async function rotateApiKey(id) {
  const merchant = await getMerchantById(id);
  const { raw, hash, hint } = generateApiKey();
  await prisma.merchant.update({
    where: { id: merchant.id },
    data: {
      apiKeyHash: hash,
      apiKeyHint: hint,
      apiKeyEncrypted: encryptApiKey(raw),
    },
  });
  return raw;
}

/** Rotate webhook secret. Returns the new secret. */
export async function rotateWebhookSecret(id) {
  const secret = generateWebhookSecret();
  await prisma.merchant.update({
    where: { id },
    data: { webhookSecret: secret },
  });
  return secret;
}

/** Rotate (or generate) the per-merchant Macrodroid callback token. */
export async function rotateCallbackToken(id) {
  const token = generateCallbackToken();
  await prisma.merchant.update({
    where: { id },
    data: { callbackToken: token },
  });
  return token;
}

export async function updateWebhookUrl(id, webhookUrl) {
  return prisma.merchant.update({
    where: { id },
    data: { webhookUrl },
  });
}

/** Update merchant profile fields: name, email, staticQris, gopay config. */
export async function updateMerchant(id, data) {
  const payload = {};
  if (data.name !== undefined) payload.name = String(data.name).trim();
  if (data.email !== undefined)
    payload.email = data.email ? String(data.email).trim() : null;

  const existing = await getMerchantById(id);
  const nextMode = data.qrisMode ?? existing.qrisMode ?? "OTHERS";
  const gopayConfigChanged =
    data.gopayGatewayUrl !== undefined || data.gopayGatewayApiKey !== undefined;
  const shopeepayConfigChanged =
    data.shopeepayGatewayUrl !== undefined ||
    data.shopeepayGatewayApiKey !== undefined;

  if (nextMode === "GOPAY" || nextMode === "SHOPEEPAY") {
    const label = nextMode === "GOPAY" ? "Gopay" : "ShopeePay";
    const gateway = nextMode === "GOPAY" ? gopayGateway : shopeepayGateway;
    const configChanged =
      nextMode === "GOPAY" ? gopayConfigChanged : shopeepayConfigChanged;

    // QRIS statis selalu diambil dari gateway — tolak input manual.
    if (data.staticQris !== undefined) {
      throw badRequest(
        `staticQris tidak bisa diubah manual untuk merchant ${label}. QRIS diambil otomatis dari gateway.`
      );
    }
    // Fetch ulang hanya saat mode baru / config gateway berubah / QRIS belum ada.
    if (data.qrisMode === nextMode || configChanged || !existing.staticQris) {
      const fetched = await gateway.fetchStaticQrisForInput(data, existing);
      payload.staticQris = fetched.staticQris;
    }
  } else if (data.staticQris !== undefined) {
    const qris = String(data.staticQris).trim();
    if (!isValidQris(qris)) {
      throw badRequest(
        "staticQris tidak valid (CRC check gagal). Pastikan string QRIS utuh & benar."
      );
    }
    payload.staticQris = qris;
  }
  applyGopayConfig(payload, data, { isCreate: false, existing });
  applyShopeepayConfig(payload, data, { isCreate: false, existing });
  return prisma.merchant.update({ where: { id }, data: payload });
}

export async function setMerchantStatus(id, status) {
  return prisma.merchant.update({ where: { id }, data: { status } });
}

export async function deleteMerchant(id) {
  const merchant = await getMerchantById(id);
  if (merchant.avatarPath) {
    try {
      const { deleteMerchantAvatar } = await import("./avatar.service.js");
      await deleteMerchantAvatar(id);
    } catch {
      /* ignore avatar cleanup errors */
    }
  }
  await prisma.merchant.delete({ where: { id } });
}
