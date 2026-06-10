# QRIS Dynamic Generator

## Setup Environment Variables

1. Edit file `.env` di folder backend:

```bash
cd backend
```

2. Ubah file `.env`:

```bash
# API Key untuk autentikasi (ganti dengan key yang aman)
API_KEY=your_secure_api_key_here

# Server port
PORT=3001
NODE_ENV=production
```

## Install Dependencies

```bash
cd backend
npm install
```

## API Authentication dengan API Key

### API Endpoints:

**1. Generate QRIS Dinamis dari Static:**

```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "staticQris": "QRIS_CODE_HERE",
    "amount": 1000
  }'
```

**2. Ambil static QR dari Gambar QRIS:**

```bash
curl -X POST http://localhost:3001/api/parse-image \
  -F "file=@qr_image.jpg"
```

### Response Format:

**Generate API:**

```json
{
  "dynamicQris": "00020101021226610014COM...",
  "qrImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

**Parse API:**

```json
{
  "qris": "00020101021126610014COM..."
}
```

## Frontend Configuration

API dan Frontend tanpa menggunakan API key.

Feel free to use.
Bisa pakai macrodroid untuk tangkap notifikasi dan kirim webhook.

