const crypto = require('crypto');
const express = require('express');
const { prisma, Prisma } = require('../lib/db');
const { httpErr, wrap, rateLimit, newCode, validSeat } = require('../lib/util');
const { getSettings } = require('../lib/settings');
const { releaseExpired, orderInclude, orderView } = require('../lib/orders');

const r = express.Router();
const ymd = (d) => (d ? d.toISOString().slice(0, 10) : null);

const movieList = (m) => ({ id: m.id, slug: m.slug, title: m.title, tagline: m.tagline, genres: m.genres, duration_min: m.durationMin, age_rating: m.ageRating, score: m.score == null ? null : String(m.score), release_date: ymd(m.releaseDate), status: m.status, poster_url: m.posterUrl, hue: m.hue });
const movieFull = (m) => ({ ...movieList(m), synopsis: m.synopsis, director: m.director, cast_list: m.cast, language: m.language, subtitle: m.subtitle });

r.get('/config', wrap(async (_req, res) => {
  const s = await getSettings();
  res.json({ merchant: { name: s.merchantName, nmid: s.merchantNmid }, serviceFee: s.serviceFee, maxSeats: s.maxSeats, payWindowMin: s.payWindowMin, bookingOpen: s.bookingOpen, announcement: s.announcement });
}));

r.get('/movies', wrap(async (req, res) => {
  const status = req.query.status === 'soon' ? 'soon' : req.query.status === 'all' ? null : 'now';
  const rows = await prisma.movie.findMany({
    where: status ? { status } : { status: { not: 'archived' } },
    orderBy: [{ releaseDate: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
  });
  res.json(rows.map(movieList));
}));

r.get('/movies/:slug', wrap(async (req, res) => {
  const m = await prisma.movie.findFirst({ where: { slug: req.params.slug, status: { not: 'archived' } } });
  if (!m) throw httpErr(404, 'Film tidak ditemukan');
  res.json(movieFull(m));
}));

r.get('/cities', wrap(async (_req, res) => {
  const g = await prisma.cinema.groupBy({ by: ['city'], where: { active: true }, _count: { _all: true }, orderBy: { city: 'asc' } });
  res.json(g.map((x) => ({ city: x.city, cinemas: x._count._all })));
}));

r.get('/cinemas', wrap(async (req, res) => {
  const rows = await prisma.cinema.findMany({ where: { active: true, ...(req.query.city ? { city: String(req.query.city) } : {}) }, include: { studios: true }, orderBy: [{ city: 'asc' }, { name: 'asc' }] });
  res.json(rows.map((c) => ({ id: c.id, slug: c.slug, name: c.name, city: c.city, address: c.address, facilities: c.facilities, tz: c.tz,
    kinds: [...new Set(c.studios.map((s) => s.kind))].sort(), from_price: c.studios.length ? Math.min(...c.studios.map((s) => s.basePrice)) : 0 })));
}));

r.get('/movies/:slug/dates', wrap(async (req, res) => {
  const rows = await prisma.$queryRaw`SELECT DISTINCT (st.starts_at AT TIME ZONE c.tz)::date::text AS date
    FROM showtimes st JOIN movies m ON m.id=st.movie_id JOIN studios s ON s.id=st.studio_id JOIN cinemas c ON c.id=s.cinema_id
    WHERE m.slug=${req.params.slug} AND c.active AND st.starts_at > now() ORDER BY 1`;
  res.json(rows.map((x) => x.date));
}));

r.get('/movies/:slug/showtimes', wrap(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : null;
  if (!date) throw httpErr(400, 'Parameter date (YYYY-MM-DD) wajib');
  await releaseExpired();
  const city = req.query.city ? String(req.query.city) : null;
  const rows = await prisma.$queryRaw`
    SELECT st.id, st.starts_at AS "startsAt", st.price, s.name AS studio, s.kind, (s.seat_rows*s.seat_cols)::int AS capacity,
           c.id AS cinema_id, c.slug AS cinema_slug, c.name AS cinema, c.city, c.address, c.facilities, c.tz,
           (SELECT count(*)::int FROM order_seats os WHERE os.showtime_id=st.id) AS taken
    FROM showtimes st
    JOIN movies m ON m.id=st.movie_id JOIN studios s ON s.id=st.studio_id JOIN cinemas c ON c.id=s.cinema_id
    WHERE m.slug=${req.params.slug} AND c.active AND (st.starts_at AT TIME ZONE c.tz)::date = ${date}::date
      AND st.starts_at > now() AND (${city}::text IS NULL OR c.city=${city})
    ORDER BY c.city, c.name, st.starts_at`;
  const by = new Map();
  for (const x of rows) {
    if (!by.has(x.cinema_id)) by.set(x.cinema_id, { id: x.cinema_id, slug: x.cinema_slug, name: x.cinema, city: x.city, address: x.address, facilities: x.facilities, tz: x.tz, showtimes: [] });
    by.get(x.cinema_id).showtimes.push({ id: x.id, startsAt: x.startsAt, price: x.price, studio: x.studio, kind: x.kind, available: x.capacity - x.taken, capacity: x.capacity });
  }
  res.json([...by.values()]);
}));

r.get('/showtimes/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw httpErr(400, 'ID tidak valid');
  await releaseExpired();
  const st = await prisma.showtime.findUnique({ where: { id }, include: { movie: true, studio: { include: { cinema: true } } } });
  if (!st) throw httpErr(404, 'Jadwal tidak ditemukan');
  const [taken, s] = await Promise.all([prisma.orderSeat.findMany({ where: { showtimeId: id }, select: { seat: true } }), getSettings()]);
  res.json({
    id: st.id, startsAt: st.startsAt, price: st.price, studio: st.studio.name, kind: st.studio.kind, rows: st.studio.seatRows, cols: st.studio.seatCols,
    started: st.startsAt <= new Date(),
    movie: { title: st.movie.title, slug: st.movie.slug, hue: st.movie.hue, ageRating: st.movie.ageRating, durationMin: st.movie.durationMin, posterUrl: st.movie.posterUrl },
    cinema: { name: st.studio.cinema.name, city: st.studio.cinema.city, address: st.studio.cinema.address, tz: st.studio.cinema.tz },
    taken: taken.map((x) => x.seat), serviceFee: s.serviceFee, maxSeats: s.maxSeats,
  });
}));

r.post('/orders', rateLimit(10, 60_000, 'order'), wrap(async (req, res) => {
  const s = await getSettings();
  if (!s.bookingOpen) throw httpErr(503, 'Penjualan tiket sedang ditutup sementara. Silakan coba lagi nanti.');
  const b = req.body || {};
  const showtimeId = Number(b.showtimeId);
  const name = String(b.name || '').trim().slice(0, 80);
  const email = String(b.email || '').trim().slice(0, 120);
  const phone = String(b.phone || '').replace(/[\s-]/g, '').slice(0, 20);
  const seats = [...new Set((Array.isArray(b.seats) ? b.seats : []).map((x) => String(x).toUpperCase()))];

  if (!Number.isInteger(showtimeId)) throw httpErr(400, 'Jadwal tidak valid');
  if (name.length < 2) throw httpErr(400, 'Nama wajib diisi');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpErr(400, 'Email tidak valid');
  if (!/^(\+62|62|0)8\d{7,12}$/.test(phone)) throw httpErr(400, 'Nomor WhatsApp tidak valid (contoh 0812xxxxxxx)');
  if (!seats.length) throw httpErr(400, 'Pilih minimal 1 kursi');
  if (seats.length > s.maxSeats) throw httpErr(400, `Maksimal ${s.maxSeats} kursi per pesanan`);

  const code = await prisma.$transaction(async (tx) => {
    await releaseExpired(tx);
    const st = await tx.showtime.findUnique({ where: { id: showtimeId }, include: { studio: { include: { cinema: true } } } });
    if (!st || !st.studio.cinema.active) throw httpErr(404, 'Jadwal tidak ditemukan');
    if (st.startsAt <= new Date()) throw httpErr(400, 'Pertunjukan sudah dimulai');
    for (const x of seats) if (!validSeat(x, st.studio)) throw httpErr(400, `Kursi ${x} tidak valid`);

    const subtotal = st.price * seats.length, fee = s.serviceFee * seats.length;
    // Kode unik 1–99 → total tiap pesanan aktif berbeda (memudahkan pencocokan mutasi QRIS)
    let unique = 0, total = 0;
    for (let i = 0; i < 60; i++) {
      unique = 1 + crypto.randomInt(99);
      total = subtotal + fee + unique;
      if (!(await tx.order.findFirst({ where: { total, status: { in: ['pending', 'awaiting_verification'] } }, select: { id: true } }))) break;
    }
    const order = await tx.order.create({ data: {
      code: newCode(), showtimeId, customerName: name, email, phone, seats, subtotal, serviceFee: fee, uniqueCode: unique, total,
      expiresAt: new Date(Date.now() + s.payWindowMin * 60_000) } });
    try {
      // Primary key (showtime_id, seat) menjamin tidak ada double-booking
      await tx.orderSeat.createMany({ data: seats.map((seat) => ({ showtimeId, seat, orderId: order.id })) });
    } catch (e) {
      if (e.code === 'P2002') throw httpErr(409, 'Maaf, ada kursi yang baru saja dipesan orang lain. Silakan pilih kursi lain.');
      throw e;
    }
    return order.code;
  }, { maxWait: 10_000, timeout: 20_000 });
  res.status(201).json({ code });
}));

const merchantOf = (s) => ({ name: s.merchantName, nmid: s.merchantNmid });

r.get('/orders/:code', wrap(async (req, res) => {
  await releaseExpired();
  const o = await prisma.order.findUnique({ where: { code: req.params.code.toUpperCase() }, include: orderInclude });
  if (!o) throw httpErr(404, 'Pesanan tidak ditemukan');
  res.json(await orderView(o, merchantOf(await getSettings())));
}));

r.post('/orders/:code/paid', rateLimit(15, 60_000, 'paid'), wrap(async (req, res) => {
  const code = req.params.code.toUpperCase();
  const proof = req.body?.proof ?? null;
  if (proof !== null && (typeof proof !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(proof) || proof.length > 2_500_000))
    throw httpErr(400, 'Bukti pembayaran harus berupa gambar (PNG/JPG/WEBP) maks ±1,8 MB');
  const s = await getSettings();
  await releaseExpired();
  const u = await prisma.order.updateMany({
    where: { code, status: { in: ['pending', 'awaiting_verification'] } },
    data: { status: 'awaiting_verification', ...(proof ? { proof } : {}), expiresAt: new Date(Date.now() + s.verifyWindowHours * 3600_000) } });
  if (!u.count) throw httpErr(409, 'Pesanan sudah tidak dapat dibayar (kedaluwarsa atau dibatalkan).');
  res.json({ ok: true });
}));

r.post('/orders/:code/cancel', wrap(async (req, res) => {
  const code = req.params.code.toUpperCase();
  await prisma.$transaction(async (tx) => {
    const o = await tx.order.findFirst({ where: { code, status: 'pending' } });
    if (!o) throw httpErr(409, 'Pesanan tidak bisa dibatalkan');
    const u = await tx.order.updateMany({ where: { id: o.id, status: 'pending' }, data: { status: 'cancelled' } });
    if (!u.count) throw httpErr(409, 'Pesanan tidak bisa dibatalkan');
    await tx.orderSeat.deleteMany({ where: { orderId: o.id } });
  });
  res.json({ ok: true });
}));

module.exports = r;
