import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler.js";
import * as adminAuthService from "../../services/admin-auth.service.js";
import { requireAdmin } from "../../middlewares/auth.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * @openapi
 * /admin/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login as admin
 *     description: |
 *       Returns a long-lived `apiToken` used as `X-Admin-Token` on all admin endpoints.
 *       Seeded credentials come from `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email, example: admin@drp.local }
 *               password: { type: string, example: changeme }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apiToken: { type: string, description: "Use as X-Admin-Token header." }
 *                 email:    { type: string, format: email }
 *       401: { $ref: "#/components/schemas/ErrorResponse" }
 */
router.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const result = await adminAuthService.login(email, password);
    res.json(result);
  })
);

/**
 * @openapi
 * /admin/auth/verify:
 *   get:
 *     tags: [Auth]
 *     summary: Verify the current admin token
 *     description: |
 *       Returns `ok: true` and the admin email if the `X-Admin-Token` header is valid.
 *     security:
 *       - adminAuth: []
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, enum: [true] }
 *                 email: { type: string, format: email }
 *       401: { $ref: "#/components/schemas/ErrorResponse" }
 */
router.get(
  "/auth/verify",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, email: req.admin.email, name: req.admin.name });
  })
);

const updateCredentialsSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  oldPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6, "Password minimal 6 karakter").optional(),
});

router.patch(
  "/auth/credentials",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = updateCredentialsSchema.parse(req.body);

    if (!data.name && !data.email && !data.newPassword) {
      return res.status(400).json({ error: "Tidak ada data yang diubah" });
    }

    if (data.name) {
      await adminAuthService.changeName(req.admin.id, data.name);
    }
    if (data.email) {
      await adminAuthService.changeEmail(req.admin.id, data.email);
    }
    if (data.oldPassword && data.newPassword) {
      await adminAuthService.changePassword(req.admin.id, data.oldPassword, data.newPassword);
    }

    const admin = await adminAuthService.findByToken(req.admin.apiToken);
    res.json({ email: admin.email, name: admin.name, ok: true });
  })
);

export default router;
