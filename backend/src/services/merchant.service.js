import { prisma } from "../config/db.js";
import {
  generateApiKey,
  generateWebhookSecret,
  encryptApiKey,
} from "../utils/crypto.js";
import { randomBytes } from "node:crypto";
import { isValidQris } from "../utils/qris-builder.js";
import { parseQrisFromImage } from "../utils/qris-parser.js";
import { conflict, badRequest, notFound } from "../utils/errors.js";

/** Generate a per-merchant Macrodroid callback token. */
function generateCallbackToken() {
  return "drp_cb_" + randomBytes(24).toString("hex");
}

/**
 * Create a new merchant. Returns the merchant row + the RAW api key
 * (only shown once — caller must persist/return immediately).
 *
 * @param {{ name: string, email?: string, staticQris?: string, qrisImageBase64?: string, webhookUrl?: string }} input
 */
export async function createMerchant(input) {
  let { name, email, staticQris, qrisImageBase64, webhookUrl } = input;

  if (!name) throw badRequest("Merchant name is required");

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

  if (email) {
    const existing = await prisma.merchant.findUnique({ where: { email } });
    if (existing) throw conflict("Email already registered");
  }

  const { raw, hash, hint } = generateApiKey();
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
      status: true,
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

/** Update merchant profile fields: name, email, staticQris. */
export async function updateMerchant(id, data) {
  const payload = {};
  if (data.name !== undefined) payload.name = String(data.name).trim();
  if (data.email !== undefined)
    payload.email = data.email ? String(data.email).trim() : null;
  if (data.staticQris !== undefined) {
    const qris = String(data.staticQris).trim();
    if (!isValidQris(qris)) {
      throw badRequest(
        "staticQris tidak valid (CRC check gagal). Pastikan string QRIS utuh & benar."
      );
    }
    payload.staticQris = qris;
  }
  return prisma.merchant.update({ where: { id }, data: payload });
}

export async function setMerchantStatus(id, status) {
  return prisma.merchant.update({ where: { id }, data: { status } });
}

export async function deleteMerchant(id) {
  await getMerchantById(id);
  await prisma.merchant.delete({ where: { id } });
}
