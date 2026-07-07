import { prisma } from "../config/db.js";
import { logger } from "../config/logger.js";
import {
  extractAmounts,
  findMatchingAmount,
  guessSource,
  guessProvider,
} from "../utils/notif-parser.js";
import { getQrisProvider } from "../utils/qris-tlv.js";
import { dispatchPaymentSuccess } from "./webhook.service.js";

/**
 * Process an inbound payment notification from the detector (Macrodroid).
 *
 * Flow:
 *   1. Extract candidate amounts from notification text.
 *   2. Detect notification provider (e.g. "bankmandiri" dari "Livin Merchant").
 *   3. Find PENDING transactions whose totalAmount is in candidates.
 *      In global mode (no merchantId), only include merchants whose QRIS
 *      provider matches the notification provider — so a GoPay notification
 *      won't match a Bank Mandiri merchant's transaction.
 *   4. Order by createdAt ASC (FIFO).
 *   5. Atomically transition PENDING -> PAID (race-safe via updateMany).
 *   6. Trigger webhook dispatch.
 *
 * @param {{ app?: string, title?: string, text?: string, bigText?: string, summary?: string, amount?: number, timestamp?: string }} notif
 * @param {string} [merchantId] - jika diberikan, hanya cocokkan transaksi merchant ini
 * @returns {Promise<{ matched: boolean, transactionId?: string, amount?: number, candidates: number[], source: string }>}
 */
export async function processNotification(notif, merchantId) {
  const source = guessSource(notif.app, notif.title, notif.text);
  const notifProvider = guessProvider(notif.app, notif.title, notif.text);

  // Caller boleh kirim amount pre-parsed; kalau nggak, kita extract dari corpus.
  const corpus = [
    notif.title,
    notif.bigText,
    notif.text,
    notif.summary,
  ]
    .filter(Boolean)
    .join(" \n ");

  let candidates = [];
  if (typeof notif.amount === "number" && notif.amount > 0) {
    candidates = [notif.amount];
  } else {
    candidates = extractAmounts(corpus);
  }

  logger.info(
    {
      type: "detection.parse",
      merchantId: merchantId ?? null,
      notifProvider,
      source,
      amountGiven: notif.amount ?? null,
      candidates,
      corpusSnippet: corpus.slice(0, 200),
    },
    "[detection] parsed notif"
  );

  if (candidates.length === 0) {
    logger.warn(
      { type: "detection.no-amounts", source, notifProvider, corpus: corpus.slice(0, 200) },
      "[detection] no amounts found in corpus"
    );
    return { matched: false, candidates, source, provider: notifProvider };
  }

  // --- Build query ---
  const where = {
    status: "PENDING",
    totalAmount: { in: candidates },
    expiresAt: { gt: new Date() },
  };

  if (merchantId) {
    // Per-merchant callback: langsung scope ke merchant itu.
    where.merchantId = merchantId;
  } else if (notifProvider) {
    // Global callback + provider terdeteksi: hanya merchant yang QRIS-nya
    // dari provider sama dengan notif. Cegah cross-match antar provider.
    //
    // Ambil semua merchant, filter di app-layer karena provider QRIS harus
    // di-parse dari staticQris (tidak bisa di-query langsung di DB).
    const allMerchants = await prisma.merchant.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, staticQris: true },
    });
    const matchingMerchantIds = allMerchants
      .filter((m) => getQrisProvider(m.staticQris) === notifProvider)
      .map((m) => m.id);

    logger.info(
      {
        type: "detection.provider-filter",
        notifProvider,
        activeMerchants: allMerchants.length,
        matchingMerchants: matchingMerchantIds.length,
        merchantProviders: allMerchants.map((m) => ({
          id: m.id,
          provider: getQrisProvider(m.staticQris),
        })),
      },
      "[detection] provider filter"
    );

    if (matchingMerchantIds.length === 0) {
      logger.warn(
        { type: "detection.no-provider-match", candidates, notifProvider },
        "[detection] no merchant with matching QRIS provider"
      );
      return { matched: false, candidates, source, provider: notifProvider };
    }
    where.merchantId = { in: matchingMerchantIds };
  }
  // else: global + provider unknown → cari lintas semua merchant (backward compat)

  const pending = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, totalAmount: true, referenceId: true, merchantId: true },
  });

  logger.info(
    {
      type: "detection.query",
      where: JSON.parse(JSON.stringify(where)),
      found: pending.length,
      candidates,
      notifProvider,
    },
    "[detection] PENDING query"
  );

  if (pending.length === 0) {
    logger.warn(
      {
        type: "detection.no-pending",
        candidates,
        notifProvider,
        merchantFilter: where.merchantId ?? "ALL",
      },
      "[detection] no matching PENDING transaction"
    );
    return { matched: false, candidates, source, provider: notifProvider };
  }

  // Coba atomically claim satu per satu sampai ada yang sukses.
  const matchedAmount = pending[0].totalAmount;
  let claimed = null;
  for (const cand of pending) {
    const now = new Date();
    const res = await prisma.transaction.updateMany({
      where: {
        id: cand.id,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      data: {
        status: "PAID",
        paidAmount: cand.totalAmount,
        paidAt: now,
        matchedBy: source,
      },
    });
    if (res.count === 1) {
      claimed = cand;
      break;
    }
  }

  if (!claimed) {
    // Semua udah diklaim oleh notif lain (race)
    logger.info({ matchedAmount, source }, "detection: lost race for candidates");
    return { matched: true, candidates, source, provider: notifProvider, lostRace: true };
  }

  logger.info(
    { transactionId: claimed.id, referenceId: claimed.referenceId, matchedAmount, source, provider: notifProvider },
    "detection: transaction marked PAID"
  );

  // Trigger webhook delivery (async, fire-and-forget)
  await dispatchPaymentSuccess(claimed.id);

  return {
    matched: true,
    transactionId: claimed.id,
    amount: matchedAmount,
    candidates,
    source,
    provider: notifProvider,
  };
}
