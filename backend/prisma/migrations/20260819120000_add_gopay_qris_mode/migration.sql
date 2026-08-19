-- CreateEnum
CREATE TYPE "QrisMode" AS ENUM ('OTHERS', 'GOPAY');

-- AlterTable Merchant
ALTER TABLE "Merchant" ADD COLUMN "qrisMode" "QrisMode" NOT NULL DEFAULT 'OTHERS';
ALTER TABLE "Merchant" ADD COLUMN "gopayGatewayUrl" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "gopayGatewayApiKeyEncrypted" TEXT;

-- AlterTable AppSetting
ALTER TABLE "AppSetting" ADD COLUMN "gopayGatewayUrl" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN "gopayGatewayApiKeyEncrypted" TEXT;
