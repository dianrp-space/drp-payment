import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as appSettingService from "../services/app-setting.service.js";

export const brandingRouter = Router();

/**
 * @openapi
 * /branding:
 *   get:
 *     tags: [System]
 *     summary: Public app branding (name, logo, favicon)
 *     description: |
 *       Mengembalikan branding yang dipakai seluruh konsol (header, sidebar,
 *       login page, `<title>`, dan favicon). Publik — tidak butuh auth —
 *       supaya halaman login pun bisa pakai branding sebelum login.
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
async function brandingHandler(_req, res) {
  const branding = await appSettingService.getBranding();
  res.json({ branding });
}

brandingRouter.get("/branding", asyncHandler(brandingHandler));
brandingRouter.get("/api/branding", asyncHandler(brandingHandler));
