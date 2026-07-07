import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

import { healthRouter } from "./routes/health.routes.js";
import { brandingRouter } from "./routes/branding.routes.js";
import qrisRoutes from "./routes/v2/qris.routes.js";
import adminAuthRoutes from "./routes/admin/admin-auth.routes.js";
import adminRoutes from "./routes/admin/admin.routes.js";
import adminStatsRoutes from "./routes/admin/admin-stats.routes.js";
import adminSettingsRoutes from "./routes/admin/admin-settings.routes.js";
import callbackRoutes from "./routes/internal/callback.routes.js";
import { legacyRouter } from "./routes/legacy.routes.js";

import { errorHandler, notFound } from "./middlewares/error.js";
import { auditLog } from "./middlewares/auditLog.js";

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// Health & docs (public)
app.use(healthRouter);
app.use(brandingRouter);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Public merchant API (v2) — dengan audit log inbound
app.use("/v2", auditLog);
app.use("/v2", qrisRoutes);

// Internal callback (Macrodroid / payment detector)
app.use("/v2", callbackRoutes);

// Admin API
app.use("/admin", adminAuthRoutes);
app.use("/admin", adminRoutes);
app.use("/admin", adminStatsRoutes);
app.use("/admin", adminSettingsRoutes);

// Legacy /api/* (kept for backward compatibility & QR image parsing tools)
app.use("/api", legacyRouter);

// Fallbacks
app.use(notFound);
app.use(errorHandler);

export default app;
