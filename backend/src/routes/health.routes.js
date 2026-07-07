import { Router } from "express";

export const healthRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     responses:
 *       200: { $ref: "#/components/schemas/HealthResponse" }
 */
healthRouter.get("/health", (_req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});
