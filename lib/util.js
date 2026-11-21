const crypto = require('crypto');

const httpErr = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Rate limiter in-memory (per instance). Cukup untuk meredam spam sederhana.
const hits = new Map();
function rateLimit(max, windowMs, name = '') {
  return (req, _res, next) => {
    const key = name + '|' + req.ip;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return next(httpErr(429, 'Terlalu banyak permintaan, coba lagi sebentar.'));
    arr.push(now); hits.set(key, arr);
    if (hits.size > 5000) hits.clear();
    next();
  };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => 'MR' + Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function validSeat(seat, st) {
  const m = /^([A-Z])(\d{1,2})$/.exec(seat);
  if (!m) return false;
  const r = ROWS.indexOf(m[1]); const c = Number(m[2]);
  return r >= 0 && r < st.seatRows && c >= 1 && c <= st.seatCols;
}

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' dan ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

// Zona waktu Indonesia (tanpa DST) → offset tetap
const TZ_OFFSET = { 'Asia/Jakarta': '+07:00', 'Asia/Makassar': '+08:00', 'Asia/Jayapura': '+09:00' };
const TZS = Object.keys(TZ_OFFSET);
const localToUtc = (ymd, hm, tz) => new Date(`${ymd}T${hm}:00${TZ_OFFSET[tz] || '+07:00'}`);
const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function addDays(ymd, n) { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const dowOf = (ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay();

module.exports = { httpErr, wrap, rateLimit, newCode, validSeat, slugify, TZ_OFFSET, TZS, localToUtc, todayIn, addDays, dowOf };
