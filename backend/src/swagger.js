import swaggerJsdoc from "swagger-jsdoc";
import { env, appUrl } from "./config/env.js";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "DRP Payment Gateway API",
      version: "2.0.0",
      description:
        "QRIS-only payment gateway. Create a dynamic QRIS transaction, " +
        "let the customer pay, and receive a signed webhook when PAID.",
      contact: { name: "DRP Network Solutions" },
    },
    servers: [
      { url: appUrl, description: "API base URL" },
    ],
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
          required: ["name", "staticQris"],
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email" },
            staticQris: {
              type: "string",
              description: "Static QRIS milik merchant (CRC valid).",
            },
            webhookUrl: { type: "string", format: "uri" },
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
  apis: [
    "./src/routes/**/*.js",
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
