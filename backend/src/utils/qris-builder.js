import QRCode from "qrcode";
import { parseTLV, buildTLV, findTagIndex } from "./qris-tlv.js";
import { calculateCRC } from "./qris-crc.js";

/**
 * Inject nominal (dan opsional fee) ke dalam QRIS statis,
 * menghasilkan QRIS dinamis yang valid dengan CRC baru.
 *
 * Strategi (mengikuti standar QRIS MPM):
 *   1. Set tag 01 = "12" (dynamic)
 *   2. Hapus tag 54 (amount) lama bila ada
 *   3. Sisipkan tag 54 berisi totalAmount setelah tag 53 (currency)
 *   4. Hapus tag 62 sub-tag 05-09 (merchant dynamic fees) jika mengganggu
 *      — tidak dilakukan di sini, biar tetap kompatibel.
 *   5. Recompute CRC tag 63.
 *
 * @param {string} staticQris - String QRIS statis (boleh dengan/tanpa CRC lama).
 * @param {number} totalAmount - Total nominal yang harus dibayar (incl fee & unique digit).
 * @returns {string} String QRIS dinamis lengkap dengan CRC.
 */
export function generateDynamicQRIS(staticQris, totalAmount) {
  if (!staticQris || typeof staticQris !== "string") {
    throw new Error("staticQris harus string QRIS yang valid");
  }
  const amount = Math.trunc(Number(totalAmount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("totalAmount harus angka positif");
  }

  let qris = staticQris.trim();

  // 1. Force tag 01 (point of sale method) jadi 12 = dynamic
  if (qris.startsWith("000201")) {
    qris = qris.slice(0, 6) + "010212" + qris.slice(12);
  } else {
    qris = qris.replace(/010211/, "010212");
  }

  // 2. Strip CRC lama (tag 63 + 4 hex) dari akhir
  qris = qris.replace(/6304[0-9A-Fa-f]{4}$/, "");

  // 3. Parse TLV
  const tags = parseTLV(qris);

  // 4. Hapus tag 54 lama jika ada (cleansing)
  const cleanTags = tags.filter((t) => t.tag !== "54");

  // 5. Bangun tag 54 baru
  const amountStr = String(amount);
  const amountTag = { tag: "54", value: amountStr };

  // 6. Sisipkan setelah tag 53 (currency), fallback setelah 52, fallback akhir
  const result = [...cleanTags];
  let insertAt = findTagIndex(result, "53");
  if (insertAt === -1) insertAt = findTagIndex(result, "52");
  if (insertAt === -1) {
    result.push(amountTag);
  } else {
    result.splice(insertAt + 1, 0, amountTag);
  }

  // 7. Gabungkan + tambahkan tag 63 (CRC placeholder)
  const withCrcMarker = buildTLV(result) + "6304";
  const crc = calculateCRC(withCrcMarker);

  return withCrcMarker + crc;
}

/**
 * Verifikasi apakah sebuah string QRIS memiliki CRC yang valid.
 * Berguna untuk memvalidasi QRIS statis merchant saat onboarding.
 */
export function isValidQris(qris) {
  if (!qris || typeof qris !== "string") return false;
  const match = qris.match(/6304([0-9A-Fa-f]{4})$/);
  if (!match) return false;
  const expected = match[1].toUpperCase();
  const withoutCrc = qris.slice(0, qris.length - 4);
  const computed = calculateCRC(withoutCrc);
  return expected === computed;
}

/**
 * Render QRIS string menjadi data URL PNG (base64).
 */
export async function renderQrisImage(qrisString, format = "png") {
  return QRCode.toDataURL(qrisString, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 480,
    type: "image/png",
  });
}
