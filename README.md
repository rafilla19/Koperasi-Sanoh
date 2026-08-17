# Koperasi Sanoh

Aplikasi manajemen koperasi karyawan — mencakup simpanan (wajib/sukarela/pokok), pinjaman, SHU (Sisa Hasil Usaha), dan pendaftaran anggota, dengan backend Django REST Framework dan frontend React (Vite).

## Fitur Utama

- **Keanggotaan** — pendaftaran anggota baru (multi-step form), verifikasi email OTP, approval oleh admin, penutupan akun (close account).
- **Simpanan** — simpanan wajib, sukarela, dan pokok. Tagihan bulanan otomatis, pembayaran via payroll deduction, manual (transfer), dan payment gateway (Midtrans), termasuk denda keterlambatan (pinalti) untuk Simpanan Wajib.
- **Pinjaman** — pengajuan pinjaman, approval, penjadwalan angsuran, pembayaran (payroll/manual/gateway), pinalti keterlambatan, alokasi dana pinjaman dari simpanan (fund allocation).
- **SHU (Sisa Hasil Usaha)** — perhitungan dan distribusi SHU bulanan ke anggota, dashboard net sales & cashflow.
- **Credit Scoring (ML)** — modul `ml_service` memakai XGBoost untuk menilai kelayakan kredit anggota dan merekomendasikan suku bunga berbasis risiko (Risk-Based Pricing). Detail lengkap di [`backend/ml_service/README.md`](backend/ml_service/README.md).
- **Enkripsi Data Sensitif** — NIK KTP, NPWP, dan file dokumen (scan KTP/NPWP) dienkripsi at-rest (AES via Fernet), dengan pencarian/pengecekan duplikat NIK memakai hash HMAC-SHA256 terpisah.
- **Payment Gateway** — integrasi Midtrans Snap untuk pembayaran simpanan/pinjaman via QRIS, GoPay, ShopeePay, DANA, dsb.
- **Dashboard Admin** — ringkasan aset koperasi, approval pending (registrasi, pinjaman, penutupan akun, penarikan, simpanan sukarela), manajemen data master (komponen SHU, departemen, jenis pinjaman, kanal pembayaran, funding/pinalti).

## Tech Stack

**Backend**
- Django + Django REST Framework
- PostgreSQL (di-hosting di Supabase)
- Supabase Storage (S3-compatible, via `django-storages` + `boto3`) untuk file dokumen
- Business logic transaksional ditulis sebagai PostgreSQL stored procedures (`CALL sp_...`), bukan murni Django ORM
- `django-apscheduler` untuk job terjadwal (generate tagihan bulanan, dsb.)
- `midtransclient` untuk integrasi payment gateway
- `scikit-learn` / `xgboost` / `pandas` untuk modul ML credit scoring

**Frontend**
- React 19 + Vite
- React Router untuk routing
- Chart.js (`react-chartjs-2`) untuk visualisasi data
- `xlsx`, `jspdf` + `jspdf-autotable` untuk export laporan (Excel/PDF)

## Struktur Proyek

```
Koperasi-Sanoh/
├── backend/
│   ├── api/
│   │   ├── member/     # Keanggotaan, registrasi, approval, autentikasi
│   │   ├── saving/     # Simpanan, tagihan bulanan, wallet
│   │   ├── loan/       # Pinjaman, angsuran, payment gateway
│   │   ├── shu/        # Perhitungan & distribusi SHU
│   │   ├── master/     # Data master (departemen, status, bank, dsb.)
│   │   └── utils/      # Helper bersama (auth, email, enkripsi PII)
│   ├── ml_service/     # Modul credit scoring (XGBoost)
│   └── config/         # Django settings & root URL config
└── frontend/
    └── src/
        ├── pages/
        │   ├── admin/        # Halaman admin (dashboard, approval, manajemen)
        │   ├── member/       # Halaman member (dashboard, pinjaman, simpanan)
        │   ├── registration/ # Wizard pendaftaran anggota baru
        │   └── auth/         # Login
        └── services/         # API client (fetch wrapper, auth header)
```

## Menjalankan Secara Lokal

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate       # Windows
pip install -r requirements.txt
```

Buat file `.env` di dalam `backend/` berisi (minimal):

```
SECRET_KEY=
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database (PostgreSQL / Supabase)
DB_NAME=
DB_USER=
DB_PASSWORD=
DB_HOST=
DB_PORT=

# SMTP (untuk email verifikasi/notifikasi)
EMAIL_HOST=
EMAIL_PORT=
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
DEFAULT_FROM_EMAIL=

# Supabase Storage (S3-compatible)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_STORAGE_BUCKET_NAME=
AWS_S3_ENDPOINT_URL=
SUPABASE_URL=

# Midtrans
MIDTRANS_MERCHANT_ID=
MIDTRANS_CLIENT_KEY=
MIDTRANS_SERVER_KEY=
MIDTRANS_IS_PRODUCTION=False

# Frontend
FRONTEND_BASE_URL=http://localhost:5173

# Enkripsi PII (NIK/NPWP) — jangan diganti setelah ada data, ciphertext lama jadi tidak terbaca
FIELD_ENCRYPTION_KEY=
FIELD_HASH_KEY=
```

```bash
python manage.py migrate
python manage.py runserver
```

> Catatan: sebagian besar logic transaksional (pembayaran, approval, rollback) berjalan lewat PostgreSQL stored procedures. Beberapa di antaranya di-*track* lewat Django migrations (`api/saving/migrations/`), sebagian lain diterapkan langsung ke database — cek `pg_get_functiondef` di database kalau butuh definisi SP terkini.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Secara default frontend memanggil API di `/api/v1` (lihat `frontend/src/services/api.js`, bisa dioverride lewat env var `VITE_API_URL`).

## Keamanan

- Autentikasi memakai signed token (`Authorization: Bearer <token>`), bukan session cookie Django standar — lihat `backend/api/utils/auth.py`.
- NIK KTP, NPWP, serta dokumen (scan KTP/NPWP) dienkripsi at-rest. Detail mekanismenya di `backend/api/utils/crypto_utils.py`.
- Jangan commit file `.env` — semua kredensial (DB, SMTP, Storage, Midtrans, kunci enkripsi) harus tetap berada di environment variable.
