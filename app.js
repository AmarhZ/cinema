// Aplikasi Express tunggal — dipakai server lokal (server.js) dan Vercel (entry: app.js)
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const { prisma } = require('./lib/db');
const { httpErr, wrap } = require('./lib/util');
const { releaseExpired } = require('./lib/orders');
const { ensureShowtimes } = require('./lib/showtimes');
const { isAdminReq } = require('./lib/auth');
const { audit } = require('./lib/audit');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '3mb' }));
app.use((_req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' }); next(); });
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/public'));

// Cron harian (Vercel Cron): buat jadwal 7 hari ke depan + bersihkan kursi kedaluwarsa
app.get('/api/cron/showtimes', wrap(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const okCron = secret && req.get('authorization') === `Bearer ${secret}`;
  if (!okCron && !isAdminReq(req)) throw httpErr(401, 'Tidak diizinkan');
  const [created, released] = [await ensureShowtimes(7), await releaseExpired()];
  if (created) await audit('showtime_generate', 'showtime', null, { days: 7, created, via: 'cron' }, 'system');
  res.json({ created, released });
}));
app.get('/api/health', wrap(async (_req, res) => { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true }); }));

// Statis (situs + /admin) disajikan Express — satu aplikasi untuk lokal dan Vercel
app.use('/admin', (_req, res, next) => { res.set({ 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-cache' }); next(); });
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));

app.use('/api', (_req, _res, next) => next(httpErr(404, 'Endpoint tidak ditemukan')));
app.use((err, _req, res, _next) => {
  let status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  let message = err.message;
  if (err.code === 'P2002') { status = 409; message = 'Data duplikat'; }
  else if (err.code === 'P2025') { status = 404; message = 'Data tidak ditemukan'; }
  if (!err.status && status >= 500) { console.error(err); message = 'Terjadi kesalahan pada server'; } // pesan httpErr (termasuk 503 disengaja) tetap ditampilkan
  res.status(status).json({ error: message });
});

module.exports = app;
