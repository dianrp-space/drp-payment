import { logger } from "../config/logger.js";
import { expireStaleTransactions } from "../services/transaction.service.js";
import { processPendingRetries } from "../services/webhook.service.js";

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
  JOBS.push({ name, handle });
  logger.info({ job: name, intervalMs }, "scheduled job");
}

export function startJobs() {
  // Expire PENDING transactions every 1 minute
  register("expire-stale", () => expireStaleTransactions(), 60_000);

  // Retry failed webhooks every 30 seconds
  register("webhook-retries", () => processPendingRetries(), 30_000);
}

export function stopJobs() {
  for (const j of JOBS) clearInterval(j.handle);
  JOBS.length = 0;
}
