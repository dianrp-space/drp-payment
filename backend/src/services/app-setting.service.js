import { prisma } from "../config/db.js";
import { appUrl } from "../config/env.js";

const SETTING_ID = "default";
export const DEFAULT_APP_NAME = "DRP Payment Gateway";

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
