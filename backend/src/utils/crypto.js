import { createHash, createHmac, randomBytes, randomUUID, createCipheriv, createDecipheriv } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/** Prefix-scheme for DRP gateway API keys. */
const API_KEY_PREFIX = "drp_live_";

/**
 * Generate a new raw API key + its hash + display hint.
 * The raw key is only ever shown once (at creation time).
 */
export function generateApiKey() {
  const raw = API_KEY_PREFIX + randomBytes(24).toString("hex");
  return {
    raw,
    hash: hashApiKey(raw),
    hint: "...." + raw.slice(-4).toUpperCase(),
  };
}

/** Hash an API key for storage/lookup using sha256 hex. */
export function hashApiKey(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a, b) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return bufA.equals(bufB) && timingSafeEqual(bufA, bufB);
}

function timingSafeEqual(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** HMAC-SHA256 hex signature of `payload` using `secret`. */
export function signWebhook(secret, payload) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Sign payload as JWT HS256 using webhookSecret. Short-lived (5 menit). */
export function signJwt(payload, secret) {
  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: "5m" });
}

/** Random webhook secret for a merchant. */
export function generateWebhookSecret() {
  return randomBytes(32).toString("hex");
}

/** Random internal id (used for callback correlation). */
export function generateId() {
  return randomUUID();
}

// ============================================================
// Reversible encryption for "reveal API key" feature.
// Raw API key dienkripsi pakai AES-256-GCM dengan key turunan dari
// ENCRYPTION_KEY (fallback INTERNAL_TOKEN). Disimpan sebagai
// "<iv hex>:<authTag hex>:<ciphertext hex>".
// ============================================================

const ENC_ALGO = "aes-256-gcm";

function encryptionKeyBytes() {
  const source = env.ENCRYPTION_KEY || env.INTERNAL_TOKEN;
  // Derive 32-byte key via sha256 supaya panjang selalu valid untuk AES-256.
  return createHash("sha256").update("drp-enc:" + source).digest();
}

export function encryptApiKey(raw) {
  const key = encryptionKeyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENC_ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), ct.toString("hex")].join(":");
}

export function decryptApiKey(enc) {
  if (!enc) return null;
  const parts = enc.split(":");
  if (parts.length !== 3) return null;
  const [ivHex, tagHex, ctHex] = parts;
  try {
    const key = encryptionKeyBytes();
    const decipher = createDecipheriv(ENC_ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return null;
  }
}
