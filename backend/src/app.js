import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import swaggerUi from "swagger-ui-express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { swaggerSpec } from "./swagger.js";
import { isProd, corsOrigins } from "./config/env.js";

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

// Trust reverse proxy (Nginx) supaya req.ip = IP client asli, bukan 127.0.0.1.
app.set("trust proxy", 1);

// Helmet: set security headers (X-Content-Type-Options, HSTS, frame-opts, dll).
// CSP di-tune agar dashboard Vue (Vite build) jalan: 'self' untuk script & style,
// 'unsafe-inline' untuk style (Tailwind/Vue inject style), img blob/data untuk QR,
// font dari Google Fonts, connect ke gateway sendiri.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS: hanya whitelist origin dari env (APP_URL / CORS_ORIGINS).
// Development tanpa APP_URL: izinkan * (untuk Vite dev server lokal).
app.use(
  cors({
    origin: corsOrigins.includes("*") ? true : corsOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(bodyParser.json({ limit: "2mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "2mb" }));

// --- Rate limiter ---
// Login endpoint: ketat, anti brute-force.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000, // 15 menit
  limit: 20, // max 20 attempt / 15 menit per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit.",
    code: "RATE_LIMITED",
  },
});

// Legacy /api/* (publik, ada SSRF-prone endpoint): batasi burst.
const apiLimiter = rateLimit({
  windowMs: 60_000, // 1 menit
  limit: 30, // max 30 request / menit per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Rate limit tercapai. Coba lagi sebentar lagi.",
    code: "RATE_LIMITED",
  },
});

// Health & docs (public)
app.use(healthRouter);
app.use(brandingRouter);

// Swagger UI: nonaktifkan di production (cegah expose surface API).
if (!isProd) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} else {
  app.use("/api-docs", (_req, res) =>
    res.status(404).json({ error: "API docs disabled in production", code: "NOT_FOUND" })
  );
}

// Public merchant API (v2) — dengan audit log inbound
app.use("/v2", auditLog);
app.use("/v2", qrisRoutes);

// Internal callback (Macrodroid / payment detector)
app.use("/v2", callbackRoutes);

// Admin API
app.use("/admin/auth/login", loginLimiter);
app.use("/admin", adminAuthRoutes);
app.use("/admin", adminRoutes);
app.use("/admin", adminStatsRoutes);
app.use("/admin", adminSettingsRoutes);

// Legacy /api/* (kept for backward compatibility & QR image parsing tools)
app.use("/api", apiLimiter, legacyRouter);

// Fallbacks
app.use(notFound);
app.use(errorHandler);

export default app;
