-- Tambah mode ShopeePay + opsi gateway per-merchant (opsional, fallback ke global).
ALTER TYPE "QrisMode" ADD VALUE 'SHOPEEPAY';

-- AlterTable Merchant
ALTER TABLE "Merchant" ADD COLUMN "shopeepayGatewayUrl" TEXT,
ADD COLUMN "shopeepayGatewayApiKeyEncrypted" TEXT;
