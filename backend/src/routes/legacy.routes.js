import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../utils/asyncHandler.js";
import { decodeQRFromImage } from "../utils/qris-image.js";
import { generateDynamicQRIS, renderQrisImage } from "../utils/qris-builder.js";
import { assertSafeFetchUrl } from "../utils/ssrf.js";
import { badRequest } from "../utils/errors.js";

export const legacyRouter = Router();
// Batasi upload: 2MB, field tunggal "file".
const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024, fields: 5, files: 1 },
});

/**
 * Legacy endpoint kept for backward compatibility.
 * Generates a one-off dynamic QRIS (no persistence, no merchant context).
 *
 * @openapi
 * /api/generate:
 *   post:
 *     tags: [Legacy]
 *     summary: Generate dynamic QRIS (legacy, stateless)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [staticQris, amount]
 *             properties:
 *               staticQris: { type: string }
 *               amount: { type: number }
 *               fee: { type: number }
 *     responses:
 *       200: { description: OK }
 */
legacyRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const { staticQris, amount, fee } = req.body;
    if (!staticQris || !amount) throw badRequest("Missing data");
    const total = Math.trunc(Number(amount)) + Math.trunc(Number(fee) || 0);
    const dynamicQris = generateDynamicQRIS(staticQris, total);
    const qrImage = await renderQrisImage(dynamicQris);
    res.json({ dynamicQris, qrImage });
  })
);

/** @openapi
 * /api/parse-image:
 *   post:
 *     tags: [Legacy]
 *     summary: Decode QRIS from uploaded image
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 */
legacyRouter.post(
  "/parse-image",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("No file uploaded");
    const qris = await decodeQRFromImage(req.file.buffer);
    res.json({ qris });
  })
);

/** @openapi
 * /api/parse-image-url:
 *   post:
 *     tags: [Legacy]
 *     summary: Decode QRIS from image URL
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageUrl]
 *             properties:
 *               imageUrl: { type: string }
 */
legacyRouter.post(
  "/parse-image-url",
  asyncHandler(async (req, res) => {
    const { imageUrl } = req.body;
    if (!imageUrl) throw badRequest("Missing imageUrl");
    assertSafeFetchUrl(imageUrl);
    const r = await fetch(imageUrl);
    if (!r.ok) throw badRequest("Failed to fetch image from URL");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024) {
      throw badRequest("Image too large (max 2MB)");
    }
    const qris = await decodeQRFromImage(buf);
    res.json({ qris });
  })
);
