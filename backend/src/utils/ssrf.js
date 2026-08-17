import { isProd } from "../config/env.js";
import { badRequest } from "./errors.js";

// Selalu diblokir di production (loopback / metadata / link-local / reserved).
const ALWAYS_BLOCKED = [
  /^127\./, // 127.0.0.0/8 loopback
  /^169\.254\./, // 169.254.0.0/16 link-local + cloud metadata
  /^0\./, // 0.0.0.0/8 reserved
  /^::1$/, // IPv6 loopback
  /^fe80:/, // IPv6 link-local
];

// RFC1918 / unique-local — diblokir untuk fetch umum (SSRF),
// tapi diizinkan untuk webhook merchant (n8n / homelab di LAN).
const PRIVATE_LAN = [
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^fc00:/, // IPv6 unique-local
  /^fd/, // IPv6 unique-local (fc00::/7 subset)
];

const ALLOWED_SCHEMES = ["http:", "https:"];

function blockedRegexes(allowPrivateLan) {
  return allowPrivateLan
    ? ALWAYS_BLOCKED
    : [...ALWAYS_BLOCKED, ...PRIVATE_LAN];
}

function normalizeOpts(enforceOrOpts) {
  if (typeof enforceOrOpts === "boolean" || enforceOrOpts === undefined) {
    return {
      enforce: enforceOrOpts ?? isProd,
      allowPrivateLan: false,
    };
  }
  return {
    enforce: enforceOrOpts.enforce ?? isProd,
    allowPrivateLan: !!enforceOrOpts.allowPrivateLan,
  };
}

/**
 * Validasi bahwa URL aman untuk di-fetch dari server.
 * - Scheme harus http/https
 * - Di production: hostname tidak boleh loopback/metadata.
 *   Private LAN (192.168/10/172.16) diblokir kecuali allowPrivateLan.
 *
 * @param {string} url
 * @param {boolean|{ enforce?: boolean, allowPrivateLan?: boolean }} [enforceOrOpts]
 * @returns {URL} parsed URL jika valid
 * @throws {HttpError} 400 jika URL tidak aman
 */
export function assertSafeFetchUrl(url, enforceOrOpts = isProd) {
  const { enforce, allowPrivateLan } = normalizeOpts(enforceOrOpts);

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest("URL tidak valid");
  }

  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    throw badRequest(
      `Scheme "${parsed.protocol}" tidak diizinkan; hanya http/https.`
    );
  }

  if (!enforce) return parsed;

  const host = parsed.hostname.toLowerCase();

  for (const re of blockedRegexes(allowPrivateLan)) {
    if (re.test(host)) {
      throw badRequest(
        allowPrivateLan
          ? `Hostname "${host}" di-block (loopback/metadata tidak diizinkan).`
          : `Hostname "${host}" di-block (private/loopback/metadata IP tidak diizinkan di production).`
      );
    }
  }

  const blockedHosts = ["metadata.google.internal", "metadata.azure.com"];
  if (blockedHosts.includes(host)) {
    throw badRequest(`Hostname "${host}" di-block.`);
  }

  // Catatan: ini TIDAK resolve DNS. Attacker bisa pakai DNS rebinding
  // (hostname yang resolve ke 127.0.0.1). Untuk mitigasi penuh, gunakan
  // custom DNS lookup + verifikasi IP sebelum fetch. Untuk skup sekarang
  // cukup block literal IP & hostname meta yang umum.
  return parsed;
}

/**
 * Webhook merchant: http/https, boleh IP LAN (192.168/10/172.16),
 * tetap tolak loopback & cloud metadata.
 */
export function assertSafeWebhookUrl(url) {
  return assertSafeFetchUrl(url, { enforce: isProd, allowPrivateLan: true });
}

/**
 * Middleware-ish helper: validasi URL field di request body.
 * Dipakai untuk webhookUrl merchant & test-webhook.
 */
export function validateFetchUrl(url, enforce) {
  if (!url) return null;
  assertSafeFetchUrl(url, enforce);
  return url;
}
