// TLV parser & builder untuk QRIS (MPM style)

/**
 * Parse string QRIS menjadi array of { tag, value }.
 * Format TLV: [2 tag][2 length][value].
 */
export function parseTLV(str) {
  const tags = [];
  let i = 0;
  while (i + 4 <= str.length) {
    const tag = str.substr(i, 2);
    const len = parseInt(str.substr(i + 2, 2), 10);
    if (Number.isNaN(len)) break;
    const start = i + 4;
    const end = start + len;
    if (end > str.length) break;
    tags.push({ tag, value: str.substr(start, len) });
    i = end;
  }
  return tags;
}

/** Build array of { tag, value } kembali menjadi string TLV (tanpa length padding custom). */
export function buildTLV(tags) {
  return tags
    .map((t) => t.tag + String(t.value.length).padStart(2, "0") + t.value)
    .join("");
}

/** Cari index tag pertama pada array hasil parseTLV. */
export function findTagIndex(tags, tag) {
  return tags.findIndex((t) => t.tag === tag);
}

/** Cari value tag pertama pada array hasil parseTLV. */
export function getTagValue(tags, tag) {
  const found = tags.find((t) => t.tag === tag);
  return found ? found.value : null;
}

/**
 * Ekstrak provider QRIS dari string QRIS dengan parse tag 26 sub-tag 00
 * (Global Unique Identification, mis. "ID.CO.BANKMANDIRI.WWW").
 *
 * Mengembalikan provider key kanonik yang bisa dicocokkan dengan
 * `guessProvider()` dari notifikasi Macrodroid:
 *   - "ID.CO.BANKMANDIRI.WWW" → "bankmandiri"
 *   - "ID.CO.GO-JEK.WWW"      → "gopay"
 *   - "ID.CO.DANA.WWW"        → "dana"
 *   - "ID.CO.QRIS.WWW"        → null (switch nasional, tak bisa ditentukan)
 *
 * @param {string} staticQris
 * @returns {string|null} provider key atau null
 */
export function getQrisProvider(staticQris) {
  if (!staticQris || typeof staticQris !== "string") return null;
  const tags = parseTLV(staticQris);
  const tag26 = getTagValue(tags, "26");
  if (!tag26) return null;

  const subtags = parseTLV(tag26);
  const gui = getTagValue(subtags, "00");
  if (!gui) return null;

  const lower = gui.toLowerCase();
  const map = [
    ["bankmandiri", "bankmandiri"],
    ["mandiri", "bankmandiri"],
    ["go-jek", "gopay"],
    ["gojek", "gopay"],
    ["gopay", "gopay"],
    ["dana", "dana"],
    ["shopeepay", "shopeepay"],
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
    if (lower.includes(needle)) return key;
  }
  return null;
}
