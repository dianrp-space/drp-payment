-- AlterTable AppSetting
ALTER TABLE "AppSetting" ADD COLUMN "shopeepayGatewayUrl" TEXT,
ADD COLUMN "shopeepayGatewayApiKeyEncrypted" TEXT,
ADD COLUMN "shopeepayQrisStatic" TEXT;
