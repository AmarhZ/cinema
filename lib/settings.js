const { prisma } = require('./db');

// Nilai bawaan (bisa diubah dari panel admin → tabel settings)
const DEFAULTS = {
  serviceFee: 2500,          // Rp per tiket
  weekendSurcharge: 10000,   // tambahan harga Sabtu/Minggu saat jadwal dibuat otomatis
  maxSeats: 6,
  payWindowMin: Number(process.env.PAY_WINDOW_MIN) || 15,
  verifyWindowHours: 3,
  merchantName: process.env.QRIS_MERCHANT || 'MARR',
  merchantNmid: process.env.QRIS_NMID || 'ID1026641195783',
  bookingOpen: true,         // saklar penjualan tiket
  announcement: '',          // banner pengumuman di website
};
const TYPES = { serviceFee: 'int', weekendSurcharge: 'int', maxSeats: 'int', payWindowMin: 'int', verifyWindowHours: 'int', merchantName: 'str', merchantNmid: 'str', bookingOpen: 'bool', announcement: 'str' };
const RANGE = { serviceFee: [0, 100000], weekendSurcharge: [0, 500000], maxSeats: [1, 10], payWindowMin: [3, 120], verifyWindowHours: [1, 72] };
const LABEL = { serviceFee: 'Biaya layanan', weekendSurcharge: 'Tambahan akhir pekan', maxSeats: 'Maks. kursi', payWindowMin: 'Batas bayar (menit)', verifyWindowHours: 'Batas verifikasi (jam)' };

let cache = null, cacheAt = 0;
function parse(key, raw) {
  const t = TYPES[key];
  if (t === 'int') return Number(raw);
  if (t === 'bool') return raw === 'true';
  return String(raw);
}

async function getSettings(force = false) {
  if (!force && cache && Date.now() - cacheAt < 10_000) return cache;
  const rows = await prisma.setting.findMany();
  const out = { ...DEFAULTS };
  for (const r of rows) if (r.key in TYPES) out[r.key] = parse(r.key, r.value);
  cache = out; cacheAt = Date.now();
  return out;
}

// Validasi + simpan; mengembalikan {settings, changed}
async function updateSettings(patch) {
  const changed = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in TYPES)) continue;
    let val = v;
    if (TYPES[k] === 'int') {
      val = Number(v);
      const [lo, hi] = RANGE[k];
      if (!Number.isInteger(val) || val < lo || val > hi) { const e = new Error(`${LABEL[k]} harus bilangan bulat ${lo}–${hi}`); e.status = 400; throw e; }
    } else if (TYPES[k] === 'bool') val = v === true || v === 'true';
    else {
      val = String(v ?? '').trim().slice(0, k === 'announcement' ? 300 : 80);
      if ((k === 'merchantName' || k === 'merchantNmid') && !val) { const e = new Error('Nama merchant dan NMID wajib diisi'); e.status = 400; throw e; }
    }
    changed[k] = val;
  }
  await prisma.$transaction(Object.entries(changed).map(([key, val]) =>
    prisma.setting.upsert({ where: { key }, create: { key, value: String(val) }, update: { value: String(val) } })));
  return { settings: await getSettings(true), changed };
}

module.exports = { getSettings, updateSettings, DEFAULTS };
