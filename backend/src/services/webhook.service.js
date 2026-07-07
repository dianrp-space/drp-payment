import { prisma } from "../config/db.js";
import { logger } from "../config/logger.js";
import { signWebhook, signJwt } from "../utils/crypto.js";

// Exponential backoff schedule (in seconds). Max 6 attempts.
const BACKOFF_SECONDS = [0, 30, 120, 600, 1800, 7200]; // now, 30s, 2m, 10m, 30m, 2h
const MAX_ATTEMPTS = BACKOFF_SECONDS.length;

/**
 * Trigger delivery of payment.success webhook for a transaction.
 * If the merchant has no webhookUrl, the webhook is marked NONE.
 */
export async function dispatchPaymentSuccess(transactionId) {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { merchant: true },
  });
  if (!tx) {
    logger.warn({ transactionId }, "dispatch: transaction not found");
    return;
  }
  if (tx.status !== "PAID") {
    logger.warn(
      { transactionId, status: tx.status },
      "dispatch: skipping non-PAID transaction"
    );
    return;
  }
  if (!tx.merchant.webhookUrl) {
    logger.debug({ transactionId }, "dispatch: merchant has no webhookUrl");
    return;
  }

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { webhookStatus: "PENDING" },
  });

  // Fire-and-forget: delivery attempt #1 segera, sisanya via cron.
  attemptDelivery(transactionId, 1).catch((err) =>
    logger.error({ err, transactionId }, "dispatch attempt #1 failed")
  );
}

/**
 * Attempt to deliver the webhook for a transaction at the given attempt number.
 * Records every attempt in WebhookLog.
 */
export async function attemptDelivery(transactionId, attempt) {
  if (attempt > MAX_ATTEMPTS) {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { webhookStatus: "FAILED" },
    });
    logger.warn({ transactionId, attempt }, "webhook: max attempts reached");
    return;
  }

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { merchant: true },
  });
  if (!tx || tx.status !== "PAID" || !tx.merchant.webhookUrl) return;
  if (tx.webhookStatus === "SENT") return;

  const payload = buildPayload(tx);
  const rawBody = JSON.stringify(payload);
  const signature = signWebhook(tx.merchant.webhookSecret, rawBody);
  const token = signJwt(payload, tx.merchant.webhookSecret);

  const logEntry = await prisma.webhookLog.create({
    data: {
      transactionId,
      attempt,
      eventType: "payment.success",
      payload,
      success: false,
    },
  });

  let statusCode = null;
  let success = false;
  let errorMessage = null;
  let responseBody = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(tx.merchant.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Signature": signature,
        "X-DRP-Token": token,
        "X-Event-Type": "payment.success",
        "X-Event-Id": logEntry.id,
        "User-Agent": "DRP-Payment-Gateway/2.0 (+https://dianrp.com)",
      },
      body: rawBody,
      signal: controller.signal,
    });
      clearTimeout(timeout);
      statusCode = res.status;
      responseBody = (await res.text()).slice(0, 4000);
      success = res.status >= 200 && res.status < 300;
    } catch (e) {
      errorMessage = e.name === "AbortError" ? "timeout" : e.message;
    }

    await prisma.webhookLog.update({
      where: { id: logEntry.id },
      data: { statusCode, success, responseBody, errorMessage },
    });

    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        webhookStatus: success ? "SENT" : "FAILED",
        webhookAttempts: attempt,
        webhookSentAt: success ? new Date() : tx.webhookSentAt,
      },
    });

    if (!success) {
      logger.warn(
        { transactionId, attempt, statusCode, errorMessage },
        "webhook delivery failed; will retry per backoff"
      );
    } else {
      logger.info({ transactionId, attempt, statusCode }, "webhook delivered");
    }
}

/**
 * Build the payment.success payload sent to the merchant.
 */
function buildPayload(tx) {
  return {
    event: "payment.success",
    transactionId: tx.id,
    referenceId: tx.referenceId,
    merchantId: tx.merchantId,
    amount: tx.amount,
    fee: tx.fee,
    uniqueDigit: tx.uniqueDigit,
    totalAmount: tx.totalAmount,
    paidAmount: tx.paidAmount ?? tx.totalAmount,
    status: tx.status,
    paidAt: tx.paidAt,
    createdAt: tx.createdAt,
  };
}

/**
 * Find transactions whose webhook is FAILED/PENDING and due for the next retry.
 * Called by a periodic cron job.
 */
export async function processPendingRetries(now = new Date()) {
  const failed = await prisma.transaction.findMany({
    where: {
      status: "PAID",
      webhookStatus: "FAILED",
      webhookAttempts: { lt: MAX_ATTEMPTS },
    },
    select: { id: true, webhookAttempts: true, updatedAt: true },
  });

  let enqueued = 0;
  for (const tx of failed) {
    const nextAttempt = (tx.webhookAttempts ?? 0) + 1;
    const backoffSec =
      BACKOFF_SECONDS[Math.min(nextAttempt - 1, BACKOFF_SECONDS.length - 1)] ?? 0;
    const dueAt = new Date(tx.updatedAt.getTime() + backoffSec * 1000);
    if (dueAt <= now) {
      attemptDelivery(tx.id, nextAttempt).catch((err) =>
        logger.error({ err, transactionId: tx.id }, "retry attempt failed")
      );
      enqueued++;
    }
  }
  if (enqueued > 0) {
    logger.info({ enqueued }, "webhook retries enqueued");
  }
  return enqueued;
}
