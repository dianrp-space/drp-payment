import { isProd } from "../config/env.js";
import { badRequest } from "./errors.js";

// IP ranges yang tidak boleh di-fetch dari server (cegah SSRF).
// Hanya di-enforce di production; dev/test masih boleh localhost.
//
// Mencakup: loopback, private, link-local, cloud metadata, multicast, reserved.
const BLOCKED_REGEXES = [
  /^127\./, // 127.0.0.0/8 loopback
  /^10\./, // 10.0.0.0/8 private
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12 private
  /^192\.168\./, // 192.168.0.0/16 private
  /^169\.254\./, // 169.254.0.0/16 link-local + cloud metadata (169.254.169.254)
  /^0\./, // 0.0.0.0/8 reserved
  /^::1$/, // IPv6 loopback
  /^fc00:/, // IPv6 unique-local
  /^fe80:/, // IPv6 link-local
  /^fd/, // IPv6 unique-local (fc00::/7 subset)
];

const ALLOWED_SCHEMES = ["http:", "https:"];

/**
 * Validasi bahwa URL aman untuk di-fetch dari server.
 * - Scheme harus http/https
 * - Hostname tidak boleh resolve ke private/loopback/metadata IP (di production)
 *
 * @param {string} url
 * @param {boolean} [enforce=true] - override; default: enforce di production only
 * @returns {URL} parsed URL jika valid
 * @throws {HttpError} 400 jika URL tidak aman
 */
export function assertSafeFetchUrl(url, enforce = isProd) {
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

  // Block literal IP yang masuk range terlarang.
  for (const re of BLOCKED_REGEXES) {
    if (re.test(host)) {
      throw badRequest(
        `Hostname "${host}" di-block (private/loopback/metadata IP tidak diizinkan di production).`
      );
    }
  }

  // Block beberapa hostname meta yang umum dipakai SSRF.
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
 * Middleware-ish helper: validasi URL field di request body.
 * Dipakai untuk webhookUrl merchant & test-webhook.
 */
export function validateFetchUrl(url, enforce) {
  if (!url) return null;
  assertSafeFetchUrl(url, enforce);
  return url;
}
