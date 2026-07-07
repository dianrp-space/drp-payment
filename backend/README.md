# DRP Payment Gateway — Backend

QRIS-only payment gateway. Multi-merchant, API-driven, dengan auto-detection
pembayaran via notification listener (Macrodroid) dan webhook notifikasi.

## Stack

- Node.js + Express (ESM)
- PostgreSQL + Prisma ORM
- Zod validation, pino logger
- Swagger UI (OpenAPI 3) di `/api-docs`

## Setup

```bash
cd backend
npm install                 # install deps
cp .env.example .env        # lalu edit .env (set DATABASE_URL, INTERNAL_TOKEN, ADMIN_TOKEN)
npm run db:ensure           # buat database drp_payment kalau belum ada (sesuai DATABASE_URL)
npm run prisma:migrate      # apply schema
npm run seed                # (opsional) buat first merchant via SEED_STATIC_QRIS
npm start                   # start server di PORT (default 8080)
```

Server jalan di `http://0.0.0.0:8080`. Swagger UI di `/api-docs`.

## Scripts

| Perintah              | Fungsi                                         |
|-----------------------|------------------------------------------------|
| `npm start`           | Start production server                        |
| `npm run dev`         | Nodemon hot-reload                             |
| `npm run db:ensure`   | Buat database Postgres jika belum ada          |
| `npm run prisma:migrate` | Buat/apply migration                       |
| `npm run prisma:generate` | Regenerate Prisma client                    |
| `npm run prisma:studio` | Buka Prisma Studio GUI                       |
| `npm run seed`        | Seed merchant pertama (perlu SEED_STATIC_QRIS) |

## Struktur Folder

```
backend/
├── prisma/
│   ├── schema.prisma          # 4 model: Merchant, Transaction, WebhookLog, ApiLog
│   ├── migrations/
│   └── seed.js
├── scripts/                   # one-off scripts (ensure-db, e2e tests)
├── src/
│   ├── config/                # env, db client, logger
│   ├── routes/
│   │   ├── v2/qris.routes.js       # POST /v2/qris, GET /v2/payment-status, POST /v2/qris-cancel
│   │   ├── internal/callback.routes.js # POST /v2/callback (Macrodroid)
│   │   └── admin/admin.routes.js   # CRUD merchant + rotate keys
│   ├── controllers/
│   ├── services/
│   │   ├── transaction.service.js  # create/status/cancel/expire
│   │   ├── detection.service.js    # match notif -> PAID
│   │   ├── webhook.service.js      # HMAC signed dispatch + retry
│   │   ├── merchant.service.js
│   │   └── unique-digit.service.js # 3-digit unique suffix
│   ├── middlewares/           # auth (bearer, admin, internal), error handler
│   ├── utils/                 # qris-builder, qris-crc, qris-tlv, notif-parser, crypto
│   ├── jobs/                  # cron (expiry, webhook retry)
│   ├── app.js
│   └── server.js
└── docs/
    └── MACRODROID.md          # setup guide untuk payment detector di Android
```

## API Reference

### Public Merchant API — `Authorization: Bearer <API_KEY>`

| Method | Path                  | Fungsi                                              |
|--------|-----------------------|----------------------------------------------------|
| POST   | `/v2/qris`            | Buat transaksi QRIS (returns `qrisString` + base64 image) |
| GET    | `/v2/payment-status`  | Cek status by `referenceId` / `transactionId`      |
| POST   | `/v2/qris-cancel`     | Cancel manual (PENDING -> EXPIRED)                 |

### Internal Callback — `X-Internal-Token: <INTERNAL_TOKEN>`

| Method | Path            | Fungsi                                  |
|--------|-----------------|-----------------------------------------|
| POST   | `/v2/callback`  | Notifikasi dari Macrodroid (lihat `docs/MACRODROID.md`) |

### Admin — `X-Admin-Token: <ADMIN_TOKEN>`

| Method | Path                                      | Fungsi                          |
|--------|-------------------------------------------|--------------------------------|
| POST   | `/admin/merchants`                        | Register merchant (returns apiKey 1x) |
| GET    | `/admin/merchants`                        | List merchant                  |
| GET    | `/admin/merchants/:id`                    | Detail merchant                |
| PATCH  | `/admin/merchants/:id/webhook`            | Update webhookUrl              |
| POST   | `/admin/merchants/:id/rotate-api-key`     | Rotate API key                 |
| POST   | `/admin/merchants/:id/rotate-webhook-secret` | Rotate webhook secret       |
| PATCH  | `/admin/merchants/:id/status`             | ACTIVE / SUSPENDED             |

### Legacy (stateless, kept for backward compat)

| Method | Path                  | Fungsi                          |
|--------|-----------------------|--------------------------------|
| POST   | `/api/generate`       | Generate dynamic QRIS one-off  |
| POST   | `/api/parse-image`    | Decode QRIS dari upload gambar |
| POST   | `/api/parse-image-url`| Decode QRIS dari URL gambar    |

## Verifikasi Webhook (untuk Merchant)

Setiap payment.success webhook punya signature:

```
X-Signature: <HMAC-SHA256(webhookSecret, rawBody)>
X-DRP-Token: <JWT HS256(payload, webhookSecret)>   # alternatif JWT
X-Event-Type: payment.success
X-Event-Id: <uuid>           # idempotency key
```

**Cara 1 — HMAC-SHA256** (Node.js):

```js
import crypto from "node:crypto";

function verify(rawBody, signature, webhookSecret) {
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex")
  );
}
```

> Wajib baca **raw body** (sebelum JSON.parse) supaya signature cocok.

**Cara 2 — JWT HS256** (n8n / no-code):

Header `X-DRP-Token` berisi JWT signed HS256 dengan `webhookSecret`.

Di n8n: **JWT node** → Verify → algorithm `HS256` → secret `webhookSecret`.

Atau pakai Code node:

```js
const jwt = require("jsonwebtoken");
const payload = jwt.verify(
  $input.headers["x-drp-token"],
  process.env.DRP_WEBHOOK_SECRET,
  { algorithms: ["HS256"] }
);
```

Retry schedule bila merchant return non-2xx: `30s → 2m → 10m → 30m → 2h` (6 attempts max).

## Konsep Penting: Unique Digit

Karena QRIS personal tidak mengirim reference ID bawaan dari bank, gateway
menyuntik **3-digit unique suffix** ke nominal:

```
totalAmount = amount + fee + uniqueDigit  (1..999)
```

`uniqueDigit` dijamin unik di antara semua PENDING transaction global, sehingga
notifikasi nominal bisa dicocokkan ke tepat satu transaksi (FIFO bila collision).
Setelah dibayar atau expired, digit bebas dipakai lagi.

## Pengujian

```bash
# Test phase 1 (auth + create transaction + status)
node scripts/e2e-test.mjs

# Test phase 2+3 (detection + webhook delivery, with mock receiver)
node scripts/e2e-detection-test.mjs
```

Server harus sudah running di port 8080 sebelum jalan test.
