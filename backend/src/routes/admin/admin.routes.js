import { Router } from "express";
import { requireAdmin } from "../../middlewares/auth.js";
import {
  createMerchant,
  listMerchants,
  getMerchant,
  updateMerchant,
  updateWebhook,
  rotateApiKey,
  rotateWebhookSecret,
  rotateCallbackToken,
  setStatus,
  deleteMerchant,
  getMerchantQrImage,
  revealMerchantApiKey,
  testMerchantWebhook,
} from "../../controllers/admin.controller.js";

const router = Router();

/**
 * @openapi
 * /admin/merchants:
 *   post:
 *     tags: [Admin]
 *     summary: Register a new merchant
 *     security:
 *       - adminAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: "#/components/schemas/CreateMerchantRequest" }
 *     responses:
 *       201: { description: Merchant created (returns raw apiKey once) }
 */
router.post("/merchants", requireAdmin, createMerchant);

/**
 * @openapi
 * /admin/merchants:
 *   get:
 *     tags: [Admin]
 *     summary: List all merchants
 *     security: [ { adminAuth: [] } ]
 */
router.get("/merchants", requireAdmin, listMerchants);

router.get("/merchants/:id", requireAdmin, getMerchant);
router.get("/merchants/:id/qr-image", requireAdmin, getMerchantQrImage);
router.get("/merchants/:id/api-key", requireAdmin, revealMerchantApiKey);

router.patch("/merchants/:id", requireAdmin, updateMerchant);
router.delete("/merchants/:id", requireAdmin, deleteMerchant);

router.patch("/merchants/:id/webhook", requireAdmin, updateWebhook);
router.post("/merchants/:id/rotate-api-key", requireAdmin, rotateApiKey);
router.post(
  "/merchants/:id/rotate-webhook-secret",
  requireAdmin,
  rotateWebhookSecret
);
router.post("/merchants/:id/rotate-callback-token", requireAdmin, rotateCallbackToken);
router.patch("/merchants/:id/status", requireAdmin, setStatus);
router.post("/merchants/:id/test-webhook", requireAdmin, testMerchantWebhook);

export default router;
