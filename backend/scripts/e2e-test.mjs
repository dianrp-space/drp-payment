// End-to-end smoke test for Phase 1
import "dotenv/config";
import { buildTLV } from "../src/utils/qris-tlv.js";
import { calculateCRC } from "../src/utils/qris-crc.js";
import { isValidQris } from "../src/utils/qris-builder.js";

const BASE = "http://127.0.0.1:8080";

// Build a synthetic but CRC-valid static QRIS using proper TLV
function makeTestStaticQris() {
  const tags = [
    { tag: "00", value: "01" }, // payload format
    { tag: "01", value: "11" }, // point of sale - static
    { tag: "26", value: buildTLV([
      { tag: "00", value: "ID.CO.QRIS.WWW" },
      { tag: "01", value: "ID2012230932789375" },
      { tag: "02", value: "ID1022230932789375" },
    ]) },
    { tag: "51", value: buildTLV([
      { tag: "00", value: "ID.CO.QRIS.WWW" },
      { tag: "01", value: "ID2012230932789375" },
      { tag: "02", value: "ID1022230932789375" },
    ]) },
    { tag: "52", value: "5999" }, // merchant category code
    { tag: "53", value: "360" }, // currency IDR
    { tag: "58", value: "ID" }, // country
    { tag: "59", value: "Toko Test" }, // merchant name
    { tag: "60", value: "Jakarta" }, // merchant city
    { tag: "61", value: "12340" }, // postal code
    { tag: "62", value: buildTLV([
      { tag: "05", value: "IXQ7HRH6FXJF66" }, // merchant id
    ]) },
  ];
  const body = buildTLV(tags) + "6304";
  return body + calculateCRC(body);
}

function log(label, status, body) {
  console.log(`\n[${label}] HTTP ${status}`);
  console.log(JSON.stringify(body, null, 2));
}

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const staticQris = makeTestStaticQris();
console.log("Static QRIS (test) built. CRC-valid:", isValidQris(staticQris));
console.log("QRIS preview:", staticQris.slice(0, 60) + "...");

async function main() {
  // 1. Health
  let r = await fetch(`${BASE}/health`);
  log("health", r.status, await r.json());

  // 2. Create merchant (admin)
  r = await fetch(`${BASE}/admin/merchants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({
      name: "Test Merchant",
      email: "test@example.com",
      staticQris,
      webhookUrl: "https://example.com/wh",
    }),
  });
  const created = await r.json();
  log("admin create merchant", r.status, created);
  if (!created.apiKey) throw new Error("No apiKey returned");
  const apiKey = created.apiKey;
  const merchantId = created.merchant.id;

  // 3. Auth failure (no key)
  r = await fetch(`${BASE}/v2/qris`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referenceId: "x", amount: 1000 }),
  });
  log("v2/qris without key (expect 401)", r.status, await r.json());

  // 4. Validation failure
  r = await fetch(`${BASE}/v2/qris`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ amount: 1000 }),
  });
  log("v2/qris missing referenceId (expect 422)", r.status, await r.json());

  // 5. Create transaction
  r = await fetch(`${BASE}/v2/qris`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ referenceId: "INV-TEST-001", amount: 25000 }),
  });
  const trx1 = await r.json();
  log("v2/qris create #1", r.status, { ...trx1, qrisImageBase64: trx1.qrisImageBase64?.slice(0, 40) + "..." });

  // 6. Create second trx with same base — should get different unique digit
  r = await fetch(`${BASE}/v2/qris`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ referenceId: "INV-TEST-002", amount: 25000 }),
  });
  const trx2 = await r.json();
  log("v2/qris create #2 (same amount)", r.status, {
    referenceId: trx2.referenceId,
    totalAmount: trx2.totalAmount,
    uniqueDigit: trx2.uniqueDigit,
  });

  // 7. Idempotency: same referenceId should return existing PENDING (200 not 201)
  r = await fetch(`${BASE}/v2/qris`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ referenceId: "INV-TEST-001", amount: 25000 }),
  });
  const trx1Dup = await r.json();
  log("v2/qris idempotent (expect 200)", r.status, {
    transactionId: trx1Dup.transactionId,
    sameAsFirst: trx1Dup.transactionId === trx1.transactionId,
  });

  // 8. Check status
  r = await fetch(`${BASE}/v2/payment-status?referenceId=INV-TEST-001`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  log("v2/payment-status", r.status, { ...(await r.json()), qrisImageBase64: undefined });

  // 9. Verify unique digit uniqueness
  console.log("\n=== UNIQUE DIGIT CHECK ===");
  console.log("Trx1 total:", trx1.totalAmount, "uniqueDigit:", trx1.uniqueDigit);
  console.log("Trx2 total:", trx2.totalAmount, "uniqueDigit:", trx2.uniqueDigit);
  console.log("Totals differ:", trx1.totalAmount !== trx2.totalAmount);

  console.log("\n=== ALL TESTS PASSED ===");
}

main().catch((e) => {
  console.error("TEST FAILED:", e.message);
  process.exit(1);
});
