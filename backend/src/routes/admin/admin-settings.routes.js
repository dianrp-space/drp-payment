import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as appSettingService from "../../services/app-setting.service.js";
import { rescheduleAuditCleanup } from "../../jobs/index.js";

const router = Router();

const DATA_URL_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/;

const updateSchema = z.object({
  appName: z.string().max(100).nullable().optional(),
  appLogoBase64: z
    .string()
    .max(500_000, "Logo terlalu besar (maks ~375KB)")
    .regex(DATA_URL_RE, "appLogoBase64 harus data URL gambar")
    .nullable()
    .optional(),
  faviconBase64: z
    .string()
    .max(500_000, "Favicon terlalu besar (maks ~375KB)")
    .regex(DATA_URL_RE, "faviconBase64 harus data URL gambar")
    .nullable()
    .optional(),
});

const auditCleanupSchema = z.object({
  enabled: z.boolean().optional(),
  retentionDays: z.coerce.number().int().min(1).max(3650).optional(),
  intervalHours: z.coerce.number().int().min(1).max(168).optional(),
});

/**
 * @openapi
 * /admin/settings/branding:
 *   get:
 *     tags: [Admin]
 *     summary: Get current app branding
 *     security: [ { adminAuth: [] } ]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 branding:
 *                   type: object
 *                   properties:
 *                     appName:       { type: string }
 *                     appLogoBase64: { type: string, nullable: true }
 *                     faviconBase64: { type: string, nullable: true }
 */
router.get(
  "/settings/branding",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const branding = await appSettingService.getBranding();
    res.json({ branding });
  })
);

/**
 * @openapi
 * /admin/settings/branding:
 *   patch:
 *     tags: [Admin]
 *     summary: Update app branding (name, logo, favicon)
 *     description: |
 *       Kirim field yang ingin diubah. `null` = reset ke default.
 *       `appLogoBase64` & `faviconBase64` harus berupa data URL gambar
 *       (`data:image/...;base64,...`).
 *     security: [ { adminAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               appName:       { type: string, nullable: true }
 *               appLogoBase64: { type: string, nullable: true }
 *               faviconBase64: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 branding:
 *                   type: object
 *                   properties:
 *                     appName:       { type: string }
 *                     appLogoBase64: { type: string, nullable: true }
 *                     faviconBase64: { type: string, nullable: true }
 */
router.patch(
  "/settings/branding",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const branding = await appSettingService.updateBranding(data);
    res.json({ branding });
  })
);

// ---- Audit log auto-cleanup settings ----

router.get(
  "/settings/audit-cleanup",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const settings = await appSettingService.getAuditCleanupSettings();
    res.json({ settings });
  })
);

router.patch(
  "/settings/audit-cleanup",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = auditCleanupSchema.parse(req.body);
    const settings = await appSettingService.updateAuditCleanupSettings(data);
    // Re-register cron job dengan interval baru (no restart needed).
    await rescheduleAuditCleanup();
    res.json({ settings });
  })
);

export default router;
