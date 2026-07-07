-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN "callbackToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_callbackToken_key" ON "Merchant"("callbackToken");
