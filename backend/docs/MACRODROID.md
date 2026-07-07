# DRP Payment Gateway — Macrodroid Setup

> Macrodroid adalah aplikasi Android automation yang dipakai untuk "mendengarkan"
> notifikasi pembayaran masuk dari e-wallet / m-banking dan meneruskannya ke
> server DRP Payment Gateway untuk matching transaksi.

## Prasyarat

- Android phone aktif yang **menjadi tujuan pembayaran QRIS** (HP pribadi kamu
  tempat GoPay/DANA/dll menerima dana). HP ini harus menyala 24/7.
- Android 7.0+ (Macrodroid butuh Notification Listener permission).
- Macrodoid versi gratis cukup (limit 5 macro global, kita pakai 1).
- Install dari Play Store: <https://play.google.com/store/apps/details?id=com.joaomgcd.macrodoid>
  atau MacroDroid (ejaan resmi).

---

## Arur Kerja

```
[Customer scan QRIS]
        ↓
[Customer bayar via e-wallet]
        ↓
[E-wallet kasih notif ke HP kamu: "Anda menerima Rp25.562"]
        ↓
[Macrodoid Trigger: Notification Received]
        ↓
[Macrodoid Action: HTTP POST ke /v2/callback atau /v2/callback/:merchantId]
        ↓
[Server parse nominal → match PENDING transaction → mark PAID → webhook]
```

> Ada dua mode callback:
> - **Global** — `POST /v2/callback` + header `X-Internal-Token`. Cocokkan
>   transaksi PENDING **semua merchant** (mode lama, tetap didukung).
> - **Per-merchant** — `POST /v2/callback/:merchantId` + header
>   `X-Callback-Token: <merchant.callbackToken>`. Hanya cocokkan transaksi
>   milik merchant itu. Token & URL di-generate dari dashboard merchant.

---

## Step 1: Setup Variables di Macrodroid

Buka Macrodroid → **Variables** → tambah:

| Nama Variable      | Type   | Default       | Keterangan                          |
|--------------------|--------|---------------|-------------------------------------|
| `server_url`       | String | `http://IP_SERVER_KAMU:8080/v2/callback` | Endpoint gateway (atau `APP_URL` di `.env` backend) |
| `internal_token`   | String | (isi `INTERNAL_TOKEN` dari `.env`)       | Auth token        |

> Set `APP_URL` di `.env` backend (mis. `https://pay.drpnet.my.id`) supaya
> URL callback yang ditampilkan di dashboard merchant otomatis benar. Base URL
> ini akan muncul di **Merchant → detail → Callback Macrodroid** dan dipakai
> oleh konsol admin untuk generate link siap-pakai ke Macrodroid.

> **Penting**: `server_url` harus IP publik / DDNS / Tailscale IP yang reachable
> dari HP. Kalau server di rumah dan HP di rumah, bisa pakai IP lokal (misal
> `http://192.168.1.10:8080/v2/callback`).

---

## Step 2: Buat Macro "Payment Notif Listener"

**Add Macro** → kasih nama `DRP Payment Listener`.

### Trigger (1)

- Pilih **Events** → **Notification** → **Notification received**.
- Pilih aplikasi e-wallet yang dipakai (GoPay, DANA, OVO, ShopeePay, SeaBank,
  BCA Mobile, Livin', BRImo, Jenius, dll). **Centang semua** yang kamu pakai.
- Notification type: **Any**.
- (Opsional) Text contains: kosongkan supaya semua notif masuk.

> Tip: kalau banyak e-wallet, buat **trigger per-app** di macro terpisah supaya
> mudah debug & isolate.

### Constraints (0)

Tidak perlu constraint.

### Actions (3)

#### Action 1 — Set Variable `notif_text` (local string)

Variable type: **Local variable** → name: `notif_text`.

Set value pake **MacroDroid magic text**. Tekan `{}` untuk pilih:

```
[notification_text]
```

Atau lebih lengkap untuk matching:

```
[notification_title] | [notification_text] | [notification_big_text]
```

#### Action 2 — HTTP Request

Pilih **Action** → **Web** → **HTTP Request**.

| Field           | Nilai                                                                |
|-----------------|----------------------------------------------------------------------|
| Method          | `POST`                                                              |
| URL             | `[v=server_url]`                                                    |
| Body            | Lihat **JSON Body** di bawah                                          |
| Content Type    | `application/json`                                                   |
| Custom Header 1 | Name: `X-Internal-Token`  Value: `[v=internal_token]`              |
| Timeout         | 30 detik                                                            |

> **Penting (Macrodroid versi baru)**: Macrodroid sering mengirim field via
> **query string** (URL parameter), bukan JSON body. Server sudah mendukung
> keduanya. Jika Macrodroid Anda kirim via query, cukup set URL ke:
>
> ```
> [v=server_url]?notif_text=[notification_text]&notif_app=[notification_title]&status=paid&timestamp=[notification_time]
> ```
>
> dan kosongkan Body. Field mapping yang dikenali server:
>
> | Query field      | Field server | Contoh                                   |
> |------------------|--------------|------------------------------------------|
> | `notif_text`     | text         | "Kamu telah menerima pembayaran Rp 100.149 dari OVO" |
> | `notif_app`      | app          | "Livin Merchant"                         |
> | `notif_title`    | title        | "Pembayaran diterima"                    |
> | `notif_big_text` | bigText      | (opsional)                               |
> | `status`         | status       | "paid" — selain "paid" akan di-skip      |
> | `timestamp`      | timestamp    | "1756476503893" (unix ms)                |
> | `amount`         | amount       | pre-parsed nominal (opsional)            |
>
> Server juga menerima field canonical (`?text=...&app=...&status=paid`)
> sebagai alias. Body JSON (camelCase) dan query string bisa dicampur.

**JSON Body** (copy-paste persis, ganti placeholder pakai magic text via tombol `{}`):

```json
{
  "app": "{package_name}",
  "title": "[notification_title]",
  "text": "[notification_text]",
  "bigText": "[notification_big_text]",
  "summary": "[notification_summary]",
  "ticker": "[notification_ticker]",
  "timestamp": "[notification_time]"
}
```

> Catatan: nama magic text Macrodroid bisa beda antar versi. Yang penting
> masukkin minimal **salah satu** field `title` / `text` / `bigText` yang
> mengandung nominal (biasanya `text` atau `bigText`).

#### Action 3 — Vibrate / Toast (optional debugging)

Pilih **Action** → **Device** → **Vibrate** (singkat) supaya kamu tahu macro
jalan pas ada notif masuk. Atau **Toast** message: `DRP: sent to server`.

---

## Step 3: Permissions Wajib

Setelah macro dibuat, Macrodroid bakal minta permission. Pastikan semua granted:

1. **Notification Listener** — Settings → Notification access → enable Macrodroid.
2. **Background run / Battery optimization disabled** untuk Macrodroid (settings
   Android → Battery → Macrodroid → "Don't optimize").
3. **Draw over other apps** (opsional, untuk debugging Toast).
4. **Internet** — otomatis granted saat install.

---

## Step 4: Test End-to-End

1. Start server: `npm start` (di komputer server).
2. Pastikan `/health` reachable dari HP:
   - Buka browser di HP → `http://IP_SERVER_KAMU:8080/health`
   - Harus muncul `{"status":"OK",...}`
3. Buat transaksi PENDING via API merchant:
   ```bash
   curl -X POST http://SERVER:8080/v2/qris \
     -H "Authorization: Bearer drp_live_..." \
     -H "Content-Type: application/json" \
     -d '{"referenceId":"TEST-MD-001","amount":25000}'
   ```
   Catat `totalAmount` di response (misal `25562`).
4. Transfer **tepat** sejumlah `totalAmount` ke QRIS kamu dari e-wallet manapun.
5. Tunggu notif masuk di HP → Macrodoid trigger → check server log:
   ```
   INFO: detection: transaction marked PAID { transactionId, referenceId, matchedAmount, source }
   INFO: webhook delivered { transactionId, attempt: 1, statusCode: 200 }
   ```
6. Verifikasi status via API:
   ```bash
   curl "http://SERVER:8080/v2/payment-status?referenceId=TEST-MD-001" \
     -H "Authorization: Bearer drp_live_..."
   ```
   Harus `status: "PAID"`.

---

## Troubleshooting

| Gejala | Kemungkinan | Solusi |
|---|---|---|
| Macro gak trigger sama sekali | Notification listener off | Settings Android → Notification access → enable Macrodroid |
| Macro trigger tapi server gak kena | HP gak bisa reach server | Cek firewall / IP publik / Tailscale |
| Server kena response 202 `matched:false` | Nominal di notif beda dgn totalAmount | Cek nominal asli; bisa jadi ada biaya gateway e-wallet |
| `candidates: []` di response | Notif format gak ke-parse | Lihat log server; tambahkan pattern di `notif-parser.js` |
| Webhook merchant 401/403 | Signature verify salah di merchant | Lihat section "Verifikasi Webhook" di README utama |
| Macro jalan dua kali untuk notif sama | Macrodroid bug / duplikat trigger | Pakai `Notification removed` sebagai constraint, atau dedupe via `event_id` di merchant |

### Lihat log server

```bash
# Streaming logs
tail -f backend/server.out.log
# Atau kalau di systemd:
journalctl -u drp-payment -f
```

---

## Payload Reference

### Macrodroid → Server (`POST /v2/callback` — global)

URL global = `APP_URL` di `.env` + path `/v2/callback`.

Headers:
```
X-Internal-Token: <INTERNAL_TOKEN>
```

Body (semua field opsional kecuali minimal salah satu text/amount):

```jsonc
{
  "amount": 25562,                    // pre-parsed, opsional
  "app": "com.gojek.gopay",
  "title": "GoPay",
  "text": "Anda menerima Rp25.562 dari Budi via QRIS",
  "status": "paid",                   // selain "paid" → di-skip
  "timestamp": "1756476503893",
  "device": "Pixel-7"
}
```

Atau via **query string** (mode Macrodroid):
```
POST /v2/callback?notif_text=Anda+menerima+Rp25.562&notif_app=GoPay&status=paid&timestamp=...
```

### Macrodroid → Server (`POST /v2/callback/:merchantId` — per-merchant)

URL per-merchant otomatis dibuat dari `APP_URL` di `.env` + path `/v2/callback/:merchantId`.
Lihat di dashboard: **Merchant → detail → Callback Macrodroid**.

Headers:
```
X-Callback-Token: <merchant.callbackToken>
```

> `callbackToken` di-generate saat merchant dibuat & bisa dirotasi dari dashboard.

Body (semua field opsional kecuali minimal salah satu text/amount):

```jsonc
{
  "amount": 25562,                    // pre-parsed, opsional
  "app": "Livin Merchant",
  "text": "Kamu telah menerima pembayaran Rp 100.149 dari OVO atas nama DIANXXXX.",
  "title": "Pembayaran diterima",
  "status": "paid",                   // selain "paid" → di-skip
  "timestamp": "1756476503893"
}
```

Atau via **query string** (mode Macrodroid):
```
POST /v2/callback/:merchantId?notif_text=...&notif_app=...&status=paid&timestamp=...
```

Response:
```jsonc
{
  "matched": true,
  "transactionId": "cmr...",
  "amount": 25562,
  "source": "gopay",
  "candidates": [25562]
}
```

`matched: false` (HTTP 202) artinya notif diterima tapi tidak ada PENDING
transaction yang cocok nominalnya (bukan masalah, akan di-ignore).

---

## Keamanan

- **Jangan expose** `INTERNAL_TOKEN` ke client app manapun. Hanya untuk komunikasi
  HP-detector ↔ server.
- Gunakan **HTTPS** di production (reverse proxy via nginx/Caddy).
- Pertimbangkan **IP allowlist** (`INTERNAL_ALLOWED_IPS` di `.env`) untuk
  mengunci hanya HP tertentu yang boleh callback (Phase 4 feature).
- Setiap callback dicatat dengan `source` (app guesser) untuk audit.

---

## Provider Matching (anti cross-match)

Di mode **global callback** (`POST /v2/callback`), server otomatis memisahkan
notifikasi berdasarkan **provider QRIS** supaya tidak tertukar antar merchant:

| Notif app (Macrodroid) | Provider QRIS | Contoh QRIS tag 26 sub-tag 00 |
|---|---|---|
| Livin Merchant / Livin' Merchant | `bankmandiri` | `ID.CO.BANKMANDIRI.WWW` |
| GoPay Merchant / GoPay | `gopay` | `COM.GO-JEK.WWW` / `ID.CO.GO-JEK.WWW` |
| DANA | `dana` | `ID.CO.DANA.WWW` |
| ShopeePay | `shopeepay` | `ID.CO.SHOPEEPAY.WWW` |

Cara kerja:
1. Notifikasi dikirim dengan `notif_app` (mis. "GoPay Merchant").
2. Server deteksi provider notifikasi → `gopay`.
3. Server cari merchant yang QRIS-nya dari provider `gopay` (diparse dari
   tag 26 sub-tag 00 string QRIS merchant).
4. Hanya PENDING transaction dari merchant itu yang dicocokkan.

Jadi: notif GoPay **tidak akan** match transaksi merchant Mandiri walau
nominalnya sama. Lihat provider QRIS tiap merchant di
**Merchant → detail → Provider QRIS**.

> Di mode **per-merchant** (`POST /v2/callback/:merchantId`), provider matching
> dilewati karena merchant sudah ditentukan oleh URL.
