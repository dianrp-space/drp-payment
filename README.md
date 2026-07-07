# DRP Payment Gateway

<p align="center">
  <img src="web/public/drp-payment.webp" alt="DRP Payment Gateway" width="200" />
</p>

QRIS-only payment gateway pribadi ala Xendit/Duitku. API-driven, multi-merchant,
dengan auto-detection pembayaran via notification listener (Macrodroid) dan
signed webhook notification ke merchant.

![License](https://img.shields.io/badge/status-active-2ecc71)
![Stack](https://img.shields.io/badge/stack-Node%20%7C%20Express%20%7C%20PostgreSQL%20%7C%20Prisma-6cf)

## Apa ini?

Repo ini mengubah project lama (stateless QRIS dynamic generator) menjadi
**payment gateway penuh** dengan lifecycle transaksi, multi-tenant merchant,
payment detection, dan webhook notification.

**Bedanya** dengan PG mainstream: QRIS-nya adalah QRIS personal kamu sendiri
(disimpan per-merchant di DB), jadi 100% dana langsung masuk ke rekening/e-wallet
kamu — tanpa perantara, tanpa biaya gateway.

## Fitur

- ✅ **Multi-merchant** — tiap merchant punya API key & webhook secret sendiri
- ✅ **API Xendit/Duitku style** — `POST /v2/qris`, `GET /v2/payment-status`, dll
- ✅ **Auto-detection** via Macrodroid (notification listener di HP Android)
- ✅ **Unique digit matching** — nominal unik per transaksi PENDING
- ✅ **Signed webhook** `payment.success` (HMAC-SHA256) + exponential retry
- ✅ **Idempotent** via `(merchantId, referenceId)`
- ✅ **Expiry cron** — transaksi lewat TTL otomatis EXPIRED
- ✅ **Swagger UI** built-in di `/api-docs`

## Quick Start (Lokal)

```bash
# 1. Backend
cd backend
cp .env.example .env             # edit DATABASE_URL, INTERNAL_TOKEN, ADMIN_TOKEN
npm install
npm run db:ensure                # buat database PostgreSQL
npm run prisma:migrate           # apply schema
npm start                        # jalan di port 8080

# 2. Register merchant pertama (dapat API key 1x)
curl -X POST http://localhost:8080/admin/merchants \
  -H "X-Admin-Token: <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"Test","staticQris":"000201...","webhookUrl":"https://your.app/wh"}'

# 3. Buat transaksi
curl -X POST http://localhost:8080/v2/qris \
  -H "Authorization: Bearer drp_live_..." -H "Content-Type: application/json" \
  -d '{"referenceId":"INV-001","amount":25000}'
```


## Dokumentasi

| Topik | File |
|---|---|
| Backend setup & API reference | [`backend/README.md`](./backend/README.md) |
| API docs (curated HTML) | [`api-documentation.html`](./api-documentation.html) |
| API docs (Swagger interaktif) | `http://localhost:8080/api-docs` saat server jalan |
| Setup payment detector (Android) | [`backend/docs/MACRODROID.md`](./backend/docs/MACRODROID.md) |
| Deploy aaPanel + Nginx + SSL | [`backend/docs/DEPLOY-AAPANEL.md`](./backend/docs/DEPLOY-AAPANEL.md) |

## Struktur Repo

```
.
├── index.html                # Landing page (front publik)
├── api-documentation.html    # API reference (curated)
├── style.css                 # Shared styling (dark blue theme)
├── images/                   # Logo & aset
├── README.md                 # (file ini)
└── backend/                  # Payment gateway server
    ├── prisma/               # schema, migrations, seed
    ├── scripts/              # one-off scripts + e2e tests
    ├── src/                  # config, routes, services, middlewares, utils, jobs
    └── docs/                 # MACRODROID.md, DEPLOY-AAPANEL.md
```

## License

Personal use — © DRP Network Solutions.
