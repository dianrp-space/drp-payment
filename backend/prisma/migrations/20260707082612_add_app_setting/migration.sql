-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "appName" TEXT,
    "appLogoBase64" TEXT,
    "faviconBase64" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);
