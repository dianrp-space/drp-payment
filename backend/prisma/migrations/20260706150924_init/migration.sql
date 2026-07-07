-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('NONE', 'PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "apiKeyHash" TEXT NOT NULL,
    "apiKeyHint" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "staticQris" TEXT NOT NULL,
    "status" "MerchantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "uniqueDigit" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "qrisString" TEXT NOT NULL,
    "qrisImageBase64" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "paidAmount" INTEGER,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "matchedBy" TEXT,
    "webhookStatus" "WebhookStatus" NOT NULL DEFAULT 'NONE',
    "webhookAttempts" INTEGER NOT NULL DEFAULT 0,
    "webhookSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'payment.success',
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiLog" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_apiKeyHash_key" ON "Merchant"("apiKeyHash");

-- CreateIndex
CREATE INDEX "Merchant_status_idx" ON "Merchant"("status");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_status_createdAt_idx" ON "Transaction"("merchantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_status_expiresAt_idx" ON "Transaction"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Transaction_totalAmount_status_idx" ON "Transaction"("totalAmount", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_merchantId_referenceId_key" ON "Transaction"("merchantId", "referenceId");

-- CreateIndex
CREATE INDEX "WebhookLog_transactionId_idx" ON "WebhookLog"("transactionId");

-- CreateIndex
CREATE INDEX "ApiLog_merchantId_createdAt_idx" ON "ApiLog"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_createdAt_idx" ON "ApiLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
