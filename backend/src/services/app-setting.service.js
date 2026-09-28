import { prisma } from "../config/db.js";
import { appUrl } from "../config/env.js";
import { encryptApiKey, decryptApiKey } from "../utils/crypto.js";
import { assertSafeWebhookUrl } from "../utils/ssrf.js";
import { badRequest } from "../utils/errors.js";

const SETTING_ID = "default";
export const DEFAULT_APP_NAME = "DRP Payment Gateway";
export const DEFAULT_AUDIT_RETENTION_DAYS = 30;
export const DEFAULT_AUDIT_INTERVAL_HOURS = 6;

function shape(row) {
  return {
    appName: row?.appName?.trim() ? row.appName.trim() : DEFAULT_APP_NAME,
    appLogoBase64: row?.appLogoBase64 ?? null,
    faviconBase64: row?.faviconBase64 ?? null,
    appUrl,
  };
}

export async function getBranding() {
  const row = await prisma.appSetting.findUnique({
    where: { id: SETTING_ID },
  });
  return shape(row);
}

export async function updateBranding({ appName, appLogoBase64, faviconBase64 }) {
  const data = {
    appName: appName?.trim() ? appName.trim() : null,
    appLogoBase64: appLogoBase64 ?? null,
    faviconBase64: faviconBase64 ?? null,
  };

  const row = await prisma.appSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, ...data },
    update: data,
  });

  return shape(row);
}

// ---- Audit cleanup settings ----

function shapeAudit(row) {
  return {
    enabled: row?.auditCleanupEnabled ?? true,
    retentionDays: row?.auditRetentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS,
    intervalHours: row?.auditCleanupIntervalHours ?? DEFAULT_AUDIT_INTERVAL_HOURS,
  };
}

export async function getAuditCleanupSettings() {
  const row = await prisma.appSetting.findUnique({
    where: { id: SETTING_ID },
  });
  return shapeAudit(row);
}

export async function updateAuditCleanupSettings({ enabled, retentionDays, intervalHours }) {
  const data = {};
  if (enabled !== undefined) data.auditCleanupEnabled = Boolean(enabled);
  if (retentionDays !== undefined) {
    const n = Math.trunc(Number(retentionDays));
    if (!Number.isFinite(n) || n < 1 || n > 3650) {
      throw new Error("retentionDays harus antara 1-3650");
    }
    data.auditRetentionDays = n;
  }
  if (intervalHours !== undefined) {
    const h = Math.trunc(Number(intervalHours));
    if (!Number.isFinite(h) || h < 1 || h > 168) {
      throw new Error("intervalHours harus antara 1-168 (max 1 minggu)");
    }
    data.auditCleanupIntervalHours = h;
  }

  const row = await prisma.appSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, ...data },
    update: data,
  });

  return shapeAudit(row);
}

function maskSecretHint(raw) {
  if (!raw) return null;
  return "...." + String(raw).slice(-4).toUpperCase();
}

function shapeGopay(row) {
  const raw = decryptApiKey(row?.gopayGatewayApiKeyEncrypted);
  return {
    gopayGatewayUrl: row?.gopayGatewayUrl ?? null,
    hasGopayGatewayApiKey: !!row?.gopayGatewayApiKeyEncrypted,
    gopayGatewayApiKeyHint: maskSecretHint(raw),
    gopayQrisStatic: row?.gopayQrisStatic ?? null,
  };
}

export async function getGopayGatewaySettings() {
  const row = await prisma.appSetting.findUnique({
    where: { id: SETTING_ID },
  });
  return shapeGopay(row);
}

export async function updateGopayGatewaySettings({ gopayGatewayUrl, gopayGatewayApiKey }) {
  const data = {};
  if (gopayGatewayUrl !== undefined) {
    const trimmed = gopayGatewayUrl ? String(gopayGatewayUrl).trim() : "";
    if (!trimmed) {
      data.gopayGatewayUrl = null;
      data.gopayGatewayApiKeyEncrypted = null;
    } else {
      assertSafeWebhookUrl(trimmed);
      data.gopayGatewayUrl = trimmed.replace(/\/+$/, "");
    }
  }
  if (gopayGatewayApiKey !== undefined) {
    const key = gopayGatewayApiKey ? String(gopayGatewayApiKey).trim() : "";
    data.gopayGatewayApiKeyEncrypted = key ? encryptApiKey(key) : null;
  }

  const existing = await prisma.appSetting.findUnique({ where: { id: SETTING_ID } });
  const nextUrl =
    data.gopayGatewayUrl !== undefined ? data.gopayGatewayUrl : existing?.gopayGatewayUrl;
  const nextHasKey =
    data.gopayGatewayApiKeyEncrypted !== undefined
      ? !!data.gopayGatewayApiKeyEncrypted
      : !!existing?.gopayGatewayApiKeyEncrypted;
  if (nextUrl && !nextHasKey) {
    throw badRequest("API key gateway wajib jika URL diisi");
  }
  if (!nextUrl && nextHasKey) {
    throw badRequest("URL gateway wajib jika API key diisi");
  }

  const row = await prisma.appSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, ...data },
    update: data,
  });
  return shapeGopay(row);
}

/** Simpan QRIS statis global hasil fetch dari gateway gopay-qris. */
export async function setGopayQrisStatic(staticQris) {
  const row = await prisma.appSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, gopayQrisStatic: staticQris ?? null },
    update: { gopayQrisStatic: staticQris ?? null },
  });
  return shapeGopay(row);
}

function shapeShopeepay(row) {
  const raw = decryptApiKey(row?.shopeepayGatewayApiKeyEncrypted);
  return {
    shopeepayGatewayUrl: row?.shopeepayGatewayUrl ?? null,
    hasShopeepayGatewayApiKey: !!row?.shopeepayGatewayApiKeyEncrypted,
    shopeepayGatewayApiKeyHint: maskSecretHint(raw),
    shopeepayQrisStatic: row?.shopeepayQrisStatic ?? null,
  };
}

export async function getShopeepayGatewaySettings() {
  const row = await prisma.appSetting.findUnique({
    where: { id: SETTING_ID },
  });
  return shapeShopeepay(row);
}

export async function updateShopeepayGatewaySettings({
  shopeepayGatewayUrl,
  shopeepayGatewayApiKey,
}) {
  const data = {};
  if (shopeepayGatewayUrl !== undefined) {
    const trimmed = shopeepayGatewayUrl ? String(shopeepayGatewayUrl).trim() : "";
    if (!trimmed) {
      data.shopeepayGatewayUrl = null;
      data.shopeepayGatewayApiKeyEncrypted = null;
    } else {
      assertSafeWebhookUrl(trimmed);
      data.shopeepayGatewayUrl = trimmed.replace(/\/+$/, "");
    }
  }
  if (shopeepayGatewayApiKey !== undefined) {
    const key = shopeepayGatewayApiKey ? String(shopeepayGatewayApiKey).trim() : "";
    data.shopeepayGatewayApiKeyEncrypted = key ? encryptApiKey(key) : null;
  }

  const existing = await prisma.appSetting.findUnique({ where: { id: SETTING_ID } });
  const nextUrl =
    data.shopeepayGatewayUrl !== undefined
      ? data.shopeepayGatewayUrl
      : existing?.shopeepayGatewayUrl;
  const nextHasKey =
    data.shopeepayGatewayApiKeyEncrypted !== undefined
      ? !!data.shopeepayGatewayApiKeyEncrypted
      : !!existing?.shopeepayGatewayApiKeyEncrypted;
  if (nextUrl && !nextHasKey) {
    throw badRequest("API key gateway ShopeePay wajib jika URL diisi");
  }
  if (!nextUrl && nextHasKey) {
    throw badRequest("URL gateway ShopeePay wajib jika API key diisi");
  }

  const row = await prisma.appSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, ...data },
    update: data,
  });
  return shapeShopeepay(row);
}

/** Simpan QRIS statis global hasil fetch dari gateway qris-shopeepay. */
export async function setShopeepayQrisStatic(staticQris) {
  const row = await prisma.appSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, shopeepayQrisStatic: staticQris ?? null },
    update: { shopeepayQrisStatic: staticQris ?? null },
  });
  return shapeShopeepay(row);
}
