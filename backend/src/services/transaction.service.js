import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { generateDynamicQRIS, renderQrisImage } from "../utils/qris-builder.js";
import { pickUniqueDigit } from "./unique-digit.service.js";
import {
  badRequest,
  conflict,
  notFound,
  unprocessable,
} from "../utils/errors.js";

const DEFAULT_CURRENCY_NOTE =
  "amount must be a positive integer IDR value (e.g. 10000)";

// Prisma error code untuk unique constraint violation.
const PRISMA_UNIQUE_VIOLATION = "P2002";
// Max retry kalau race condition pada unique index totalAmount (PENDING).
const UNIQUE_DIGIT_MAX_RETRIES = 3;

/** Validate amount is a positive integer within sane bounds. */
function validateAmount(amount) {
  const n = Math.trunc(Number(amount));
  if (!Number.isFinite(n) || n < 100) {
    throw badRequest(DEFAULT_CURRENCY_NOTE + " (min 100)");
  }
  if (n > 1_000_000_000) {
    throw badRequest(DEFAULT_CURRENCY_NOTE + " (max 1.000.000.000)");
  }
  return n;
}

/**
 * Create a QRIS transaction for a merchant.
 * Idempotent on (merchantId, referenceId): re-returns existing PENDING trx.
 *
 * @param {object} merchant - resolved merchant row (from auth middleware)
 * @param {{ referenceId: string, amount: number, fee?: number, expiresInMinutes?: number }} input
 */
export async function createTransaction(merchant, input) {
  const referenceId = String(input.referenceId ?? "").trim();
  if (!referenceId) throw badRequest("referenceId is required");
  if (referenceId.length > 100) {
    throw badRequest("referenceId max 100 chars");
  }

  const amount = validateAmount(input.amount);
  const fee = Math.max(0, Math.trunc(Number(input.fee ?? 0)));

  // Idempotency: existing transaction with same (merchantId, referenceId)
  const existing = await prisma.transaction.findUnique({
    where: {
      merchantId_referenceId: { merchantId: merchant.id, referenceId },
    },
  });
  if (existing) {
    if (existing.status === "PENDING") {
      return { transaction: existing, created: false };
    }
    throw conflict(
      `Transaction with referenceId '${referenceId}' already ${existing.status}`
    );
  }

  // Generate unique digit agar totalAmount unik per merchant di antara PENDING
  const baseAmount = amount + fee;

  // Render & persist dengan retry jika race condition pada unique index
  // (Transaction_merchantId_totalAmount_pending_unique). pickUniqueDigit cek di memori,
  // jadi dua request konkuren bisa dapat digit sama; DB index yang jadi pengawal.
  let transaction = null;
  let lastErr = null;
  for (let attempt = 0; attempt < UNIQUE_DIGIT_MAX_RETRIES; attempt++) {
    const uniqueDigit = await pickUniqueDigit(baseAmount, merchant.id);
    const totalAmount = baseAmount + uniqueDigit;
    const qrisString = generateDynamicQRIS(merchant.staticQris, totalAmount);
    const qrisImageBase64 = await renderQrisImage(qrisString, env.QR_IMAGE_FORMAT);

    const expiresInMinutes = Math.max(
      1,
      Math.trunc(Number(input.expiresInMinutes ?? env.DEFAULT_EXPIRY_MINUTES))
    );
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);

    try {
      transaction = await prisma.transaction.create({
        data: {
          merchantId: merchant.id,
          referenceId,
          amount,
          fee,
          uniqueDigit,
          totalAmount,
          qrisString,
          qrisImageBase64,
          expiresAt,
        },
      });
      return { transaction, created: true };
    } catch (e) {
      // P2002 pada unique index totalAmount = race; retry dengan digit lain.
      if (
        e?.code === PRISMA_UNIQUE_VIOLATION &&
        e?.meta?.target?.includes("totalAmount")
      ) {
        lastErr = e;
        continue;
      }
      // P2002 pada merchantId_referenceId = idempotency race; treat as existing.
      if (
        e?.code === PRISMA_UNIQUE_VIOLATION &&
        e?.meta?.target?.includes("referenceId")
      ) {
        const existing = await prisma.transaction.findUnique({
          where: {
            merchantId_referenceId: { merchantId: merchant.id, referenceId },
          },
        });
        if (existing && existing.status === "PENDING") {
          return { transaction: existing, created: false };
        }
        throw conflict(
          `Transaction with referenceId '${referenceId}' already ${existing?.status ?? "exists"}`
        );
      }
      throw e;
    }
  }

  // Semua retry habis — kemungkinan kasus ekstrem (banyak transaksi PENDING sekaligus).
  throw conflict(
    "Gagal membuat transaksi: kapasitas unique digit penuh untuk nominal ini. Coba lagi sebentar."
  );
}

/**
 * Get transaction status for a merchant by referenceId OR transactionId.
 */
export async function getTransactionStatus(merchant, query) {
  const { referenceId, transactionId } = query || {};
  if (!referenceId && !transactionId) {
    throw badRequest("Provide referenceId or transactionId");
  }

  let tx = null;
  if (transactionId) {
    tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
  } else if (referenceId) {
    tx = await prisma.transaction.findUnique({
      where: {
        merchantId_referenceId: { merchantId: merchant.id, referenceId },
      },
    });
  }

  if (!tx || tx.merchantId !== merchant.id) {
    throw notFound("Transaction not found");
  }
  return tx;
}

/**
 * Mark a transaction PENDING -> EXPIRED (manual cancel) or no-op if not pending.
 */
export async function cancelTransaction(merchant, referenceId) {
  const tx = await prisma.transaction.findUnique({
    where: {
      merchantId_referenceId: { merchantId: merchant.id, referenceId },
    },
  });
  if (!tx) throw notFound("Transaction not found");
  if (tx.status !== "PENDING") {
    throw unprocessable(`Transaction already ${tx.status}`);
  }

  return prisma.transaction.update({
    where: { id: tx.id },
    data: { status: "EXPIRED" },
  });
}

/**
 * Hard-delete a transaction by referenceId (scoped to merchant).
 * Useful for cleaning up test transactions from the frontend.
 */
export async function deleteTransaction(merchant, referenceId) {
  const tx = await prisma.transaction.findUnique({
    where: {
      merchantId_referenceId: { merchantId: merchant.id, referenceId },
    },
  });
  if (!tx) throw notFound("Transaction not found");

  await prisma.transaction.delete({ where: { id: tx.id } });
  return { referenceId, status: "DELETED" };
}

/**
 * Sweep all PENDING transactions whose expiresAt has passed -> mark EXPIRED.
 * Called periodically by a cron job (Phase 2+).
 *
 * @returns {Promise<number>} count of expired transactions
 */
export async function expireStaleTransactions() {
  const result = await prisma.transaction.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

/**
 * Serialize a transaction row into the public merchant-facing shape.
 */
export function serializeTransaction(t) {
  return {
    transactionId: t.id,
    referenceId: t.referenceId,
    status: t.status,
    amount: t.amount,
    fee: t.fee,
    uniqueDigit: t.uniqueDigit,
    totalAmount: t.totalAmount,
    ...(t.status !== "EXPIRED" && t.status !== "PAID" && {
      qrisString: t.qrisString,
      qrisImageBase64: t.qrisImageBase64,
    }),
    expiresAt: t.expiresAt,
    paidAt: t.paidAt,
    paidAmount: t.paidAmount,
    createdAt: t.createdAt,
  };
}
