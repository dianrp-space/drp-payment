import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { badRequest } from "../utils/errors.js";
import * as transactionService from "../services/transaction.service.js";

const createSchema = z.object({
  referenceId: z.string().min(1).max(100),
  amount: z.number().int().positive(),
  fee: z.number().int().min(0).optional(),
  expiresInMinutes: z.number().int().positive().max(1440).optional(),
});

export const createQrisPayment = asyncHandler(async (req, res) => {
  const parsed = createSchema.parse(req.body);
  const { transaction, created } = await transactionService.createTransaction(
    req.merchant,
    parsed
  );
  const body = transactionService.serializeTransaction(transaction);
  res.status(created ? 201 : 200).json(body);
});

const statusSchema = z.object({
  referenceId: z.string().max(100).optional(),
  transactionId: z.string().max(60).optional(),
});

export const getPaymentStatus = asyncHandler(async (req, res) => {
  const query = statusSchema.parse(req.query);
  const tx = await transactionService.getTransactionStatus(req.merchant, query);
  res.json(transactionService.serializeTransaction(tx));
});

const cancelSchema = z.object({
  referenceId: z.string().min(1).max(100),
});

export const cancelQrisPayment = asyncHandler(async (req, res) => {
  const { referenceId } = cancelSchema.parse(req.body);
  await transactionService.cancelTransaction(req.merchant, referenceId);
  res.json({ referenceId, status: "EXPIRED" });
});

export const deleteTransaction = asyncHandler(async (req, res) => {
  const { referenceId } = req.params;
  if (!referenceId) throw badRequest("referenceId is required");
  const result = await transactionService.deleteTransaction(req.merchant, referenceId);
  res.json(result);
});
