# Deploy ke aaPanel + Nginx (Production)

> Panduan lengkap deploy **DRP Payment Gateway** ke VPS dengan aaPanel.
> Stack: aaPanel → PostgreSQL → Node.js (PM2) → Nginx reverse proxy → SSL Let's Encrypt.

---

## 0. Prasyarat

- **VPS** Ubuntu 20.04/22.04/Debian 11+ (recommended), minimal 1 vCPU / 1GB RAM.
- **aaPanel** sudah terinstall. Kalau belum:
  ```bash
  # Ubuntu/Debian
  wget -O install.sh http://www.aapanel.com/script/install-ubuntu_7.0_en.sh && bash install.sh aapanel
  ```
  Buka panel via URL & credentials yang diberikan setelah install.
- **Domain** sudah di-A-record ke IP VPS. Contoh: `pay.example.com`.
- **Port** yang dibuka di firewall aaPanel: 80 (HTTP), 443 (HTTPS).
  Port backend (8080) **TIDAK** perlu di-expose — diakses hanya via nginx.

---

## 1. Install Stack via aaPanel App Store

Buka aaPanel → **App Store** → install:

1. **PostgreSQL** (versi 14 atau 15) → Manage → set root password (catat!).
2. **PM2 Manager** (Node.js versi 18 atau 20 LTS) → pakai untuk jalanin backend.
3. **Nginx** (biasanya sudah otomatis terinstall).

> PostgreSQL: setelah install, klik **Manage** → **phpPgAdmin** bisa diakses untuk
> manajemen via web (opsional).

---

## 2. Setup Database

Via SSH (lebih cepat & reliable):

```bash
sudo -u postgres psql
```

```sql
CREATE USER drp WITH PASSWORD 'password-kuat-disini';
CREATE DATABASE drp_payment OWNER drp ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE drp_payment TO drp;
\q
```

Atau via aaPanel: **Databases** → **PostgreSQL** → **Add database**:
- Database name: `drp_payment`
- Username: `drp`
- Password: (generate yang kuat)
- Access permission: `Local access only` (aman!)

---

## 3. Clone Repo & Install Backend

```bash
# Pilih lokasi (aaPanel default website dir)
cd /www/wwwroot
git clone https://github.com/USERNAME/drp-payment.git pay.example.com
cd pay.example.com/backend

# Install dependencies
npm ci --omit=dev

# Generate secrets kuat
node -e "console.log('INTERNAL_TOKEN=' + require('crypto').randomBytes(32).toString('hex')); console.log('ADMIN_TOKEN=' + require('crypto').randomBytes(32).toString('hex'))"
```

Buat `.env`:

```bash
cp .env.example .env
nano .env
```

Edit isi `.env`:

```bash
PORT=8080
NODE_ENV=production

DATABASE_URL="postgresql://drp:password-kuat-disini@127.0.0.1:5432/drp_payment"

INTERNAL_TOKEN=<output-dari-node-crypto-di-atas>
ADMIN_TOKEN=<output-dari-node-crypto-di-atas>

# Kredensial login dashboard (email + password)
# Default: admin@drp.local / admin123 — wajib ganti setelah deploy!
ADMIN_EMAIL=admin@drp.local
ADMIN_PASSWORD=password-yang-kuat

DEFAULT_EXPIRY_MINUTES=15
QR_IMAGE_FORMAT=png
```

Set permission:

```bash
cd /www/wwwroot/pay.example.com
chown -R www:www .
cd backend
chmod 600 .env
```

---

## 4. Migrasi & Seed

```bash
cd /www/wwwroot/pay.example.com/backend

# Generate Prisma client + apply migration
npx prisma generate
npx prisma migrate deploy   # untuk production (TANPA --name)

# Cek koneksi
node -e "const {PrismaClient}=require('@prisma/client');new PrismaClient().\$connect().then(()=>{console.log('DB OK');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
```

Seed akun admin + merchant pertama:

```bash
cd /www/wwwroot/pay.example.com/backend

# Admin auto-created dari env ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_TOKEN .
# Token dari ADMIN_TOKEN dipakai sebagai apiToken sehingga tidak invalidate
# dashboard yang sudah login dengan token lama.
npm run seed
```

> **Kredensial login dashboard**: email `ADMIN_EMAIL` + password `ADMIN_PASSWORD` dari `.env`.
> Dashboard di https://pay.example.com — login form email + password seperti payment gateway mainstream.

Merchant pertama bisa dibuat via dashboard setelah login, atau via API (lihat langkah 8).

---

## 5. Jalankan Backend via PM2 Manager

Lewat aaPanel UI (recommended):

1. aaPanel → **App Store** → **PM2 Manager** → **Settings**.
2. **Add project**:
   - **Project directory**: `/www/wwwroot/pay.example.com/backend`
   - **Node version**: 18.x atau 20.x
   - **Project name**: `drp-payment`
   - **Startup file / script**: `src/server.js`
   - **Run user**: `www`
3. Klik **Submit** → project auto-start.

Atau via CLI:

```bash
cd /www/wwwroot/pay.example.com/backend
pm2 start src/server.js --name drp-payment --user www
pm2 save
pm2 startup     # enable auto-restart on boot (ikutin instruksi output-nya)
```

Cek log:

```bash
pm2 logs drp-payment --lines 50
```

Harus muncul:
```
INFO: DRP Payment Gateway listening on 0.0.0.0:8080
INFO: scheduled job { job: "expire-stale" }
INFO: scheduled job { job: "webhook-retries" }
```

Test lokal di VPS:

```bash
curl http://127.0.0.1:8080/health
# {"status":"OK","timestamp":"..."}
```

---

## 5.5. Build Frontend

> Step ini WAJIB — FE static files harus ada sebelum website dibuat.

```bash
cd /www/wwwroot/pay.example.com/web
npm ci
npm run build
# Hasil: /www/wwwroot/pay.example.com/web/dist/
```

---

## 6. Buat Website di aaPanel

1. aaPanel → **Website** → **Add site**:
   - **Domain**: `pay.example.com` (+ `www.pay.example.com` kalau perlu)
   - **Type**: PHP or Pure static — pilih **Pure static** (HTML).
   - **Database**: None.
   - **PHP version**: Pure static.
   - **Root directory**: `/www/wwwroot/pay.example.com/web/dist` (FE build output).
2. Klik **Submit**.

> **Catatan**: Root directory adalah `web/dist/`, BUKAN root repo. Nginx akan serve static file Vue dari sini.

---

## 7. Konfigurasi Nginx Reverse Proxy

aaPanel → **Website** → klik site `pay.example.com` → **Config** (ikon settings).

Replace isi config dengan template di bawah (sesuaikan `server_name` & root path):

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name pay.example.com;

    # SSL config (akan diisi otomatis oleh aaPanel SSL manager, biarkan placeholder)
    # ssl_certificate     /www/server/panel/vhost/certificate/pay.example.com/fullchain.pem;
    # ssl_certificate_key /www/server/panel/vhost/certificate/pay.example.com/privkey.pem;

    # Redirect HTTP -> HTTPS (aktifkan setelah SSL ke-install)
    # if ($server_port !~ 443){
    #     rewrite ^(/.*)$ https://$host$1 permanent;
    # }

    # Frontend statis (Vue build output)
    root /www/wwwroot/pay.example.com/web/dist;
    index index.html;

    # Upload limit (image QR base64 cukup besar)
    client_max_body_size 10M;

    # --- API routes: reverse proxy ke Node ---
    location /v2/            { proxy_pass http://127.0.0.1:8080; include /www/server/panel/vhost/nginx/proxy.conf; }
    location /admin/         { proxy_pass http://127.0.0.1:8080; include /www/server/panel/vhost/nginx/proxy.conf; }
    location /api/           { proxy_pass http://127.0.0.1:8080; include /www/server/panel/vhost/nginx/proxy.conf; }
    location = /health       { proxy_pass http://127.0.0.1:8080; include /www/server/panel/vhost/nginx/proxy.conf; }
    location /api-docs       { proxy_pass http://127.0.0.1:8080; include /www/server/panel/vhost/nginx/proxy.conf; }
    location /api-docs/      { proxy_pass http://127.0.0.1:8080; include /www/server/panel/vhost/nginx/proxy.conf; }

    # --- Static assets ---
    location ~* \.(css|js|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # --- SPA fallback (kalau FE proper pakai client-side routing) ---
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

Isi file `/www/server/panel/vhost/nginx/proxy.conf` (cek dulu, biasanya sudah ada bawaan aaPanel):

```nginx
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_connect_timeout 60s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;
proxy_buffering off;
```

Test config & reload:

```bash
nginx -t && nginx -s reload
```

---

## 8. Install SSL Let's Encrypt

1. aaPanel → **Website** → site `pay.example.com` → **SSL** → **Let's Encrypt**.
2. Pilih domain → verify via HTTP → **Apply**.
3. Setelah issued, enable **Force HTTPS** toggle.
4. Uncomment baris `ssl_certificate`, `ssl_certificate_key`, dan block redirect HTTP→HTTPS di config nginx langkah 7.
5. Reload nginx: `nginx -s reload`.

Verifikasi:

```bash
curl -I https://pay.example.com/health
# HTTP/2 200, status OK
```

---

## 9. Register Merchant Pertama

Login via API untuk mendapatkan token:

```bash
curl -X POST https://pay.example.com/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@drp.local","password":"password-yang-kuat"}'
# Response: {"apiToken":"change-me-too","email":"admin@drp.local"}
# Simpan apiToken, gunakan di header X-Admin-Token
```

Buat merchant baru:

```bash
TOKEN="<apiToken-dari-response-login>"

curl -X POST https://pay.example.com/admin/merchants \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_TOKEN>" \
  -d '{
    "name": "Merchant Pertama",
    "email": "merchant@example.com",
    "staticQris": "00020101021126...",
    "webhookUrl": "https://your-app.com/qris-callback"
  }'
```

Response mengandung `apiKey` (format `drp_live_...`) & `webhookSecret` — **simpan aman, hanya muncul sekali**.

Test create transaction:

```bash
curl -X POST https://pay.example.com/v2/qris \
  -H "Authorization: Bearer drp_live_..." \
  -H "Content-Type: application/json" \
  -d '{"referenceId":"TEST-001","amount":25000}'
```

---

## 10. Setup Macrodroid (HP Detector)

Ikuti panduan lengkap di [`backend/docs/MACRODROID.md`](./backend/docs/MACRODROID.md).

Pointing utama:
- `server_url` (Macrodoid variable): `https://pay.example.com/v2/callback`
- `internal_token` (Macrodoid variable): isi `INTERNAL_TOKEN` dari `.env`

Pastikan HP punya internet & bisa reach `https://pay.example.com/health`.

---

## 11. Maintenance & Operasional

### Update kode

Deploy produksi otomatis via **GitHub Actions** (build di CI, rsync artefak — server tidak menjalankan `npm install` / `npm build`). Lihat section [Auto-deploy](#12-auto-deploy-github-actions) di bawah.

Manual fallback (hanya jika Actions down):

```bash
# Dari mesin lokal/WSL yang punya .deploy.env + SSH key:
npm ci --prefix web && npm run build --prefix web
npm ci --prefix backend
npx --prefix backend prisma generate
npm run bundle --prefix backend && npm run openapi --prefix backend
npm run pack:release && npm run deploy
```

> Jangan `npm ci` di VPS untuk update rutin — itu yang digantikan oleh release bundle.

### Backup database

Via aaPanel: **Cron** → **Add task**:
- Task type: Shell script
- Execution time: daily 03:00
- Script:
  ```bash
  pg_dump -U drp -h 127.0.0.1 drp_payment | gzip > /www/backup/drp_payment_$(date +\%Y\%m\%d).sql.gz
  find /www/backup -name "drp_payment_*.sql.gz" -mtime +7 -delete
  ```

### Lihat log realtime

```bash
pm2 logs drp-payment
# atau spesifik
pm2 logs drp-payment --lines 200 --err
```

### Rotate API key merchant (jika bocor)

```bash
# Login dulu untuk dapat token
TOKEN=$(curl -s -X POST https://pay.example.com/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@drp.local","password":"password-yang-kuat"}' | \
  python3 -c "import sys,json;print(json.load(sys.stdin)['apiToken'])")

curl -X POST https://pay.example.com/admin/merchants/<MERCHANT_ID>/rotate-api-key \
  -H "X-Admin-Token: $TOKEN"
```

### Monitoring sederhana

```bash
# Cek status semua PENDING trx
PGPASSWORD='password-kuat' psql -U drp -h 127.0.0.1 -d drp_payment -c \
  "SELECT status, COUNT(*) FROM \"Transaction\" GROUP BY status ORDER BY status;"

# Webhook yang masih FAILED
PGPASSWORD='password-kuat' psql -U drp -h 127.0.0.1 -d drp_payment -c \
  "SELECT id, \"webhookAttempts\", \"updatedAt\" FROM \"Transaction\" WHERE \"webhookStatus\" = 'FAILED' ORDER BY \"updatedAt\" DESC LIMIT 10;"
```

---

## 12. Auto-deploy (GitHub Actions)

Deploy mengikuti pola yang sama dengan project lain DRP: **build di CI**, upload artefak ringkas via `rsync`, server **tidak** menjalankan `npm install` / `npm build`.

Alur: push `main` → Actions build `web/dist` + bundle `backend/dist/server.cjs` → pack `release/` (Prisma `node_modules` saja) → `scripts/deploy.sh` → `prisma migrate deploy` + PM2 start dari `ecosystem.config.cjs`.

### Setup sekali

1. Di VPS, pastikan `backend/.env` sudah ada dan PM2 user (biasanya `www`) bisa jalan.
2. Buat SSH key deploy (ed25519, tanpa passphrase), masukkan **public** key ke `~/.ssh/authorized_keys` user SSH.
3. Di GitHub repo → **Settings → Environments → New environment** bernama `.deploy.env`.
4. Isi Environment:

| Name | Jenis | Contoh |
|---|---|---|
| `DEPLOY_SSH_KEY` | Secret | Isi private key lengkap (boleh key yang sama dengan project lain, mis. `kasq_deploy`) |
| `DEPLOY_HOST` | Variable | IP atau hostname VPS |
| `DEPLOY_USER` | Variable | `root` (untuk rsync + chown) |
| `DEPLOY_PORT` | Variable | `22` |
| `DEPLOY_PATH` | Variable | `/www/wwwroot/pay.example.com` |
| `DEPLOY_APP_USER` | Variable | `dianrp` (user PM2 non-root; satu grup dengan `www`) |
| `DEPLOY_PM2_NAME` | Variable | `drp-payment` |

5. Push ke `main` atau **Actions → Deploy → Run workflow**.

### Deploy lokal (WSL)

```bash
cp .deploy.env.example .deploy.env   # edit nilainya
# setelah web build + backend bundle + openapi:
npm run pack:release
npm run deploy
```

### Catatan

- `.env` dan folder `backups/` **tidak** di-overwrite.
- FE yang di-serve Nginx tetap `$DEPLOY_PATH/web/dist`.
- Deploy pertama akan `pm2 delete` lalu start ulang dari `backend/ecosystem.config.cjs` (script = `dist/server.cjs`).
- Sisa `web/node_modules` dari deploy lama dihapus otomatis di akhir script.

---

## 13. Troubleshooting

| Gejala | Cek / Solusi |
|---|---|
| `502 Bad Gateway` di browser | Backend down. `pm2 status` & `pm2 logs drp-payment`. Cek `.env` & koneksi DB. |
| `504 Gateway Timeout` | Backend hang. Restart `pm2 restart drp-payment`. Cek memory: `free -m`. |
| Macrodoid callback 401 | `X-Internal-Token` salah di Macrodoid variable. Bandingkan dengan `INTERNAL_TOKEN` di `.env`. |
| Transaksi gak ter-match | Lihat `pm2 logs` → cari `detection: no matching PENDING`. Cek nominal notif vs totalAmount. |
| Webhook merchant 401/403 | Signature verify gagal di merchant. Pastikan merchant verify **raw body** (sebelum JSON.parse) dengan `webhookSecret`. |
| n8n verify signature | Gunakan field `X-DRP-Token` — JWT HS256. Extract header → JWT Verify node → algorithm HS256 → secret = `webhookSecret`. |
| SSL expired | aaPanel → SSL → renew manual atau aktifkan auto-renew. |
| Prisma error `connection refused` | `DATABASE_URL` salah / Postgres service mati. `systemctl status postgresql`. |
| Backup gagal: `pg_dump: command not found` | Binary tidak ada di PATH process PM2. Cari lokasinya (`ls /www/server/pgsql/bin/pg_dump`), lalu set `PG_BIN_DIR=/www/server/pgsql/bin` di `.env` → `pm2 restart drp-payment --update-env`. Kalau binary memang belum ada: `apt install postgresql-client` (Debian/Ubuntu) atau `yum install postgresql` (RHEL). |
| Backup gagal: `server version mismatch` | Versi `pg_dump` lebih tua dari server Postgres. Arahkan `PG_BIN_DIR` ke folder bin dengan versi yang sama/lebih baru dari server. |
| Permission denied saat pm2 start | `chown -R www:www /www/wwwroot/pay.example.com` & pastikan PM2 Manager run user = `www`. |
| Actions deploy gagal di SSH | Cek `DEPLOY_SSH_KEY` / `DEPLOY_HOST` di Environment `.deploy.env`. Pastikan public key ada di `authorized_keys`. |
| Actions: `Missing .../.env` | Buat `backend/.env` di server sekali (tidak di-sync dari CI). |

---

## 14. Hardening (Opsional, Recommended)

1. **Firewall aaPanel**: buka hanya 80, 443, 22 (SSH, ganti port default). Block 8080 dari external.
2. **Fail2ban** untuk SSH brute-force.
3. **Disable phpPgAdmin** setelah setup (atau restrict akses ke IP tertentu via nginx `allow/deny`).
4. **Backup terenkripsi** ke S3/R2 weekly.
5. **Uptime monitoring**: pakai UptimeRobot / Better Stack → ping `https://pay.example.com/health` tiap menit.
6. **Logrotate** untuk log PM2 (auto by aaPanel/PM2).

---

## 15. Quick Reference

| Apa | Dimana |
|---|---|
| Repo clone | `/www/wwwroot/pay.example.com` |
| Backend `.env` | `/www/wwwroot/pay.example.com/backend/.env` |
| Frontend static | `/www/wwwroot/pay.example.com/web/dist` (served by nginx) |
| Nginx site config | aaPanel → Website → site → Config (file: `/www/server/panel/vhost/nginx/pay.example.com.conf`) |
| PM2 process | `drp-payment` (lihat: `pm2 status`) |
| Log backend | `pm2 logs drp-payment` |
| Postgres | aaPanel → Databases → PostgreSQL |
| Swagger UI | `https://pay.example.com/api/docs` |
| Auto-deploy | GitHub Actions → workflow **Deploy** (Environment `.deploy.env`) |

---

Selesai. Server siap menerima transaksi QRIS & kirim webhook ke merchant secara real-time.
