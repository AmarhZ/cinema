// Server lokal: npm start
const app = require('./app');
const { ensureShowtimes } = require('./lib/showtimes');
const { releaseExpired } = require('./lib/orders');
const PORT = process.env.PORT || 3000;
(async () => {
  await ensureShowtimes(7).then((n) => n && console.log(`✓ ${n} jadwal tayang baru dibuat`)).catch((e) => console.warn('Lewati pembuatan jadwal:', e.message));
  setInterval(() => releaseExpired().catch(() => {}), 60_000).unref();
  app.listen(PORT, () => console.log(`MARR Cinema berjalan di http://localhost:${PORT}  (admin: /admin)`));
})();
