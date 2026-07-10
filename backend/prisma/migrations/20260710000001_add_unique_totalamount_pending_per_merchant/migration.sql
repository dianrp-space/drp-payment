-- Ubah partial unique index dari global (totalAmount) ke per-merchant (merchantId, totalAmount).
-- Setiap merchant punya pool unique digit sendiri (1..300), jadi kapasitas total = N × 300.
-- Dua merchant boleh punya totalAmount sama selama status PENDING.

DROP INDEX IF EXISTS "Transaction_totalAmount_pending_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_merchantId_totalAmount_pending_unique"
  ON "Transaction"("merchantId", "totalAmount")
  WHERE "status" = 'PENDING';
