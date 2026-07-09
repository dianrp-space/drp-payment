import { logger } from "../config/logger.js";
import { expireStaleTransactions } from "../services/transaction.service.js";
import { processPendingRetries } from "../services/webhook.service.js";
import { deleteAuditLogsOlderThan } from "../services/admin.service.js";
import { getAuditCleanupSettings } from "../services/app-setting.service.js";

/**
 * Cron-style scheduler using setInterval. Lightweight, no extra dep.
 * Untuk production multi-instance sebaiknya pindah ke BullMQ/Redis-based queue,
 * tapi untuk single-node gateway ini cukup.
 */
const JOBS = [];

function register(name, fn, intervalMs) {
  const run = async () => {
    const started = Date.now();
    try {
      const result = await fn();
      logger.debug(
        { job: name, durationMs: Date.now() - started, result },
        "job completed"
      );
    } catch (err) {
      logger.error({ err, job: name }, "job failed");
    }
  };
  // Initial fire (async, non-blocking) + interval
  setTimeout(run, 5_000);
  const handle = setInterval(run, intervalMs);
  JOBS.push({ name, handle, fn, intervalMs });
  logger.info({ job: name, intervalMs }, "scheduled job");
}

function unregister(name) {
  const idx = JOBS.findIndex((j) => j.name === name);
  if (idx === -1) return;
  clearInterval(JOBS[idx].handle);
  JOBS.splice(idx, 1);
}

/**
 * Re-register audit-cleanup job dengan interval baru dari DB.
 * Dipanggil saat setting diubah dari dashboard.
 */
export async function rescheduleAuditCleanup() {
  const settings = await getAuditCleanupSettings();
  const intervalMs = settings.intervalHours * 60 * 60_000;
  unregister("audit-cleanup");
  register(
    "audit-cleanup",
    async () => {
      const s = await getAuditCleanupSettings();
      if (!s.enabled) return { skipped: true, reason: "disabled" };
      return deleteAuditLogsOlderThan(s.retentionDays);
    },
    intervalMs
  );
  logger.info(
    { job: "audit-cleanup", intervalHours: settings.intervalHours, intervalMs },
    "audit-cleanup rescheduled"
  );
}

export function startJobs() {
  // Expire PENDING transactions every 1 minute
  register("expire-stale", () => expireStaleTransactions(), 60_000);

  // Retry failed webhooks every 30 seconds
  register("webhook-retries", () => processPendingRetries(), 30_000);

  // Auto-cleanup audit logs — interval & retention dibaca dari DB,
  // bisa diubah dari dashboard (akan re-register job).
  rescheduleAuditCleanup();
}

export function stopJobs() {
  for (const j of JOBS) clearInterval(j.handle);
  JOBS.length = 0;
}
