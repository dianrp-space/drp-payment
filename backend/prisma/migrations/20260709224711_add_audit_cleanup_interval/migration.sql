-- Audit log auto-cleanup: interval in hours between runs (default 6).
ALTER TABLE "AppSetting" ADD COLUMN "auditCleanupIntervalHours" INTEGER;
