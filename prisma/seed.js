// Jalankan: npm run db:seed  — mengisi data contoh (hanya jika tabel kosong) dan membuat jadwal 7 hari.
// Semua film/bioskop di bawah adalah CONTOH fiktif; ubah lewat panel admin (/admin).
require('dotenv').config({ quiet: true });
const { prisma } = require('../lib/db');
const { ensureShowtimes } = require('../lib/showtimes');

const MOVIES = [
  { slug: 'bayang-di-ujung-senja', title: 'Bayang di Ujung Senja', tagline: 'Ada yang menunggu saat matahari terbenam.',
    synopsis: 'Seorang guru muda ditugaskan ke sebuah desa terpencil di pesisir. Setiap senja, murid-muridnya menggambar sosok yang sama: seorang perempuan berdiri di tepi laut. Ketika gambar-gambar itu mulai menjadi kenyataan, sang guru harus membongkar rahasia desa sebelum gelap benar-benar turun.',
    genres: ['Horor', 'Misteri'], durationMin: 112, ageRating: '17+', score: 7.8, director: 'Raka Pradipta',
    cast: ['Nadira Salsabila', 'Bima Aryasatya', 'Laras Wening'], releaseDate: '2026-11-06', status: 'now', hue: 265 },
  { slug: 'samudra-terakhir', title: 'Samudra Terakhir', tagline: 'Di bawah laut, manusia bukan yang pertama.',
    synopsis: 'Tahun 2087, permukaan bumi nyaris tenggelam. Tim penyelam Kapten Arunika turun ke palung terdalam Nusantara untuk mencari sumber sinyal misterius—dan menemukan peradaban yang sudah lebih dulu menunggu.',
    genres: ['Fiksi Ilmiah', 'Petualangan'], durationMin: 134, ageRating: '13+', score: 8.4, director: 'Dimas Wicaksono',
    cast: ['Arunika Prameswari', 'Gilang Mahendra', 'Tio Pakusadewo Jr.'], releaseDate: '2026-10-30', status: 'now', hue: 200 },
  { slug: 'langkah-pulang', title: 'Langkah Pulang', tagline: 'Sejauh apa pun, rumah selalu tahu jalannya.',
    synopsis: 'Setelah sepuluh tahun merantau, Wulan pulang ke kampung halaman untuk pemakaman ayahnya. Di antara kenangan dan percakapan yang tertunda, ia belajar bahwa memaafkan adalah perjalanan paling panjang.',
    genres: ['Drama', 'Keluarga'], durationMin: 108, ageRating: '13+', score: 8.1, director: 'Sekar Anindya',
    cast: ['Wulan Prasetyo', 'Hendra Kusuma', 'Mbok Rini'], releaseDate: '2026-11-13', status: 'now', hue: 28 },
  { slug: 'kopi-hujan-dan-kamu', title: 'Kopi, Hujan & Kamu', tagline: 'Pertemuan terbaik selalu terjadi saat berteduh.',
    synopsis: 'Barista kedai kopi kecil di Bandung bertemu seorang penulis yang kehilangan kata-katanya. Selama musim hujan, secangkir kopi demi secangkir kopi, mereka menulis ulang kisah masing-masing.',
    genres: ['Romantis', 'Komedi'], durationMin: 99, ageRating: 'SU', score: 7.5, director: 'Nabila Ardiansyah',
    cast: ['Reza Alfarizi', 'Tasya Maharani', 'Oka Winarta'], releaseDate: '2026-11-13', status: 'now', hue: 340 },
  { slug: 'garuda-muda-misi-rahasia', title: 'Garuda Muda: Misi Rahasia', tagline: 'Pahlawan terbesar mulai dari yang terkecil.',
    synopsis: 'Empat sahabat remaja menemukan peta tua di gudang sekolah dan terseret ke dalam perburuan harta karun lintas pulau—dikejar sindikat bersenjata dan waktu yang terus berjalan.',
    genres: ['Aksi', 'Keluarga'], durationMin: 121, ageRating: '13+', score: 7.9, director: 'Fajar Nugraha',
    cast: ['Ilham Ramadhan', 'Putri Kirana', 'Joko Anwar Jr.', 'Citra Dewi'], releaseDate: '2026-11-20', status: 'now', hue: 12 },
  { slug: 'rimba-kala', title: 'Rimba Kala', tagline: 'Hutan menyimpan waktu. Dan ia ingin dikembalikan.',
    synopsis: 'Seekor bayi orangutan dan seorang gadis penjaga hutan menempuh perjalanan ke jantung rimba untuk menemukan Jam Pohon Purba sebelum waktu hutan habis. Film animasi penuh warna untuk seluruh keluarga.',
    genres: ['Animasi', 'Fantasi'], durationMin: 96, ageRating: 'SU', score: 8.0, director: 'Studio Kelana',
    cast: ['Suara: Anya Geraldine', 'Suara: Raditya Dika Jr.'], releaseDate: '2026-11-20', status: 'now', hue: 140 },
  { slug: 'lorong-nomor-tujuh', title: 'Lorong Nomor Tujuh', tagline: 'Jangan hitung pintunya.',
    synopsis: 'Sebuah apartemen tua memiliki lorong dengan tujuh pintu, padahal denah hanya mencatat enam. Penghuni baru menemukan bahwa pintu ketujuh selalu terbuka tepat pukul tiga pagi.',
    genres: ['Horor', 'Thriller'], durationMin: 104, ageRating: '17+', score: null, director: 'Raka Pradipta',
    cast: ['Dinda Hauw', 'Vino Bastian Jr.'], releaseDate: '2026-12-04', status: 'soon', hue: 300 },
  { slug: 'tanah-yang-bernyanyi', title: 'Tanah yang Bernyanyi', tagline: 'Setiap suku punya lagu. Satu lagu hampir hilang.',
    synopsis: 'Seorang etnomusikolog kembali ke Papua untuk merekam lagu adat terakhir yang masih dinyanyikan sang tetua. Perjalanan itu mempertemukannya dengan generasi muda yang bertekad menyelamatkannya.',
    genres: ['Drama', 'Musikal'], durationMin: 117, ageRating: 'SU', score: null, director: 'Yohanis Wenda',
    cast: ['Yance Kogoya', 'Maria Tabuni', 'Daniel Pigai'], releaseDate: '2026-12-11', status: 'soon', hue: 90 },
];

const CINEMAS = [
  { slug: 'timika-mimika', name: 'MARR Cinema Timika', city: 'Timika', address: 'Jl. Cenderawasih No. 12, Mimika Baru, Kab. Mimika, Papua Tengah', facilities: ['Dolby Atmos', 'Parkir luas', 'Food Court'], tz: 'Asia/Jayapura', price: 50000 },
  { slug: 'senayan', name: 'MARR Cinema Senayan', city: 'Jakarta', address: 'Jl. Asia Afrika No. 8, Senayan, Jakarta Pusat', facilities: ['Dolby Atmos', 'Premier Lounge', 'Valet'], price: 50000 },
  { slug: 'kelapa-gading', name: 'MARR Cinema Kelapa Gading', city: 'Jakarta', address: 'Jl. Boulevard Raya, Kelapa Gading, Jakarta Utara', facilities: ['Dolby Atmos', 'Food Court', 'Parkir luas'], price: 50000 },
  { slug: 'dago', name: 'MARR Cinema Dago', city: 'Bandung', address: 'Jl. Ir. H. Juanda No. 55, Dago, Bandung', facilities: ['Premier Lounge', 'Kafe', 'Parkir luas'], price: 45000 },
  { slug: 'tunjungan', name: 'MARR Cinema Tunjungan', city: 'Surabaya', address: 'Jl. Basuki Rahmat No. 21, Surabaya', facilities: ['Dolby Atmos', 'Food Court'], price: 45000 },
  { slug: 'panakkukang', name: 'MARR Cinema Panakkukang', city: 'Makassar', address: 'Jl. Boulevard, Panakkukang, Makassar', facilities: ['Premier Lounge', 'Parkir luas'], tz: 'Asia/Makassar', price: 45000 },
];

async function main() {
  if ((await prisma.movie.count()) === 0) {
    for (const m of MOVIES) await prisma.movie.create({ data: { ...m, releaseDate: new Date(m.releaseDate + 'T00:00:00Z') } });
    for (const { price, ...c } of CINEMAS) {
      await prisma.cinema.create({
        data: { ...c, tz: c.tz || 'Asia/Jakarta', studios: { create: [
          { name: 'Studio 1', kind: 'Regular', seatRows: 8, seatCols: 12, basePrice: price },
          { name: 'Studio 2', kind: 'Regular', seatRows: 7, seatCols: 10, basePrice: price },
          { name: 'Premier', kind: 'Premier', seatRows: 5, seatCols: 8, basePrice: price + 30000 },
        ] } },
      });
    }
    console.log('✓ Data contoh (film & bioskop) dimasukkan');
  } else console.log('• Data sudah ada, lewati seed');
  const n = await ensureShowtimes(7);
  console.log(`✓ ${n} jadwal tayang baru dibuat`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
