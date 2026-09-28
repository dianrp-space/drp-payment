import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest } from "../utils/errors.js";
import { assertSafeWebhookUrl } from "../utils/ssrf.js";
import * as shopeepayGateway from "../services/shopeepay-gateway.service.js";
import * as appSettingService from "../services/app-setting.service.js";

const connectionSchema = z.object({
  url: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
});

/**
 * Kalau body membawa url+apiKey, pakai itu (untuk test sebelum disimpan).
 * Kalau tidak, jatuh ke setting global yang sudah tersimpan.
 */
async function resolveConfig(body) {
  if (body.url && body.apiKey) {
    assertSafeWebhookUrl(body.url);
    return {
      url: body.url.replace(/\/+$/, ""),
      apiKey: body.apiKey,
      source: "merchant",
    };
  }
  return shopeepayGateway.resolveGatewayConfig();
}

async function requireConfig(body) {
  const cfg = await resolveConfig(body);
  if (!cfg) {
    throw badRequest("Gateway ShopeePay belum dikonfigurasi. Isi URL & API key dulu.");
  }
  return cfg;
}

export const testShopeepayConnection = asyncHandler(async (req, res) => {
  const body = connectionSchema.parse(req.body ?? {});
  const cfg = await requireConfig(body);
  const result = await shopeepayGateway.testGatewayConnection(cfg.url, cfg.apiKey);
  res.json(result);
});

export const getShopeepayStaticQris = asyncHandler(async (req, res) => {
  const body = connectionSchema.parse(req.body ?? {});
  const cfg = await requireConfig(body);

  const result = await shopeepayGateway.fetchStaticQris(cfg.url, cfg.apiKey);
  const qrisStatic = result.ok
    ? String(result.body?.data?.qris_static ?? "").trim() || null
    : null;

  // Simpan QRIS statis global agar tetap tampil setelah refresh.
  if (qrisStatic && cfg.source !== "merchant") {
    await appSettingService.setShopeepayQrisStatic(qrisStatic);
  }

  res.json({
    success: result.ok && !!qrisStatic,
    source: cfg.source ?? "global",
    message:
      result.ok && qrisStatic
        ? "QRIS statis berhasil diambil dari gateway ShopeePay"
        : result.body?.error ||
          result.body?.message ||
          `Gagal mengambil QRIS statis (HTTP ${result.status})`,
    qrisStatic,
    tokenStatus: result.ok ? "valid" : null,
  });
});
