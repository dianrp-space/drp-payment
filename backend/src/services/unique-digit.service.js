import { prisma } from "../config/db.js";
import { env } from "../config/env.js";

// Range unique digit yang ditambahkan ke nominal agar tiap transaksi PENDING
// punya totalAmount yang unik secara global (di-deteksi via macrodroid).
export const UNIQUE_DIGIT_MIN = 1;
export const UNIQUE_DIGIT_MAX = 300;

/**
 * Cari unique digit (1..300) yang belum dipakai oleh transaksi PENDING manapun
 * untuk base nominal yang sama. Ini menjamin totalAmount unik global, sehingga
 * matcher bisa mencocokkan notifikasi masuk ke tepat satu transaksi.
 *
 * @param {number} baseAmount - amount + fee (tanpa unique digit)
 * @returns {Promise<number>} unique digit tersedia berikutnya
 */
export async function pickUniqueDigit(baseAmount) {
  const candidates = await prisma.transaction.findMany({
    where: {
      status: "PENDING",
      amount: { gt: 0 },
    },
    select: { totalAmount: true },
  });

  const usedTotals = new Set(candidates.map((t) => t.totalAmount));

  // Strategi: mulai dari random agar distribusi merata, scan sampai ketemu yg bebas.
  const start = Math.floor(Math.random() * UNIQUE_DIGIT_MAX) + 1;
  for (let offset = 0; offset < UNIQUE_DIGIT_MAX; offset++) {
    const d = ((start - UNIQUE_DIGIT_MIN + offset) % UNIQUE_DIGIT_MAX) + UNIQUE_DIGIT_MIN;
    if (!usedTotals.has(baseAmount + d)) return d;
  }
  throw new Error("UNIQUE_DIGIT_EXHAUSTED");
}
