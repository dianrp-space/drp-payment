import { Router } from "express";
import { requireAdmin } from "../../middlewares/auth.js";
import {
  getStats,
  listTransactions,
  getTransaction,
  retryWebhook,
  deleteTransaction,
  listAuditLogs,
  cleanupAuditLogs,
  getAuditStats,
} from "../../controllers/admin-stats.controller.js";

const router = Router();

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Dashboard stats
 *     security: [ { adminAuth: [] } ]
 *     responses:
 *       200: { description: Aggregated counts & recent activity }
 */
router.get("/stats", requireAdmin, getStats);

/**
 * @openapi
 * /admin/transactions:
 *   get:
 *     tags: [Admin]
 *     summary: List all transactions (cross-merchant)
 *     security: [ { adminAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, PAID, EXPIRED, FAILED] }
 *       - in: query
 *         name: merchantId
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         schema: { type: string, description: "Search referenceId / id" }
 */
router.get("/transactions", requireAdmin, listTransactions);

/**
 * @openapi
 * /admin/transactions/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Transaction detail (with webhook logs)
 *     security: [ { adminAuth: [] } ]
 */
router.get("/transactions/:id", requireAdmin, getTransaction);
router.post("/transactions/:id/retry-webhook", requireAdmin, retryWebhook);
router.delete("/transactions/:id", requireAdmin, deleteTransaction);

/**
 * @openapi
 * /admin/audit-logs:
 *   get:
 *     tags: [Admin]
 *     summary: List inbound API call logs (audit)
 *     security: [ { adminAuth: [] } ]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 25, maximum: 100 }
 *       - in: query
 *         name: method
 *         schema: { type: string, enum: [GET, POST, PATCH, PUT, DELETE] }
 *       - in: query
 *         name: statusCodeFrom
 *         schema: { type: integer, description: "Range start (e.g. 400 for 4xx)" }
 *       - in: query
 *         name: statusCodeTo
 *         schema: { type: integer, description: "Range end (e.g. 499 for 4xx)" }
 *       - in: query
 *         name: merchantId
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         schema: { type: string, description: "Search path / merchantId / IP" }
 */
router.get("/audit-logs", requireAdmin, listAuditLogs);
router.post("/audit-logs/cleanup", requireAdmin, cleanupAuditLogs);
router.get("/audit-logs/stats", requireAdmin, getAuditStats);

export default router;
