-- Audit log auto-cleanup settings (nullable; null = use app default).
ALTER TABLE "AppSetting" ADD COLUMN "auditRetentionDays" INTEGER;
ALTER TABLE "AppSetting" ADD COLUMN "auditCleanupEnabled" BOOLEAN;
