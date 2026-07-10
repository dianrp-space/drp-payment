import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as adminService from "../services/admin.service.js";
import * as merchantService from "../services/merchant.service.js";
import { dispatchPaymentSuccess } from "../services/webhook.service.js";
import { notFound, badRequest } from "../utils/errors.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["PENDING", "PAID", "EXPIRED", "FAILED"]).optional(),
  merchantId: z.string().max(60).optional(),
  q: z.string().max(100).optional(),
});

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]).optional(),
  statusCodeFrom: z.coerce.number().int().min(100).max(599).optional(),
  statusCodeTo: z.coerce.number().int().min(100).max(599).optional(),
  merchantId: z.string().max(60).optional(),
  q: z.string().max(100).optional(),
});

export const getStats = asyncHandler(async (_req, res) => {
  const stats = await adminService.getDashboardStats();
  res.json(stats);
});

export const listTransactions = asyncHandler(async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const result = await adminService.listAllTransactions(query);
  res.json(result);
});

export const getTransaction = asyncHandler(async (req, res) => {
  const tx = await adminService.getTransactionDetail(req.params.id);
  res.json(tx);
});

export const deleteTransaction = asyncHandler(async (req, res) => {
  const result = await adminService.deleteTransaction(req.params.id);
  res.json(result);
});

// Merchant list with transaction counts (for admin dashboard)
export const listMerchantsWithStats = asyncHandler(async (_req, res) => {
  const merchants = await merchantService.listMerchants();
  res.json({ merchants });
});

export const retryWebhook = asyncHandler(async (req, res) => {
  const { prisma } = await import("../config/db.js");
  const tx = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    include: { merchant: true },
  });
  if (!tx) throw notFound("Transaction not found");
  if (tx.status !== "PAID") throw badRequest("Only PAID transactions can retry webhook");

  await dispatchPaymentSuccess(tx.id);
  res.json({ ok: true, message: "Webhook re-delivery enqueued" });
});

export const listAuditLogs = asyncHandler(async (req, res) => {
  const query = auditQuerySchema.parse(req.query);
  const result = await adminService.listAuditLogs(query);
  res.json(result);
});

const cleanupSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650),
});

export const cleanupAuditLogs = asyncHandler(async (req, res) => {
  const { days } = cleanupSchema.parse(req.body);
  const result = await adminService.deleteAuditLogsOlderThan(days);
  res.json(result);
});

export const getAuditStats = asyncHandler(async (_req, res) => {
  const stats = await adminService.getAuditLogStats();
  res.json(stats);
});
