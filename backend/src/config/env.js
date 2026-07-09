import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),

  DATABASE_URL: z.string().min(1),

  INTERNAL_TOKEN: z.string().min(8, "INTERNAL_TOKEN must be at least 8 chars"),

  // Master key untuk encrypt API key merchant (AES-256-GCM). Harus 32+ char.
  // Kalau tidak diset, fallback ke INTERNAL_TOKEN (dikombinasi ulang jadi 32 byte).
  ENCRYPTION_KEY: z.string().min(8).optional(),

  // Public base URL gateway (mis. "https://pay.drpnet.my.id").
  // Dipakai untuk generate URL callback Macrodroid, link docs, dsb.
  // Tidak ada trailing slash. Kalau tidak diset, fallback ke localhost.
  APP_URL: z.string().url().optional(),

  // CORS whitelist: daftar origin (comma-separated) yang boleh akses API.
  // Jika tidak diset, fallback ke APP_URL. Di production WAJIB diset.
  // Contoh: "https://pay.drpnet.my.id,https://dashboard.drpnet.my.id"
  CORS_ORIGINS: z.string().optional(),

  // ADMIN_TOKEN: optional — used only for seeding the first admin.
  // After seed, auth is via email+password stored in the Admin table.
  ADMIN_TOKEN: z.string().min(8, "ADMIN_TOKEN must be at least 8 chars").optional(),
  ADMIN_NAME: z.string().min(1).optional(),
  ADMIN_EMAIL: z.string().email().default("admin@drp.local"),
  ADMIN_PASSWORD: z.string().min(6).default("admin123"),

  DEFAULT_EXPIRY_MINUTES: z.coerce.number().default(15),
  QR_IMAGE_FORMAT: z.enum(["png", "jpeg", "webp"]).default("png"),

  // Optional: array of IPs allowed to hit /v2/callback (comma separated)
  INTERNAL_ALLOWED_IPS: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";

// ---- Production guards ----
// Tolak start jika kredensial masih default — kesalahan konfigurasi yang fatal.
if (isProd) {
  const DEFAULT_EMAIL = "admin@drp.local";
  const DEFAULT_PASSWORD = "admin123";
  if (env.ADMIN_EMAIL === DEFAULT_EMAIL) {
    console.error(
      `FATAL: ADMIN_EMAIL masih default "${DEFAULT_EMAIL}" di production. Set ADMIN_EMAIL yang unik di .env.`
    );
    process.exit(1);
  }
  if (env.ADMIN_PASSWORD === DEFAULT_PASSWORD) {
    console.error(
      `FATAL: ADMIN_PASSWORD masih default ("admin123") di production. Set password kuat di .env.`
    );
    process.exit(1);
  }
  if (!env.APP_URL) {
    console.error(
      "FATAL: APP_URL wajib di-set di production (mis. https://pay.drpnet.my.id)."
    );
    process.exit(1);
  }
}

/** Public base URL gateway (no trailing slash). Fallback ke localhost. */
export const appUrl = (env.APP_URL || `http://localhost:${env.PORT}`).replace(/\/+$/, "");

/**
 * Daftar origin (array) yang di-whitelist untuk CORS.
 * Fallback: [appUrl] (kalau ada APP_URL) atau ["*"] di development.
 */
export const corsOrigins = (() => {
  if (env.CORS_ORIGINS) {
    return env.CORS_ORIGINS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (env.APP_URL) return [appUrl];
  return isProd ? [] : ["*"];
})();
