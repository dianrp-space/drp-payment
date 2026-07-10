-- ⚠️ DIGANTI oleh migration 20260710000001_add_unique_totalamount_pending_per_merchant.
-- Index ini di-drop dan diganti dengan (merchantId, totalAmount) per merchant.
--
-- Partial unique index: totalAmount harus unik di antara transaksi PENDING.
-- Mencegah race condition di pickUniqueDigit() yang bisa menyebabkan dua PENDING
-- dengan totalAmount identik (notifikasi pembayaran bisa match ke transaksi salah merchant).
--
-- Catatan: PAID/EXPIRED/FAILED boleh punya totalAmount duplikat (tidak di-enforce),
-- karena hanya PENDING yang dipakai untuk matching notifikasi Macrodroid.
-- Prisma @@unique tidak support partial index (WHERE clause), jadi dibuat manual.

CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_totalAmount_pending_unique"
  ON "Transaction"("totalAmount")
  WHERE "status" = 'PENDING';
