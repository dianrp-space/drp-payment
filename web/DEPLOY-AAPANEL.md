# Deploy Frontend Web ke aaPanel

> Panduan deploy **DRP Payment Console** (Vue 3 + daisyUI) ke aaPanel.
> Static file output di `web/dist/`, di-serve langsung oleh Nginx.

---

## 1. Build Frontend

```bash
cd /www/wwwroot/pay.example.com/web

# Install dependencies
npm ci

# Build (skip vue-tsc agar cepat)
npm run build

# Hasil static files → web/dist/
```

> Jika ada error saat build, coba `npm install` dulu (devDependencies juga diinstall), lalu `npm run build`.

---

## 2. Setup Website di aaPanel

1. aaPanel → **Website** → **Add site**
   - **Domain**: `pay.example.com`
   - **Type**: Pure static
   - **Root directory**: `/www/wwwroot/pay.example.com/web/dist`
2. Klik **Submit**

---

## 3. Nginx Config

aaPanel → Website → site → **Config**. Pastikan config seperti ini:

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name pay.example.com;

    root /www/wwwroot/pay.example.com/web/dist;
    index index.html;

    client_max_body_size 10M;

    # Reverse proxy ke backend Node.js
    location /v2/            { proxy_pass http://127.0.0.1:8080; include /www/server/panel/vhost/nginx/proxy.conf; }
    location /admin/         { proxy_pass http://127.0.0.1:8080; include /www/server/panel/vhost/nginx/proxy.conf; }
    location /api/           { proxy_pass http://127.0.0.1:8080; include /www/server/panel/vhost/nginx/proxy.conf; }
    location = /health       { proxy_pass http://127.0.0.1:8080; include /www/server/panel/vhost/nginx/proxy.conf; }

    # Static assets cache
    location ~* \.(css|js|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # SPA fallback — semua route selain di atas diarahkan ke index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

> **Penting**: `try_files $uri $uri/ /index.html` — ini wajib untuk SPA (Vue Router mode history). Tanpa ini, refresh halaman selain `/` akan 404.

Cek & reload:

```bash
nginx -t && nginx -s reload
```

---

## 4. SSL (Let's Encrypt)

1. aaPanel → Website → site → **SSL** → **Let's Encrypt**
2. Pilih domain → Apply
3. Enable **Force HTTPS**
4. Reload Nginx

---

## 5. Environment Variables

Frontend di `web/.env.development` hanya untuk lokal. Di production, environment variable di-inject saat **build time** via Vite.

Buat file `.env.production` di `web/`:

```bash
cd /www/wwwroot/pay.example.com/web
cat > .env.production << EOF
VITE_API_BASE_URL=/api
VITE_ADMIN_API_PREFIX=/admin
EOF
```

Lalu build ulang:

```bash
npm run build
```

> File `.env.production` hanya diperlukan kalau ada variable frontend (seperti `VITE_*`). Default sudah指向 ke `/api` yang di-proxy ke backend oleh Nginx.

---

## Quick Reference

| Perintah | Keterangan |
|---|---|
| `npm run build` | Build production (skip typecheck) |
| `npm run typecheck` | TypeCheck aja (tanpa build) |
| `npm run dev` | Dev server lokal `http://localhost:5173` |
| Root directory | `/www/wwwroot/pay.example.com/web/dist` |
| SPA fallback | `try_files $uri $uri/ /index.html` |
