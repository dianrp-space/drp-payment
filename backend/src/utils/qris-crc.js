// QRIS CRC-16/CCITT-FALSE implementation (standar QRIS)

/**
 * Hitung CRC16/CCITT-FALSE dari string QRIS.
 * Input harus sudah sampai tag 63 (6304) tapi TANPA 4 char CRC itu sendiri.
 *
 * @param {string} qris - String QRIS termasuk "6304" di akhir (tanpa CRC value).
 * @returns {string} 4-hex CRC uppercase.
 */
export function calculateCRC(qris) {
  // Pastikan kita mulai dari awal absolut, bukan dari "6304" pertama yang mungkin
  // ada di body (tag 63 lain). Pendekatan: cari "6304" dari belakang.
  const lastIdx = qris.lastIndexOf("6304");
  const data = lastIdx !== -1 ? qris.slice(0, lastIdx + 4) : qris;

  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
