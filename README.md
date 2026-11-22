# MARR Cinema — Tiket Bioskop Online + Panel Admin

Express (Node.js) · **Prisma** + PostgreSQL (**Neon**) · frontend JavaScript murni · pembayaran **QRIS** · deploy **Vercel**.

```
public/            website publik (landing, film, lokasi, kursi, bayar QRIS, e-tiket)
public/admin/      panel admin  →  /admin
app.js / routes/   API Express  (/api/*, /api/admin/*)
lib/               Prisma client, pengaturan, auth, audit log, generator jadwal
prisma/            schema.prisma, migrations/, seed.js
app.js              aplikasi Express (situs + API + admin)  ·  server.js = server lokal
```

## 1. Database (Neon)
1. Buat project di https://neon.tech → **Connect**.
2. Salin dua connection string: **Pooled** (host ada `-pooler`) → `DATABASE_URL`, dan **Direct** → `DIRECT_URL`.

## 2. Jalankan lokal
```bash
cp .env.example .env        # isi DATABASE_URL, DIRECT_URL, ADMIN_PASSWORD, SESSION_SECRET
npm install                 # otomatis menjalankan prisma generate
npm run db:migrate          # membuat tabel di Neon
npm run db:seed             # data contoh + jadwal 7 hari
npm start                   # http://localhost:3000  ·  admin: http://localhost:3000/admin
```

## 3. Deploy ke Vercel
1. Push folder ini ke GitHub, lalu **Add New → Project** di Vercel dan impor repo (Framework: *Other*).
2. Isi **Environment Variables**: `DATABASE_URL`, `DIRECT_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET` (`openssl rand -hex 32`), `CRON_SECRET` (`openssl rand -hex 24`).
3. **Deploy.** Build menjalankan `prisma migrate deploy` (tabel dibuat otomatis); `vercel.json` sudah mengatur rewrite `/api/*`, `/admin`, dan Cron harian.
4. Isi data awal **sekali** dari komputer Anda (dengan `.env` berisi URL Neon yang sama): `npm run db:seed`. Atau lewati seed dan input semuanya lewat `/admin`.
5. Buka `https://domain-anda.vercel.app/admin`, masuk dengan `ADMIN_PASSWORD`.

Cron `/api/cron/showtimes` (00.00 WIB) membuat jadwal 7 hari ke depan untuk film berstatus *Sedang tayang* dan membersihkan kursi kedaluwarsa. Tombol "Generate" di Admin → Jadwal melakukan hal yang sama kapan saja.

## Panel admin (`/admin`)
| Menu | Fungsi |
|---|---|
| Dashboard | Pendapatan hari ini/7/30 hari, grafik harian, film terlaris, status pesanan, keterisian 36 jam ke depan, pesanan & aktivitas terbaru (auto-refresh) |
| Pesanan | Cari/filter, lihat bukti bayar, **konfirmasi / tolak / batalkan (refund manual) / pulihkan pesanan kedaluwarsa**, catatan, tombol WhatsApp |
| Jadwal | Per tanggal; tambah, ubah, hapus, **jadwal massal**, generate otomatis; menolak jadwal yang bentrok di studio yang sama |
| Film | Tambah/ubah/arsip/hapus, status Tayang/Segera/Arsip, URL poster |
| Bioskop | Bioskop + studio (ukuran kursi, tipe Premier, harga dasar, zona waktu WIB/WITA/WIT), nonaktifkan |
| Pengaturan | Buka/tutup penjualan, banner pengumuman, biaya layanan, batas waktu bayar, maks. kursi, info merchant QRIS |
| Log aktivitas | Jejak semua perubahan admin/sistem |

Keamanan: cookie sesi bertanda tangan (HttpOnly, SameSite=Strict, Secure di produksi, 12 jam), header anti-CSRF pada semua aksi tulis, batas percobaan login.

## Alur pembayaran QRIS
QRIS statis (tanpa nominal & tanpa webhook) → pelanggan membayar nominal **persis** (total + kode unik 1–99), menekan "Saya sudah bayar", lalu admin mencocokkan nominal di mutasi dan menekan **Konfirmasi**; e-tiket ber-QR muncul otomatis. Untuk verifikasi otomatis perlu QRIS dinamis dari payment gateway (Midtrans/Xendit).
Ganti QRIS dengan menimpa `public/img/qris.png`.

## Catatan teknis
- Waktu tayang disimpan UTC; bioskop memiliki zona waktu sendiri. Koneksi database dipaksa `TIME ZONE UTC` (`lib/db.js`).
- Rate limit & cache pengaturan bersifat per-instance (cukup untuk skala kecil di serverless).
- Film/bioskop contoh bersifat fiktif. File migrasi ditulis agar identik dengan keluaran Prisma; bila `npx prisma migrate status` melaporkan selisih, jalankan `npx prisma migrate dev` untuk menyelaraskan.
