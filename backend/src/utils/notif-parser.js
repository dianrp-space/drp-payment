// Parser untuk notifikasi pembayaran dari berbagai e-wallet / m-banking Indonesia.
//
// Strategi:
//   1. Gabungkan title + text + summary + bigText jadi satu corpus.
//   2. Temukan semua pola nominal (Rp/IDR/dua angka ribuan) dalam corpus.
//   3. Parse masing-masing ke integer rupiah.
//   4. Kembalikan daftar kandidat; caller (detection) yang pilih
//      yang cocok dengan totalAmount PENDING.

const THOUSAND_SEP = /[.\s]/g; // pemisah ribuan: titik / spasi
const DECIMAL_PART = /,\d{1,2}$/; // desimal ,00 / ,50

/**
 * Normalize satu match nominal menjadi integer rupiah.
 * Contoh input: "Rp10.000", "Rp 10.000", "10.000", "IDR 10.000,00", "10000"
 */
function normalizeAmount(raw) {
  if (!raw) return null;
  let s = String(raw).trim();

  // Buang label mata uang
  s = s.replace(/^(rp|idr|rupiah)\s*/i, "");

  // Pisahkan bagian desimal (di belakang koma) lalu hapus
  let decimal = 0;
  const decMatch = s.match(/,(\d{1,2})$/);
  if (decMatch) {
    decimal = parseInt(decMatch[1], 10);
    s = s.replace(/,\d{1,2}$/, "");
  }

  // Hapus pemisah ribuan (titik / spasi)
  s = s.replace(THOUSAND_SEP, "");

  // Hapus karakter non-digit tersisa
  s = s.replace(/[^\d]/g, "");

  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return null;

  // Desimal dibulatkan ke atas kalau ada sisa (jangan hilang)
  return decimal > 0 ? n + 1 : n;
}

/**
 * Extract semua kandidat nominal dari corpus notifikasi.
 * Mengembalikan array integer unik (descending urutan keyakinan).
 *
 * @param {string} corpus - Gabungan title/text/summary notifikasi
 * @returns {number[]}
 */
export function extractAmounts(corpus) {
  if (!corpus || typeof corpus !== "string") return [];
  const text = corpus;

  // Pola diurutkan dari paling spesifik (keyakinan tinggi) ke umum
  const patterns = [
    // "Rp 10.000" / "Rp10.000" / "RP 10.000,00" / "Rp. 10000"
    /(?:rp\.?\s*)(\d{1,3}(?:[.\s]\d{3}){1,3}(?:,\d{1,2})?)/gi,
    // "IDR 10.000"
    /(?:idr\.?\s*)(\d{1,3}(?:[.\s]\d{3}){1,3}(?:,\d{1,2})?)/gi,
    // "10.000,00" / "10.000" (panjang min 5 char dgn separator ribuan)
    /\b(\d{1,3}(?:\.\d{3}){1,3}(?:,\d{1,2})?)\b/g,
    // "10000" raw (5-9 digit)
    /\b(\d{5,9})\b/g,
  ];

  const candidates = [];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const v = normalizeAmount(m[1]);
      if (v && v > 0) candidates.push(v);
    }
  }

  // Dedupe preserving order
  return [...new Set(candidates)];
}

/**
 * Cari nominal dalam corpus yang sama persis dengan salah satu target.
 *
 * @param {string} corpus
 * @param {number[]} targets - daftar totalAmount PENDING (misalnya)
 * @returns {number|null} target yang cocok, atau null
 */
export function findMatchingAmount(corpus, targets) {
  if (!targets.length) return null;
  const targetSet = new Set(targets);
  for (const c of extractAmounts(corpus)) {
    if (targetSet.has(c)) return c;
  }
  return null;
}

/**
 * Identifikasi kemungkinan source app dari notifikasi.
 * Berguna untuk logging / debug matching.
 */
export function guessSource(app, title, text) {
  const corpus = `${app || ""} ${title || ""} ${text || ""}`.toLowerCase();
  const map = [
    ["gopay", "gopay"],
    ["dana", "dana"],
    ["ovo", "ovo"],
    ["shopeepay", "shopeepay"],
    ["spay", "shopeepay"],
    ["linkaja", "linkaja"],
    ["jenius", "jenius"],
    ["seabank", "seabank"],
    ["bca", "bca"],
    ["bca mobile", "bca"],
    ["livin'", "bca"],
    ["bni mobile", "bni"],
    ["bni", "bni"],
    ["bri mobile", "bri"],
    ["brib", "bri"],
    ["brimo", "bri"],
    ["mandiri online", "mandiri"],
    ["mandiri", "mandiri"],
    ["sakuku", "sakuku"],
    ["flip", "flip"],
    ["blu by bca", "blu"],
  ];
  for (const [needle, name] of map) {
    if (corpus.includes(needle)) return name;
  }
  return app || "unknown";
}

/**
 * Identifikasi provider QRIS dari notifikasi Macrodroid.
 *
 * Provider di sini = lembaga yang menerbitkan QRIS personal merchant
 * (bukan e-wallet pembayar, melainkan akun penerima). Contoh:
 *   - notif "Livin Merchant"  → QRIS dari Bank Mandiri → "bankmandiri"
 *   - notif "GoPay Merchant"  → QRIS dari Go-Jek        → "gopay"
 *   - notif "DANA Merchant"   → QRIS dari DANA          → "dana"
 *
 * Provider ini lalu dicocokkan dengan provider yang di-parse dari
 * string QRIS merchant (tag 26 sub-tag 00) supaya notif GoPay tidak
 * keliru match transaksi merchant Mandiri, dst.
 *
 * @param {string} app  - notif_app / package name
 * @param {string} title - notif_title
 * @param {string} text  - notif_text
 * @returns {string|null} provider key (mis. "bankmandiri") atau null jika tak terdeteksi
 */
export function guessProvider(app, title, text) {
  const corpus = `${app || ""} ${title || ""} ${text || ""}`.toLowerCase();
  const map = [
    // app name → provider key (harus match key di getQrisProvider)
    ["livin", "bankmandiri"],     // "Livin Merchant" / "Livin' Merchant"
    ["mandiri", "bankmandiri"],
    ["gopay", "gopay"],           // "GoPay Merchant"
    ["go-jek", "gopay"],
    ["gojek", "gopay"],
    ["dana", "dana"],
    ["shopeepay", "shopeepay"],
    ["spay", "shopeepay"],
    ["ovo", "ovo"],
    ["seabank", "seabank"],
    ["linkaja", "linkaja"],
    ["bca", "bca"],
    ["bni", "bni"],
    ["bri", "bri"],
    ["sakuku", "sakuku"],
    ["jenius", "jenius"],
    ["blu", "bca"],
    ["flip", "flip"],
  ];
  for (const [needle, key] of map) {
    if (corpus.includes(needle)) return key;
  }
  return null;
}
