import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import swaggerJsdoc from "swagger-jsdoc";
import { appUrl } from "./config/env.js";

export function buildSwaggerOptions(serverUrl = appUrl) {
  return {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "DRP Payment Gateway API",
        version: "2.0.0",
        description: [
          "QRIS-only payment gateway. Create a dynamic QRIS transaction,",
          "let the customer pay, and receive a signed webhook when PAID.",
          "",
          "## Authentication (merchant API)",
          "Pass your merchant API key as `Authorization: Bearer drp_live_...`.",
          "",
          "## Outgoing webhook auth (`webhookSecret`)",
          "When a transaction becomes **PAID**, the gateway POSTs `payment.success`",
          "to the merchant `webhookUrl`. The same `webhookSecret` is used in **two** ways —",
          "pick either (or both):",
          "",
          "### 1. HMAC-SHA256 — header `X-Signature`",
          "- Algorithm: **HMAC-SHA256**",
          "- Key: merchant `webhookSecret`",
          "- Message: **raw request body** (exact JSON bytes, before `JSON.parse`)",
          "- Encoding: **hex** digest",
          "- Header: `X-Signature: <hex>`",
          "",
          "### 2. JWT HS256 — headers `X-DRP-Token` and `Authorization`",
          "- Algorithm: **HS256**",
          "- Secret: merchant `webhookSecret`",
          "- Headers: `X-DRP-Token: <jwt>` and `Authorization: Bearer <jwt>` (same token)",
          "- Token TTL: **5 minutes**",
          "- Useful for n8n / no-code: JWT Verify → algorithm `HS256` → secret = `webhookSecret`",
          "",
          "### Other webhook headers",
          "- `X-Event-Type: payment.success`",
          "- `X-Event-Id: <uuid>` — use as idempotency key",
          "- `Content-Type: application/json`",
          "",
          "Retry on non-2xx: `30s → 2m → 10m → 30m → 2h` (max 6 attempts).",
        ].join("\n"),
        contact: { name: "DRP Network Solutions" },
      },
      servers: [{ url: serverUrl, description: "API base URL" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            description:
              "Merchant API key in form `drp_live_...`. Pass as `Authorization: Bearer <key>`.",
          },
          adminAuth: {
            type: "apiKey",
            in: "header",
            name: "X-Admin-Token",
          },
          internalAuth: {
            type: "apiKey",
            in: "header",
            name: "X-Internal-Token",
          },
        },
        schemas: {
          HealthResponse: {
            type: "object",
            properties: {
              status: { type: "string", example: "OK" },
              timestamp: { type: "string", format: "date-time" },
            },
          },
          CreateQrisRequest: {
            type: "object",
            required: ["referenceId", "amount"],
            properties: {
              referenceId: {
                type: "string",
                description: "Your unique order/payment id (idempotency key).",
                example: "INV-2026-0001",
              },
              amount: {
                type: "integer",
                description: "Nominal dalam IDR (tanpa desimal).",
                example: 25000,
              },
              fee: {
                type: "integer",
                minimum: 0,
                description: "Biaya layanan opsional (default 0).",
                example: 0,
              },
              expiresInMinutes: {
                type: "integer",
                minimum: 1,
                maximum: 1440,
                description: "TTL transaksi (default 15 menit).",
                example: 15,
              },
            },
          },
          TransactionResponse: {
            type: "object",
            properties: {
              transactionId: { type: "string" },
              referenceId: { type: "string" },
              status: {
                type: "string",
                enum: ["PENDING", "PAID", "EXPIRED", "FAILED"],
              },
              amount: { type: "integer" },
              fee: { type: "integer" },
              uniqueDigit: {
                type: "integer",
                description:
                  "3-digit suffix added to amount+fee to make totalAmount globally unique.",
              },
              totalAmount: {
                type: "integer",
                description: "Nominal PASTI yang harus dibayar customer.",
              },
              qrisString: { type: "string" },
              qrisImageBase64: {
                type: "string",
                description: "data:image/png;base64,...",
              },
              expiresAt: { type: "string", format: "date-time" },
              paidAt: { type: "string", format: "date-time", nullable: true },
              paidAmount: { type: "integer", nullable: true },
              createdAt: { type: "string", format: "date-time" },
            },
          },
          CreateMerchantRequest: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string" },
              email: { type: "string", format: "email" },
              staticQris: {
                type: "string",
                description:
                  "Static QRIS milik merchant (CRC valid). Wajib untuk mode OTHERS; untuk GOPAY diambil otomatis dari gateway GoBiz.",
              },
              qrisImageBase64: {
                type: "string",
                description: "data:image/png;base64,... (mode OTHERS)",
              },
              webhookUrl: { type: "string", format: "uri" },
              qrisMode: {
                type: "string",
                enum: ["OTHERS", "GOPAY"],
                description: "OTHERS = MacroDroid callback, GOPAY = poll gopay-qris gateway",
              },
              gopayGatewayUrl: {
                type: "string",
                format: "uri",
                nullable: true,
                description: "URL instance gopay-qris custom (opsional, mode GOPAY)",
              },
              gopayGatewayApiKey: {
                type: "string",
                nullable: true,
                description: "API key instance gopay-qris custom (opsional, mode GOPAY)",
              },
            },
          },
          ErrorResponse: {
            type: "object",
            properties: {
              error: { type: "string" },
              code: { type: "string" },
              details: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
    },
    apis: ["./src/routes/**/*.js"],
  };
}

/** Build OpenAPI object via swagger-jsdoc (dev / generate-openapi). */
export function generateSwaggerSpec(serverUrl = appUrl) {
  return swaggerJsdoc(buildSwaggerOptions(serverUrl));
}

function resolveOpenApiPath() {
  // Production (PM2 cwd = backend/): dist/openapi.json next to dist/server.cjs
  // Also accept openapi.json in cwd for custom layouts.
  const candidates = [
    path.join(process.cwd(), "dist", "openapi.json"),
    path.join(process.cwd(), "openapi.json"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function loadSwaggerSpec() {
  const openapiPath = resolveOpenApiPath();
  if (openapiPath) {
    const spec = JSON.parse(readFileSync(openapiPath, "utf8"));
    spec.servers = [{ url: appUrl, description: "API base URL" }];
    return spec;
  }
  // Local/dev: scan route JSDoc from source tree
  return generateSwaggerSpec(appUrl);
}

export const swaggerSpec = loadSwaggerSpec();
