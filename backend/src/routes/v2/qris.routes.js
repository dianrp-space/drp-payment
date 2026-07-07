import { Router } from "express";
import { requireMerchant } from "../../middlewares/auth.js";
import {
  createQrisPayment,
  getPaymentStatus,
  cancelQrisPayment,
} from "../../controllers/transaction.controller.js";

const router = Router();

/**
 * @openapi
 * /v2/qris:
 *   post:
 *     tags: [QRIS Payments]
 *     summary: Create a QRIS payment
 *     description: Generate a dynamic QRIS for the merchant and persist a PENDING transaction.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: "#/components/schemas/CreateQrisRequest"
 *     responses:
 *       201: { description: Transaction created, $ref: "#/components/schemas/TransactionResponse" }
 *       200: { description: Existing PENDING transaction returned (idempotent) }
 *       400: { $ref: "#/components/schemas/ErrorResponse" }
 *       409: { description: referenceId already used for a non-PENDING transaction }
 */
router.post("/qris", requireMerchant, createQrisPayment);

/**
 * @openapi
 * /v2/payment-status:
 *   get:
 *     tags: [QRIS Payments]
 *     summary: Check payment status
 *     description: Query status by `referenceId` (per-merchant) or `transactionId`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: referenceId
 *         schema: { type: string }
 *       - in: query
 *         name: transactionId
 *         schema: { type: string }
 *     responses:
 *       200: { $ref: "#/components/schemas/TransactionResponse" }
 *       404: { $ref: "#/components/schemas/ErrorResponse" }
 */
router.get("/payment-status", requireMerchant, getPaymentStatus);

/**
 * @openapi
 * /v2/qris-cancel:
 *   post:
 *     tags: [QRIS Payments]
 *     summary: Cancel a PENDING QRIS transaction
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [referenceId]
 *             properties:
 *               referenceId: { type: string }
 *     responses:
 *       200: { description: Cancelled }
 *       422: { description: Transaction not PENDING }
 */
router.post("/qris-cancel", requireMerchant, cancelQrisPayment);

export default router;
