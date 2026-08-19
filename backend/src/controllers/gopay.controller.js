import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest } from "../utils/errors.js";
import { assertSafeWebhookUrl } from "../utils/ssrf.js";
import * as merchantService from "../services/merchant.service.js";
import * as gopayGateway from "../services/gopay-gateway.service.js";

const testSchema = z.object({
  merchantId: z.string().min(1).optional(),
  url: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  scope: z.enum(["global", "merchant"]).optional(),
});

async function resolveAdminGateway(body) {
  if (body.url && body.apiKey) {
    assertSafeWebhookUrl(body.url);
    return { url: body.url.replace(/\/+$/, ""), apiKey: body.apiKey };
  }
  if (body.merchantId) {
    const merchant = await merchantService.getMerchantById(body.merchantId);
    const cfg = await gopayGateway.resolveGatewayConfig(merchant);
    if (!cfg) {
      throw badRequest(
        "Gateway Gopay belum dikonfigurasi untuk merchant ini (dan global kosong)"
      );
    }
    return cfg;
  }
  const cfg = await gopayGateway.resolveGatewayConfig(null);
  if (!cfg) {
    throw badRequest("Gateway Gopay global belum dikonfigurasi");
  }
  return cfg;
}

export const testGopayConnection = asyncHandler(async (req, res) => {
  const body = testSchema.parse(req.body ?? {});
  const cfg = await resolveAdminGateway(body);
  const result = await gopayGateway.testGatewayConnection(cfg.url, cfg.apiKey);
  res.json(result);
});

const loginScopeSchema = z.object({
  merchantId: z.string().min(1).optional(),
});

export const gopayLoginStart = asyncHandler(async (req, res) => {
  const body = loginScopeSchema.parse(req.body ?? {});
  const cfg = await resolveAdminGateway(body);
  const result = await gopayGateway.startGopayLogin(cfg.url, cfg.apiKey);
  res.status(result.status || 200).json(result.body);
});

const loginInputSchema = z.object({
  merchantId: z.string().min(1).optional(),
  text: z.string().min(1).max(200),
});

export const gopayLoginInput = asyncHandler(async (req, res) => {
  const body = loginInputSchema.parse(req.body ?? {});
  const cfg = await resolveAdminGateway(body);
  const result = await gopayGateway.sendGopayLoginInput(cfg.url, cfg.apiKey, body.text);
  res.status(result.status || 200).json(result.body);
});

export const gopayLoginOutput = asyncHandler(async (req, res) => {
  const query = z
    .object({
      merchantId: z.string().min(1).optional(),
      since: z.coerce.number().int().min(0).optional(),
    })
    .parse(req.query ?? {});
  const cfg = await resolveAdminGateway(query);
  const result = await gopayGateway.getGopayLoginOutput(
    cfg.url,
    cfg.apiKey,
    query.since ?? 0
  );
  res.status(result.status || 200).json(result.body);
});

export const gopaySessionStatus = asyncHandler(async (req, res) => {
  const query = loginScopeSchema.parse(req.query ?? {});
  const cfg = await resolveAdminGateway(query);
  const result = await gopayGateway.getGopaySessionStatus(cfg.url, cfg.apiKey);
  res.status(result.status || 200).json(result.body);
});
