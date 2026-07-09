import { prisma } from "../config/db.js";
import { appUrl } from "../config/env.js";

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
