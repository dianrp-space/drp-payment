import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as merchantService from "../services/merchant.service.js";
import { renderQrisImage } from "../utils/qris-builder.js";
import { parseTLV, getTagValue, getQrisProvider } from "../utils/qris-tlv.js";
import {
  signWebhook,
  signJwt,
  decryptApiKey,
} from "../utils/crypto.js";
import { assertSafeFetchUrl } from "../utils/ssrf.js";
import { notFound } from "../utils/errors.js";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  staticQris: z.string().min(1).optional(),
  qrisImageBase64: z.string().min(1).optional(),
  webhookUrl: z.string().url().optional(),
});

export const createMerchant = asyncHandler(async (req, res) => {
  const parsed = createSchema.parse(req.body);
  if (parsed.webhookUrl) assertSafeFetchUrl(parsed.webhookUrl);
  const { merchant, rawApiKey } = await merchantService.createMerchant(parsed);
  res.status(201).json({
    merchant: {
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      apiKeyHint: merchant.apiKeyHint,
      webhookUrl: merchant.webhookUrl,
      status: merchant.status,
      createdAt: merchant.createdAt,
      apiKey: rawApiKey,
      webhookSecret: merchant.webhookSecret,
      callbackToken: merchant.callbackToken,
      notice:
        "Store apiKey and webhookSecret securely. They will NOT be shown again.",
    },
  });
});

export const listMerchants = asyncHandler(async (_req, res) => {
  const merchants = await merchantService.listMerchants();
  res.json({ merchants });
});

export const getMerchant = asyncHandler(async (req, res) => {
  const merchant = await merchantService.getMerchantById(req.params.id);
  const tags = parseTLV(merchant.staticQris);
  res.json({
    merchant: {
      id: merchant.id,
      name: merchant.name,
      email: merchant.email,
      apiKeyHint: merchant.apiKeyHint,
      webhookUrl: merchant.webhookUrl,
      webhookSecret: merchant.webhookSecret,
      callbackToken: merchant.callbackToken,
      staticQris: merchant.staticQris,
      qrisName: getTagValue(tags, "59"),
      qrisCity: getTagValue(tags, "60"),
      qrisProvider: getQrisProvider(merchant.staticQris),
      status: merchant.status,
      createdAt: merchant.createdAt,
    },
  });
});

const updateWebhookSchema = z.object({
  webhookUrl: z.string().url().nullable(),
});

const updateMerchantSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(120).nullable().optional(),
  staticQris: z.string().min(1).max(500).optional(),
});

export const updateWebhook = asyncHandler(async (req, res) => {
  const { webhookUrl } = updateWebhookSchema.parse(req.body);
  if (webhookUrl) assertSafeFetchUrl(webhookUrl);
  const merchant = await merchantService.updateWebhookUrl(req.params.id, webhookUrl);
  res.json({ merchant: { id: merchant.id, webhookUrl: merchant.webhookUrl } });
});

export const updateMerchant = asyncHandler(async (req, res) => {
  const data = updateMerchantSchema.parse(req.body);
  const merchant = await merchantService.updateMerchant(req.params.id, data);
  res.json({ merchant });
});

export const rotateApiKey = asyncHandler(async (req, res) => {
  const raw = await merchantService.rotateApiKey(req.params.id);
  res.json({ apiKey: raw, notice: "Previous API key is now invalid." });
});

export const rotateWebhookSecret = asyncHandler(async (req, res) => {
  const secret = await merchantService.rotateWebhookSecret(req.params.id);
  res.json({ webhookSecret: secret });
});

export const rotateCallbackToken = asyncHandler(async (req, res) => {
  const token = await merchantService.rotateCallbackToken(req.params.id);
  res.json({ callbackToken: token });
});

const statusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const setStatus = asyncHandler(async (req, res) => {
  const { status } = statusSchema.parse(req.body);
  const merchant = await merchantService.setMerchantStatus(req.params.id, status);
  res.json({ merchant: { id: merchant.id, status: merchant.status } });
});

export const deleteMerchant = asyncHandler(async (req, res) => {
  await merchantService.deleteMerchant(req.params.id);
  res.json({ ok: true });
});

export const getMerchantQrImage = asyncHandler(async (req, res) => {
  const merchant = await merchantService.getMerchantById(req.params.id);
  const qrImageBase64 = await renderQrisImage(merchant.staticQris, "png");
  res.json({ qrImageBase64 });
});

/**
 * Reveal raw API key merchant (didekripsi dari apiKeyEncrypted).
 * Hanya admin. Return null jika merchant lama belum punya encrypted key
 * (harus rotate dulu).
 */
export const revealMerchantApiKey = asyncHandler(async (req, res) => {
  const merchant = await merchantService.getMerchantById(req.params.id);
  if (!merchant.apiKeyEncrypted) {
    throw notFound(
      "API key merchant ini tidak bisa direveal (dibuat sebelum fitur ini). Rotasi key untuk mengaktifkan."
    );
  }
  const raw = decryptApiKey(merchant.apiKeyEncrypted);
  if (!raw) {
    throw notFound("Gagal mendekripsi API key. Mungkin ENCRYPTION_KEY berubah.");
  }
  res.json({ apiKey: raw, apiKeyHint: merchant.apiKeyHint });
});

export const testMerchantWebhook = asyncHandler(async (req, res) => {
  const merchant = await merchantService.getMerchantById(req.params.id);
  if (!merchant.webhookUrl) {
    return res.status(400).json({ error: "Merchant belum memiliki webhookUrl" });
  }

  assertSafeFetchUrl(merchant.webhookUrl);

  const payload = {
    event: "payment.success",
    transactionId: "test-" + Date.now(),
    referenceId: "TEST-WEBHOOK",
    merchantId: merchant.id,
    amount: 25000,
    fee: 0,
    uniqueDigit: 123,
    totalAmount: 25123,
    paidAmount: 25123,
    status: "PAID",
    paidAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const rawBody = JSON.stringify(payload);
  const signature = signWebhook(merchant.webhookSecret, rawBody);
  const token = signJwt(payload, merchant.webhookSecret);

  let statusCode = null;
  let responseBody = null;
  let errorMessage = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(merchant.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Signature": signature,
        "X-DRP-Token": token,
        "X-Event-Type": "payment.success",
        "User-Agent": "DRP-Payment-Gateway/2.0 (+https://dianrp.com)",
      },
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    statusCode = resp.status;
    responseBody = (await resp.text()).slice(0, 2000);
  } catch (e) {
    errorMessage = e.name === "AbortError" ? "timeout (10s)" : e.message;
  }

  const success = statusCode !== null && statusCode >= 200 && statusCode < 300;
  res.json({
    success,
    statusCode,
    responseBody,
    errorMessage,
    payload,
    signature,
  });
});
