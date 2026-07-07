// End-to-end test for Phase 2+3: detection + webhook delivery
//
// Flow:
//   1. Spawn a mock webhook receiver on a random port (acts as merchant server)
//   2. Create merchant pointing webhookUrl -> mock receiver
//   3. Create a PENDING transaction (gets unique digit X)
//   4. Send /v2/callback simulating Macrodroid with matching amount
//   5. Verify: trx status PAID, mock received webhook, signature valid
//
// Run with: node scripts/e2e-detection-test.mjs
import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import { buildTLV } from "../src/utils/qris-tlv.js";
import { calculateCRC } from "../src/utils/qris-crc.js";
import { isValidQris } from "../src/utils/qris-builder.js";
import { signWebhook } from "../src/utils/crypto.js";
import { prisma } from "../src/config/db.js";

const BASE = "http://127.0.0.1:8080";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;

// ----- Mock webhook receiver -----
let receivedWebhooks = [];

function startMockReceiver() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        receivedWebhooks.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          rawBody: raw,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

function makeTestStaticQris() {
  const tags = [
    { tag: "00", value: "01" },
    { tag: "01", value: "11" },
    {
      tag: "26",
      value: buildTLV([
        { tag: "00", value: "ID.CO.QRIS.WWW" },
        { tag: "01", value: "ID2012230932789375" },
        { tag: "02", value: "ID1022230932789375" },
      ]),
    },
    {
      tag: "51",
      value: buildTLV([
        { tag: "00", value: "ID.CO.QRIS.WWW" },
        { tag: "01", value: "ID2012230932789375" },
        { tag: "02", value: "ID1022230932789375" },
      ]),
    },
    { tag: "52", value: "5999" },
    { tag: "53", value: "360" },
    { tag: "58", value: "ID" },
    { tag: "59", value: "Toko Test" },
    { tag: "60", value: "Jakarta" },
    { tag: "61", value: "12340" },
    { tag: "62", value: buildTLV([{ tag: "05", value: "IXQ7HRH6FXJF66" }]) },
  ];
  const body = buildTLV(tags) + "6304";
  return body + calculateCRC(body);
}

async function main() {
  console.log("=== Phase 2+3 E2E: Detection + Webhook ===\n");

  const { server: mockServer, port: mockPort } = await startMockReceiver();
  console.log(`Mock webhook receiver on 127.0.0.1:${mockPort}`);

  const staticQris = makeTestStaticQris();
  console.log("Static QRIS valid:", isValidQris(staticQris));

  // 1. Create merchant
  let r = await fetch(`${BASE}/admin/merchants`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({
      name: "Detection Test Merchant",
      email: `det-${Date.now()}@example.com`,
      staticQris,
      webhookUrl: `http://127.0.0.1:${mockPort}/qris-callback`,
    }),
  });
  const merchant = await r.json();
  console.log("\n[1] Merchant created:", merchant.merchant.id);
  const apiKey = merchant.apiKey;
  const webhookSecret = merchant.webhookSecret;

  // 2. Create transaction
  r = await fetch(`${BASE}/v2/qris`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ referenceId: `DET-${Date.now()}`, amount: 25000 }),
  });
  const trx = await r.json();
  console.log(
    "[2] Transaction created: total",
    trx.totalAmount,
    "(amount",
    trx.amount,
    "+ unique",
    trx.uniqueDigit + ")"
  );

  // 3. Simulate Macrodroid callback (GoPay style notification)
  const notificationText = `Anda menerima Rp${formatRupiah(
    trx.totalAmount
  )} dari Budi Setiawan via QRIS`;
  r = await fetch(`${BASE}/v2/callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": INTERNAL_TOKEN,
    },
    body: JSON.stringify({
      app: "com.gojek.gopay",
      title: "GoPay",
      text: notificationText,
      timestamp: new Date().toISOString(),
    }),
  });
  const cbResult = await r.json();
  console.log("[3] Callback response:", JSON.stringify(cbResult));

  // Verify match
  if (cbResult.matched !== true) {
    throw new Error(`Expected matched=true, got ${cbResult.matched}`);
  }
  if (cbResult.transactionId !== trx.transactionId) {
    throw new Error(
      `Expected transactionId ${trx.transactionId}, got ${cbResult.transactionId}`
    );
  }
  console.log("    ✅ Detection matched correctly");

  // 4. Wait for webhook delivery (async fire-and-forget)
  console.log("\n[4] Waiting 1.5s for webhook delivery...");
  await sleep(1500);

  if (receivedWebhooks.length === 0) {
    throw new Error("No webhook received at mock server");
  }
  const wh = receivedWebhooks[0];
  console.log("    Webhook received:", wh.method, wh.url);

  // Verify signature
  const expectedSig = signWebhook(webhookSecret, wh.rawBody);
  const gotSig = wh.headers["x-signature"];
  if (expectedSig !== gotSig) {
    throw new Error(
      `Signature mismatch.\n  expected: ${expectedSig}\n  got:      ${gotSig}`
    );
  }
  console.log("    ✅ Signature valid");

  // Verify payload
  const payload = JSON.parse(wh.rawBody);
  if (payload.event !== "payment.success") throw new Error("Wrong event type");
  if (payload.transactionId !== trx.transactionId) throw new Error("Wrong transactionId");
  if (payload.totalAmount !== trx.totalAmount) throw new Error("Wrong totalAmount");
  if (payload.status !== "PAID") throw new Error("Wrong status in payload");
  console.log("    ✅ Payload correct:", {
    event: payload.event,
    referenceId: payload.referenceId,
    totalAmount: payload.totalAmount,
    paidAt: payload.paidAt,
  });

  // 5. Verify status via API
  r = await fetch(
    `${BASE}/v2/payment-status?referenceId=${trx.referenceId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  const status = await r.json();
  if (status.status !== "PAID") throw new Error(`Expected PAID, got ${status.status}`);
  console.log("\n[5] Final status:", status.status, "— paidAmount:", status.paidAmount);
  console.log("    Webhook status:", status.webhookStatus || "(via DB)");

  // 6. Test wrong amount (should NOT match anything)
  r = await fetch(`${BASE}/v2/callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": INTERNAL_TOKEN,
    },
    body: JSON.stringify({
      app: "com.gojek.gopay",
      text: "Anda menerima Rp999.999 dari X",
    }),
  });
  const notMatched = await r.json();
  if (notMatched.matched !== false) {
    throw new Error("Wrong amount should NOT match");
  }
  console.log("\n[6] Unmatched amount correctly:", notMatched.matched, "(source:", notMatched.source + ")");

  console.log("\n=== ALL PHASE 2+3 TESTS PASSED ===");
  console.log("\n--- Webhook payload samples from each test notification ---");
  console.log("First (matched):", receivedWebhooks.length, "webhook(s) delivered total");

  mockServer.close();
  await prisma.$disconnect();
  process.exit(0);
}

function formatRupiah(n) {
  return n.toLocaleString("id-ID");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch(async (e) => {
  console.error("\n❌ TEST FAILED:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
