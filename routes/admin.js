const express = require('express');
const { prisma } = require('../lib/db');
const { httpErr, wrap, rateLimit, slugify, TZS, localToUtc, dowOf } = require('../lib/util');
const { checkPassword, setSession, clearSession, requireAdmin } = require('../lib/auth');
const { getSettings, updateSettings } = require('../lib/settings');
const { releaseExpired } = require('../lib/orders');
const { ensureShowtimes } = require('../lib/showtimes');
const { audit } = require('../lib/audit');

const r = express.Router();
const ACTIVE_ORDER = ['pending', 'awaiting_verification', 'paid'];
const BUFFER_MIN = 15; // jeda bersih-bersih antar pertunjukan

/* ---------------- auth ---------------- */
r.post('/login', rateLimit(8, 10 * 60_000, 'login'), wrap(async (req, res) => {
  const ok = checkPassword(String(req.body?.password ?? ''));
  if (!ok) { await new Promise((s) => setTimeout(s, 500)); await audit('login_failed', 'auth', null, { ip: req.ip }, 'unknown'); throw httpErr(401, 'Kata sandi salah'); }
  setSession(res);
  await audit('login', 'auth', null, { ip: req.ip });
  res.json({ ok: true });
}));
r.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });
r.use(requireAdmin);
r.get('/me', (_req, res) => res.json({ ok: true, name: 'Admin' }));

/* ---------------- helpers ---------------- */
const int = (v, name, lo, hi) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw httpErr(400, `${name} harus bilangan bulat ${lo}–${hi}`);
  return n;
};
const str = (v, name, max, required = true) => {
  const s = String(v ?? '').trim();
  if (required && !s) throw httpErr(400, `${name} wajib diisi`);
  if (s.length > max) throw httpErr(400, `${name} maksimal ${max} karakter`);
  return s;
};
const list = (v, max = 12) => (Array.isArray(v) ? v : String(v ?? '').split(','))
  .map((x) => String(x).trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, max).map((x) => x.slice(0, 60));
const id = (req) => int(req.params.id, 'ID', 1, 2_147_483_647);
const YMD = /^\d{4}-\d{2}-\d{2}$/, HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/* ---------------- dashboard ---------------- */
r.get('/counts', wrap(async (_req, res) => {
  await releaseExpired();
  const [awaiting, pending] = await Promise.all([prisma.order.count({ where: { status: 'awaiting_verification' } }), prisma.order.count({ where: { status: 'pending' } })]);
  res.json({ awaiting, pending });
}));

r.get('/stats', wrap(async (req, res) => {
  const days = int(req.query.days ?? 14, 'days', 7, 60);
  await releaseExpired();
  const [kpi] = await prisma.$queryRaw`
    WITH b AS (SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta')) AT TIME ZONE 'Asia/Jakarta' AS today)
    SELECT
      COALESCE(SUM(o.total)  FILTER (WHERE o.status='paid' AND o.paid_at >= b.today), 0)::int AS "revToday",
      COALESCE(SUM(o.total)  FILTER (WHERE o.status='paid' AND o.paid_at >= b.today - interval '6 days'), 0)::int AS "rev7",
      COALESCE(SUM(o.total)  FILTER (WHERE o.status='paid' AND o.paid_at >= b.today - interval '29 days'), 0)::int AS "rev30",
      COALESCE(SUM(array_length(o.seats,1)) FILTER (WHERE o.status='paid' AND o.paid_at >= b.today), 0)::int AS "ticketsToday",
      COALESCE(SUM(array_length(o.seats,1)) FILTER (WHERE o.status='paid' AND o.paid_at >= b.today - interval '29 days'), 0)::int AS "tickets30",
      COUNT(*) FILTER (WHERE o.status='awaiting_verification')::int AS "awaiting",
      COUNT(*) FILTER (WHERE o.status='pending')::int AS "pending",
      COUNT(*) FILTER (WHERE o.status='paid')::int AS "paidTotal",
      COALESCE(SUM(o.total) FILTER (WHERE o.status='paid'), 0)::int AS "revAll"
    FROM orders o, b`;
  const series = await prisma.$queryRaw`
    SELECT d::date::text AS day, COALESCE(SUM(o.total),0)::int AS revenue, COALESCE(SUM(array_length(o.seats,1)),0)::int AS tickets, COUNT(o.id)::int AS orders
    FROM generate_series((now() AT TIME ZONE 'Asia/Jakarta')::date - (${days}::int - 1), (now() AT TIME ZONE 'Asia/Jakarta')::date, interval '1 day') d
    LEFT JOIN orders o ON o.status='paid' AND (o.paid_at AT TIME ZONE 'Asia/Jakarta')::date = d::date
    GROUP BY d ORDER BY d`;
  const topMovies = await prisma.$queryRaw`
    SELECT m.id, m.title, m.hue, SUM(array_length(o.seats,1))::int AS tickets, SUM(o.total)::int AS revenue
    FROM orders o JOIN showtimes st ON st.id=o.showtime_id JOIN movies m ON m.id=st.movie_id
    WHERE o.status='paid' AND o.paid_at >= now() - interval '30 days'
    GROUP BY m.id ORDER BY tickets DESC, revenue DESC LIMIT 6`;
  const byStatus = await prisma.$queryRaw`
    SELECT status, COUNT(*)::int AS n FROM orders WHERE created_at >= now() - interval '30 days' GROUP BY status`;
  const occupancy = await prisma.$queryRaw`
    SELECT st.id, st.starts_at AS "startsAt", m.title, c.name AS cinema, c.tz, s.name AS studio, s.kind,
           (s.seat_rows*s.seat_cols)::int AS capacity,
           (SELECT count(*)::int FROM order_seats os WHERE os.showtime_id=st.id) AS taken
    FROM showtimes st JOIN movies m ON m.id=st.movie_id JOIN studios s ON s.id=st.studio_id JOIN cinemas c ON c.id=s.cinema_id
    WHERE st.starts_at > now() AND st.starts_at < now() + interval '36 hours'
    ORDER BY (SELECT count(*) FROM order_seats os WHERE os.showtime_id=st.id)::float / (s.seat_rows*s.seat_cols) DESC, st.starts_at LIMIT 8`;
  const [recentOrders, activity, s] = await Promise.all([
    prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8, select: { code: true, customerName: true, total: true, status: true, seats: true, createdAt: true, showtime: { select: { movie: { select: { title: true } } } } } }),
    prisma.auditLog.findMany({ orderBy: { id: 'desc' }, take: 8 }),
    getSettings(),
  ]);
  res.json({ kpi, series, topMovies, byStatus, occupancy, bookingOpen: s.bookingOpen,
    recentOrders: recentOrders.map((o) => ({ code: o.code, name: o.customerName, total: o.total, status: o.status, seats: o.seats, createdAt: o.createdAt, movie: o.showtime.movie.title })),
    activity });
}));

/* ---------------- pesanan ---------------- */
const orderRow = (o) => ({
  code: o.code, status: o.status, name: o.customerName, email: o.email, phone: o.phone, seats: o.seats,
  subtotal: o.subtotal, serviceFee: o.serviceFee, uniqueCode: o.uniqueCode, total: o.total, note: o.note, hasProof: !!o.proof,
  createdAt: o.createdAt, paidAt: o.paidAt, expiresAt: o.expiresAt,
  movie: o.showtime.movie.title, cinema: o.showtime.studio.cinema.name, tz: o.showtime.studio.cinema.tz, studio: o.showtime.studio.name, startsAt: o.showtime.startsAt,
});
const ORDER_INC = { showtime: { include: { movie: { select: { title: true } }, studio: { include: { cinema: { select: { name: true, tz: true } } } } } } };
const STATUSES = ['pending', 'awaiting_verification', 'paid', 'expired', 'cancelled', 'rejected'];

r.get('/orders', wrap(async (req, res) => {
  await releaseExpired();
  const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const q = String(req.query.q || '').trim().slice(0, 60);
  const page = Math.max(1, Number(req.query.page) || 1), size = 25;
  const where = {
    ...(status ? { status } : {}),
    ...(q ? { OR: ['code', 'customerName', 'email', 'phone'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } })) } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * size, take: size, include: ORDER_INC }),
  ]);
  res.json({ total, page, pages: Math.max(1, Math.ceil(total / size)), rows: rows.map(orderRow) });
}));

r.get('/orders/:code/proof', wrap(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { code: req.params.code.toUpperCase() }, select: { proof: true } });
  if (!o?.proof) throw httpErr(404, 'Tidak ada bukti');
  const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(o.proof);
  res.set('Content-Type', m[1]).set('Cache-Control', 'private, max-age=60').send(Buffer.from(m[2], 'base64'));
}));

r.patch('/orders/:code', wrap(async (req, res) => {
  const code = req.params.code.toUpperCase();
  const note = str(req.body?.note, 'Catatan', 300, false) || null;
  const u = await prisma.order.updateMany({ where: { code }, data: { note } });
  if (!u.count) throw httpErr(404, 'Pesanan tidak ditemukan');
  await audit('order_note', 'order', code, { note });
  res.json({ ok: true });
}));

r.post('/orders/:code/:action', wrap(async (req, res) => {
  const { action } = req.params;
  if (!['confirm', 'reject', 'cancel'].includes(action)) throw httpErr(404, 'Aksi tidak dikenal');
  const code = req.params.code.toUpperCase();
  const reason = str(req.body?.reason, 'Alasan', 300, false);
  const out = await prisma.$transaction(async (tx) => {
    const o = await tx.order.findUnique({ where: { code } });
    if (!o) throw httpErr(404, 'Pesanan tidak ditemukan');
    const open = ['pending', 'awaiting_verification'].includes(o.status);
    const from = o.status;
    if (action === 'confirm') {
      if (open) {
        const u = await tx.order.updateMany({ where: { id: o.id, status: { in: ['pending', 'awaiting_verification'] } }, data: { status: 'paid', paidAt: new Date() } });
        if (!u.count) throw httpErr(409, 'Status pesanan baru saja berubah, muat ulang.');
      } else if (from === 'expired') { // pelanggan membayar setelah waktu habis → pulihkan kursi bila masih kosong
        try { await tx.orderSeat.createMany({ data: o.seats.map((seat) => ({ showtimeId: o.showtimeId, seat, orderId: o.id })) }); }
        catch (e) { if (e.code === 'P2002') throw httpErr(409, 'Kursi sudah diambil pesanan lain, pesanan kedaluwarsa tidak dapat dipulihkan.'); throw e; }
        await tx.order.update({ where: { id: o.id }, data: { status: 'paid', paidAt: new Date() } });
      } else throw httpErr(409, 'Status pesanan tidak memungkinkan aksi ini.');
    } else if (action === 'reject') {
      if (!open) throw httpErr(409, 'Hanya pesanan yang menunggu yang bisa ditolak.');
      await tx.order.update({ where: { id: o.id }, data: { status: 'rejected', ...(reason ? { note: reason } : {}) } });
      await tx.orderSeat.deleteMany({ where: { orderId: o.id } });
    } else {
      if (from !== 'paid') throw httpErr(409, 'Hanya pesanan lunas yang bisa dibatalkan (refund dilakukan manual).');
      await tx.order.update({ where: { id: o.id }, data: { status: 'cancelled', ...(reason ? { note: reason } : {}) } });
      await tx.orderSeat.deleteMany({ where: { orderId: o.id } });
    }
    return { code, from, total: o.total };
  });
  await audit('order_' + action, 'order', code, { from: out.from, total: out.total, reason: reason || undefined });
  res.json({ ok: true });
}));

/* ---------------- film ---------------- */
const MOVIE_STATUS = ['now', 'soon', 'archived'];
function parseMovie(b) {
  const d = {
    title: str(b.title, 'Judul', 120),
    tagline: str(b.tagline, 'Tagline', 160, false) || null,
    synopsis: str(b.synopsis, 'Sinopsis', 2000),
    genres: list(b.genres, 6),
    durationMin: int(b.durationMin, 'Durasi', 1, 600),
    ageRating: str(b.ageRating || 'SU', 'Rating usia', 8),
    director: str(b.director, 'Sutradara', 80, false) || null,
    cast: list(b.cast, 10),
    language: str(b.language, 'Bahasa', 40, false) || null,
    subtitle: str(b.subtitle, 'Subtitle', 40, false) || null,
    status: MOVIE_STATUS.includes(b.status) ? b.status : 'now',
    hue: int(b.hue ?? 10, 'Hue', 0, 359),
  };
  if (!d.genres.length) throw httpErr(400, 'Isi minimal satu genre');
  const score = b.score === '' || b.score == null ? null : Number(b.score);
  if (score !== null && !(score >= 0 && score <= 9.9)) throw httpErr(400, 'Skor harus 0–9.9');
  d.score = score;
  const p = String(b.posterUrl || '').trim();
  if (p && !/^(https?:\/\/|\/)[^\s]+$/.test(p)) throw httpErr(400, 'URL poster harus diawali http(s):// atau /');
  d.posterUrl = p || null;
  if (b.releaseDate) { if (!YMD.test(b.releaseDate)) throw httpErr(400, 'Format tanggal rilis YYYY-MM-DD'); d.releaseDate = new Date(b.releaseDate + 'T00:00:00Z'); } else d.releaseDate = null;
  return d;
}
const movieAdmin = (m) => ({ id: m.id, slug: m.slug, title: m.title, tagline: m.tagline, synopsis: m.synopsis, genres: m.genres, durationMin: m.durationMin, ageRating: m.ageRating, score: m.score == null ? null : Number(m.score), director: m.director, cast: m.cast, language: m.language, subtitle: m.subtitle, releaseDate: m.releaseDate ? m.releaseDate.toISOString().slice(0, 10) : null, status: m.status, posterUrl: m.posterUrl, hue: m.hue, showtimes: m._count?.showtimes ?? 0 });

async function uniqueSlug(model, base, excludeId) {
  let slug = slugify(base) || 'item', n = 1;
  while (await prisma[model].findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } })) slug = `${slugify(base)}-${++n}`;
  return slug;
}

r.get('/movies', wrap(async (_req, res) => {
  const rows = await prisma.movie.findMany({ orderBy: [{ status: 'asc' }, { releaseDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], include: { _count: { select: { showtimes: true } } } });
  res.json(rows.map(movieAdmin));
}));
r.post('/movies', wrap(async (req, res) => {
  const d = parseMovie(req.body || {});
  const m = await prisma.movie.create({ data: { ...d, slug: await uniqueSlug('movie', req.body.slug || d.title) } });
  await audit('movie_create', 'movie', m.id, { title: m.title, status: m.status });
  res.status(201).json(movieAdmin(m));
}));
r.put('/movies/:id', wrap(async (req, res) => {
  const mid = id(req);
  const old = await prisma.movie.findUnique({ where: { id: mid } });
  if (!old) throw httpErr(404, 'Film tidak ditemukan');
  const d = parseMovie(req.body || {});
  const m = await prisma.movie.update({ where: { id: mid }, data: d });
  await audit('movie_update', 'movie', mid, { title: m.title, ...(old.status !== m.status ? { status: `${old.status}→${m.status}` } : {}) });
  res.json(movieAdmin(m));
}));
r.delete('/movies/:id', wrap(async (req, res) => {
  const mid = id(req);
  const m = await prisma.movie.findUnique({ where: { id: mid } });
  if (!m) throw httpErr(404, 'Film tidak ditemukan');
  if (await prisma.order.count({ where: { showtime: { movieId: mid } } })) throw httpErr(409, 'Film ini sudah punya riwayat pesanan, tidak bisa dihapus. Ubah statusnya menjadi "Arsip".');
  await prisma.movie.delete({ where: { id: mid } });
  await audit('movie_delete', 'movie', mid, { title: m.title });
  res.json({ ok: true });
}));

/* ---------------- bioskop & studio ---------------- */
const cinemaAdmin = (c) => ({ id: c.id, slug: c.slug, name: c.name, city: c.city, address: c.address, facilities: c.facilities, tz: c.tz, active: c.active,
  studios: (c.studios || []).sort((a, b) => a.id - b.id).map((s) => ({ id: s.id, name: s.name, kind: s.kind, seatRows: s.seatRows, seatCols: s.seatCols, basePrice: s.basePrice, showtimes: s._count?.showtimes ?? 0 })) });
function parseCinema(b) {
  const tz = TZS.includes(b.tz) ? b.tz : 'Asia/Jakarta';
  return { name: str(b.name, 'Nama bioskop', 80), city: str(b.city, 'Kota', 40), address: str(b.address, 'Alamat', 200), facilities: list(b.facilities, 8), tz, active: b.active !== false };
}
const CIN_INC = { studios: { include: { _count: { select: { showtimes: true } } } } };

r.get('/cinemas', wrap(async (_req, res) => {
  const rows = await prisma.cinema.findMany({ orderBy: [{ city: 'asc' }, { name: 'asc' }], include: CIN_INC });
  res.json(rows.map(cinemaAdmin));
}));
r.post('/cinemas', wrap(async (req, res) => {
  const d = parseCinema(req.body || {});
  const base = req.body?.basePrice === undefined ? 45000 : int(req.body.basePrice, 'Harga dasar', 0, 5_000_000);
  const c = await prisma.cinema.create({ data: { ...d, slug: await uniqueSlug('cinema', d.name), studios: { create: [{ name: 'Studio 1', kind: 'Regular', seatRows: 8, seatCols: 12, basePrice: base }] } }, include: CIN_INC });
  await audit('cinema_create', 'cinema', c.id, { name: c.name, city: c.city });
  res.status(201).json(cinemaAdmin(c));
}));
r.put('/cinemas/:id', wrap(async (req, res) => {
  const cid = id(req);
  if (!(await prisma.cinema.findUnique({ where: { id: cid }, select: { id: true } }))) throw httpErr(404, 'Bioskop tidak ditemukan');
  const c = await prisma.cinema.update({ where: { id: cid }, data: parseCinema(req.body || {}), include: CIN_INC });
  await audit('cinema_update', 'cinema', cid, { name: c.name, active: c.active });
  res.json(cinemaAdmin(c));
}));
r.delete('/cinemas/:id', wrap(async (req, res) => {
  const cid = id(req);
  const c = await prisma.cinema.findUnique({ where: { id: cid } });
  if (!c) throw httpErr(404, 'Bioskop tidak ditemukan');
  if (await prisma.order.count({ where: { showtime: { studio: { cinemaId: cid } } } })) throw httpErr(409, 'Bioskop ini punya riwayat pesanan. Nonaktifkan saja agar tidak tampil di website.');
  await prisma.cinema.delete({ where: { id: cid } });
  await audit('cinema_delete', 'cinema', cid, { name: c.name });
  res.json({ ok: true });
}));

function parseStudio(b) {
  return { name: str(b.name, 'Nama studio', 40), kind: b.kind === 'Premier' ? 'Premier' : 'Regular', seatRows: int(b.seatRows, 'Jumlah baris', 1, 26), seatCols: int(b.seatCols, 'Kursi per baris', 1, 30), basePrice: int(b.basePrice, 'Harga dasar', 0, 5_000_000) };
}
r.post('/cinemas/:id/studios', wrap(async (req, res) => {
  const cid = id(req);
  if (!(await prisma.cinema.findUnique({ where: { id: cid }, select: { id: true } }))) throw httpErr(404, 'Bioskop tidak ditemukan');
  const s = await prisma.studio.create({ data: { ...parseStudio(req.body || {}), cinemaId: cid } }).catch((e) => { if (e.code === 'P2002') throw httpErr(409, 'Nama studio sudah dipakai di bioskop ini'); throw e; });
  await audit('studio_create', 'studio', s.id, { name: s.name, cinemaId: cid });
  res.status(201).json(s);
}));
r.put('/studios/:id', wrap(async (req, res) => {
  const sid = id(req);
  const old = await prisma.studio.findUnique({ where: { id: sid } });
  if (!old) throw httpErr(404, 'Studio tidak ditemukan');
  const d = parseStudio(req.body || {});
  if ((d.seatRows !== old.seatRows || d.seatCols !== old.seatCols) && await prisma.order.count({ where: { status: { in: ACTIVE_ORDER }, showtime: { studioId: sid } } }))
    throw httpErr(409, 'Ukuran studio tidak bisa diubah karena masih ada pesanan aktif/lunas pada jadwalnya.');
  const s = await prisma.studio.update({ where: { id: sid }, data: d }).catch((e) => { if (e.code === 'P2002') throw httpErr(409, 'Nama studio sudah dipakai di bioskop ini'); throw e; });
  await audit('studio_update', 'studio', sid, { name: s.name });
  res.json(s);
}));
r.delete('/studios/:id', wrap(async (req, res) => {
  const sid = id(req);
  const s = await prisma.studio.findUnique({ where: { id: sid } });
  if (!s) throw httpErr(404, 'Studio tidak ditemukan');
  if (await prisma.order.count({ where: { showtime: { studioId: sid } } })) throw httpErr(409, 'Studio ini punya riwayat pesanan, tidak bisa dihapus.');
  await prisma.studio.delete({ where: { id: sid } });
  await audit('studio_delete', 'studio', sid, { name: s.name });
  res.json({ ok: true });
}));

/* ---------------- jadwal tayang ---------------- */
r.get('/showtimes', wrap(async (req, res) => {
  const date = YMD.test(req.query.date || '') ? req.query.date : null;
  if (!date) throw httpErr(400, 'Parameter date wajib');
  const movieId = req.query.movieId ? int(req.query.movieId, 'movieId', 1, 2_147_483_647) : null;
  const cinemaId = req.query.cinemaId ? int(req.query.cinemaId, 'cinemaId', 1, 2_147_483_647) : null;
  const rows = await prisma.$queryRaw`
    SELECT st.id, st.starts_at AS "startsAt", st.price, m.id AS "movieId", m.title, m.duration_min AS "durationMin", s.id AS "studioId", s.name AS studio, s.kind,
           (s.seat_rows*s.seat_cols)::int AS capacity, c.id AS "cinemaId", c.name AS cinema, c.tz,
           (SELECT count(*)::int FROM order_seats os WHERE os.showtime_id=st.id) AS taken,
           (SELECT count(*)::int FROM orders o WHERE o.showtime_id=st.id AND o.status='paid') AS "paidOrders",
           (SELECT count(*)::int FROM orders o WHERE o.showtime_id=st.id AND o.status IN ('pending','awaiting_verification','paid')) AS "activeOrders"
    FROM showtimes st JOIN movies m ON m.id=st.movie_id JOIN studios s ON s.id=st.studio_id JOIN cinemas c ON c.id=s.cinema_id
    WHERE (st.starts_at AT TIME ZONE c.tz)::date = ${date}::date
      AND (${movieId}::int IS NULL OR m.id=${movieId}) AND (${cinemaId}::int IS NULL OR c.id=${cinemaId})
    ORDER BY c.name, s.name, st.starts_at`;
  res.json(rows);
}));

// Cek bentrok jam di studio yang sama (durasi film + jeda)
async function findClash(studioId, start, durationMin, excludeId) {
  const end = new Date(start.getTime() + (durationMin + BUFFER_MIN) * 60_000);
  const near = await prisma.showtime.findMany({
    where: { studioId, ...(excludeId ? { id: { not: excludeId } } : {}), startsAt: { gte: new Date(start.getTime() - 8 * 3600_000), lte: end } },
    include: { movie: { select: { title: true, durationMin: true } } },
  });
  return near.find((x) => x.startsAt < end && new Date(x.startsAt.getTime() + (x.movie.durationMin + BUFFER_MIN) * 60_000) > start) || null;
}
const fmtLocal = (d, tz) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(d);

r.post('/showtimes', wrap(async (req, res) => {
  const b = req.body || {};
  const movie = await prisma.movie.findUnique({ where: { id: int(b.movieId, 'Film', 1, 2_147_483_647) } });
  const studio = await prisma.studio.findUnique({ where: { id: int(b.studioId, 'Studio', 1, 2_147_483_647) }, include: { cinema: true } });
  if (!movie || !studio) throw httpErr(404, 'Film atau studio tidak ditemukan');
  if (!YMD.test(b.date || '') || !HM.test(b.time || '')) throw httpErr(400, 'Tanggal (YYYY-MM-DD) dan jam (HH:MM) wajib');
  const price = int(b.price ?? studio.basePrice, 'Harga', 0, 5_000_000);
  const startsAt = localToUtc(b.date, b.time, studio.cinema.tz);
  const clash = await findClash(studio.id, startsAt, movie.durationMin);
  if (clash) throw httpErr(409, `Bentrok dengan "${clash.movie.title}" (${fmtLocal(clash.startsAt, studio.cinema.tz)}) di studio yang sama.`);
  const st = await prisma.showtime.create({ data: { movieId: movie.id, studioId: studio.id, startsAt, price } });
  await audit('showtime_create', 'showtime', st.id, { movie: movie.title, cinema: studio.cinema.name, studio: studio.name, at: `${b.date} ${b.time}`, price });
  res.status(201).json(st);
}));

r.post('/showtimes/bulk', wrap(async (req, res) => {
  const b = req.body || {};
  const movie = await prisma.movie.findUnique({ where: { id: int(b.movieId, 'Film', 1, 2_147_483_647) } });
  if (!movie) throw httpErr(404, 'Film tidak ditemukan');
  const studioIds = [...new Set((b.studioIds || []).map(Number))].filter(Number.isInteger);
  const dates = [...new Set(b.dates || [])].filter((d) => YMD.test(d));
  const times = [...new Set(b.times || [])].filter((t) => HM.test(t));
  if (!studioIds.length || !dates.length || !times.length) throw httpErr(400, 'Pilih minimal satu studio, tanggal, dan jam');
  if (studioIds.length * dates.length * times.length > 1500) throw httpErr(400, 'Terlalu banyak jadwal sekaligus (maks. 1500).');
  const customPrice = b.price === '' || b.price == null ? null : int(b.price, 'Harga', 0, 5_000_000);
  const studios = await prisma.studio.findMany({ where: { id: { in: studioIds } }, include: { cinema: true } });
  const { weekendSurcharge } = await getSettings();
  const dur = (movie.durationMin + BUFFER_MIN) * 60_000;
  const rows = [], conflicts = [];
  for (const st of studios) {
    const sorted = dates.slice().sort();
    const from = localToUtc(sorted[0], '00:00', st.cinema.tz), to = localToUtc(sorted[sorted.length - 1], '23:59', st.cinema.tz);
    const existing = await prisma.showtime.findMany({ where: { studioId: st.id, startsAt: { gte: new Date(from.getTime() - 8 * 3600_000), lte: new Date(to.getTime() + 8 * 3600_000) } }, include: { movie: { select: { durationMin: true } } } });
    const busy = existing.map((x) => [x.startsAt.getTime(), x.startsAt.getTime() + (x.movie.durationMin + BUFFER_MIN) * 60_000]);
    for (const date of dates) for (const time of times) {
      const s = localToUtc(date, time, st.cinema.tz).getTime(), e = s + dur;
      if (busy.some(([bs, be]) => s < be && e > bs)) { conflicts.push(`${st.cinema.name} · ${st.name} · ${date} ${time}`); continue; }
      busy.push([s, e]);
      const price = customPrice ?? st.basePrice + ([0, 6].includes(dowOf(date)) ? weekendSurcharge : 0);
      rows.push({ movieId: movie.id, studioId: st.id, startsAt: new Date(s), price });
    }
  }
  const out = rows.length ? await prisma.showtime.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
  await audit('showtime_bulk', 'showtime', null, { movie: movie.title, created: out.count, skipped: conflicts.length });
  res.json({ created: out.count, skipped: conflicts.length, conflicts: conflicts.slice(0, 10) });
}));

r.post('/showtimes/generate', wrap(async (req, res) => {
  const days = int(req.body?.days ?? 7, 'Hari', 1, 30);
  const n = await ensureShowtimes(days);
  await audit('showtime_generate', 'showtime', null, { days, created: n });
  res.json({ created: n });
}));

r.put('/showtimes/:id', wrap(async (req, res) => {
  const sid = id(req), b = req.body || {};
  const old = await prisma.showtime.findUnique({ where: { id: sid }, include: { movie: true, studio: { include: { cinema: true } } } });
  if (!old) throw httpErr(404, 'Jadwal tidak ditemukan');
  const active = await prisma.order.count({ where: { showtimeId: sid, status: { in: ACTIVE_ORDER } } });
  const data = { price: int(b.price ?? old.price, 'Harga', 0, 5_000_000) };
  const structural = b.movieId != null || b.studioId != null || b.date || b.time;
  if (structural) {
    if (active) throw httpErr(409, 'Jadwal ini sudah punya pesanan aktif/lunas — hanya harga yang boleh diubah.');
    const movie = b.movieId != null ? await prisma.movie.findUnique({ where: { id: int(b.movieId, 'Film', 1, 2_147_483_647) } }) : old.movie;
    const studio = b.studioId != null ? await prisma.studio.findUnique({ where: { id: int(b.studioId, 'Studio', 1, 2_147_483_647) }, include: { cinema: true } }) : old.studio;
    if (!movie || !studio) throw httpErr(404, 'Film atau studio tidak ditemukan');
    let startsAt = old.startsAt;
    if (b.date || b.time) {
      const cur = new Intl.DateTimeFormat('sv-SE', { timeZone: studio.cinema.tz, dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(old.startsAt).split(' ');
      const date = b.date || cur[0], time = b.time || cur[1];
      if (!YMD.test(date) || !HM.test(time)) throw httpErr(400, 'Format tanggal/jam tidak valid');
      startsAt = localToUtc(date, time, studio.cinema.tz);
    }
    const clash = await findClash(studio.id, startsAt, movie.durationMin, sid);
    if (clash) throw httpErr(409, `Bentrok dengan "${clash.movie.title}" (${fmtLocal(clash.startsAt, studio.cinema.tz)}) di studio yang sama.`);
    Object.assign(data, { movieId: movie.id, studioId: studio.id, startsAt });
  }
  const st = await prisma.showtime.update({ where: { id: sid }, data }).catch((e) => { if (e.code === 'P2002') throw httpErr(409, 'Sudah ada jadwal di studio dan jam yang sama.'); throw e; });
  await audit('showtime_update', 'showtime', sid, { movie: old.movie.title, price: `${old.price}→${st.price}`, ...(structural ? { moved: true } : {}) });
  res.json(st);
}));

r.delete('/showtimes/:id', wrap(async (req, res) => {
  const sid = id(req);
  const st = await prisma.showtime.findUnique({ where: { id: sid }, include: { movie: true, studio: { include: { cinema: true } } } });
  if (!st) throw httpErr(404, 'Jadwal tidak ditemukan');
  if (await prisma.order.count({ where: { showtimeId: sid, status: { in: ACTIVE_ORDER } } })) throw httpErr(409, 'Jadwal ini punya pesanan aktif/lunas. Batalkan/tolak pesanannya dulu.');
  await prisma.$transaction([prisma.order.deleteMany({ where: { showtimeId: sid } }), prisma.showtime.delete({ where: { id: sid } })]);
  await audit('showtime_delete', 'showtime', sid, { movie: st.movie.title, cinema: st.studio.cinema.name });
  res.json({ ok: true });
}));

/* ---------------- pengaturan & log ---------------- */
r.get('/settings', wrap(async (_req, res) => res.json(await getSettings(true))));
r.put('/settings', wrap(async (req, res) => {
  const { settings, changed } = await updateSettings(req.body);
  if (Object.keys(changed).length) await audit('settings_update', 'settings', null, changed);
  res.json(settings);
}));

r.get('/logs', wrap(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
  const before = Number(req.query.before) || undefined;
  const rows = await prisma.auditLog.findMany({ where: before ? { id: { lt: before } } : {}, orderBy: { id: 'desc' }, take: limit + 1 });
  res.json({ rows: rows.slice(0, limit), more: rows.length > limit });
}));

module.exports = r;
