const { prisma } = require('./db');
const { localToUtc, todayIn, addDays, dowOf } = require('./util');
const { getSettings } = require('./settings');

const SLOTS = ['10:30', '13:00', '15:30', '18:00', '20:30'];

// Buat jadwal otomatis untuk film berstatus "now" (idempoten; tidak menimpa jadwal yang ada)
async function ensureShowtimes(days = 7, db = prisma) {
  const movies = await db.movie.findMany({ where: { status: 'now' }, orderBy: { id: 'asc' }, select: { id: true } });
  if (!movies.length) return 0;
  const studios = await db.studio.findMany({ where: { cinema: { active: true } }, include: { cinema: { select: { tz: true } } }, orderBy: [{ cinemaId: 'asc' }, { id: 'asc' }] });
  const { weekendSurcharge } = await getSettings();
  const rows = [];
  const idxByCinema = {};
  for (const st of studios) {
    const k = (idxByCinema[st.cinemaId] = (idxByCinema[st.cinemaId] ?? -1) + 1);
    const today = todayIn(st.cinema.tz);
    for (let d = 0; d < days; d++) {
      const ymd = addDays(today, d);
      const dow = dowOf(ymd);
      const price = st.basePrice + (dow === 0 || dow === 6 ? weekendSurcharge : 0);
      SLOTS.forEach((slot, s) => {
        if (st.kind === 'Premier' && s === 0) return;
        const movie = movies[(k * 2 + s + (st.cinemaId % 3)) % movies.length];
        rows.push({ movieId: movie.id, studioId: st.id, startsAt: localToUtc(ymd, slot, st.cinema.tz), price });
      });
    }
  }
  let created = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const r = await db.showtime.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
    created += r.count;
  }
  return created;
}
module.exports = { ensureShowtimes, SLOTS };
