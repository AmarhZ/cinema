const QRCode = require('qrcode');
const { prisma } = require('./db');

const ACTIVE = ['pending', 'awaiting_verification'];

// Lepaskan kursi dari pesanan yang kedaluwarsa (atomik lewat satu UPDATE ... RETURNING)
async function releaseExpired(db = prisma) {
  const rows = await db.$queryRaw`UPDATE orders SET status='expired'
    WHERE status IN ('pending','awaiting_verification') AND expires_at < now() RETURNING id`;
  if (rows.length) await db.orderSeat.deleteMany({ where: { orderId: { in: rows.map((r) => r.id) } } });
  return rows.length;
}

const orderInclude = { showtime: { include: { movie: true, studio: { include: { cinema: true } } } } };

async function orderView(o, merchant) {
  const st = o.showtime, m = st.movie, c = st.studio.cinema;
  const view = {
    code: o.code, status: o.status, name: o.customerName,
    email: o.email.replace(/^(.).*(@.*)$/, '$1***$2'), phone: o.phone.replace(/.(?=.{3})/g, '•'),
    seats: o.seats, subtotal: o.subtotal, serviceFee: o.serviceFee, uniqueCode: o.uniqueCode, total: o.total,
    expiresAt: o.expiresAt, createdAt: o.createdAt, paidAt: o.paidAt, hasProof: !!o.proof,
    movie: { title: m.title, slug: m.slug, hue: m.hue, ageRating: m.ageRating, durationMin: m.durationMin, posterUrl: m.posterUrl },
    cinema: { name: c.name, city: c.city, address: c.address, tz: c.tz },
    studio: st.studio.name, studioKind: st.studio.kind, startsAt: st.startsAt, merchant,
  };
  if (o.status === 'paid') {
    view.ticketQr = await QRCode.toDataURL(`MARR-CINEMA|${o.code}|${o.seats.join(',')}`, { margin: 1, width: 260, errorCorrectionLevel: 'M' });
  }
  return view;
}

module.exports = { ACTIVE, releaseExpired, orderInclude, orderView };
