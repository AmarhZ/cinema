const crypto = require('crypto');
const { httpErr } = require('./util');

const COOKIE = 'marr_admin';
const TTL_MS = 12 * 3600 * 1000;

const password = () => process.env.ADMIN_PASSWORD || process.env.ADMIN_KEY || '';
const secret = () => process.env.SESSION_SECRET || (password() ? crypto.createHash('sha256').update('marr:' + password()).digest('hex') : '');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function checkPassword(given) {
  const real = password();
  if (!real) throw httpErr(503, 'ADMIN_PASSWORD belum diatur di server');
  return crypto.timingSafeEqual(sha(given), sha(real));
}
const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', secret()).update(body).digest('base64url');
};
function verify(token) {
  if (!token || !secret()) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const exp = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter((x) => x[0]));

function setSession(res) {
  const token = sign({ sub: 'admin', exp: Date.now() + TTL_MS });
  const secure = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL_MS / 1000}${secure ? '; Secure' : ''}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}
// Middleware: wajib login; metode non-GET wajib header X-Requested-With (proteksi CSRF tambahan)
function requireAdmin(req, _res, next) {
  const s = verify(parseCookies(req.headers.cookie)[COOKIE]);
  if (!s) return next(httpErr(401, 'Sesi berakhir, silakan masuk lagi'));
  if (!['GET', 'HEAD'].includes(req.method) && req.get('x-requested-with') !== 'marr-admin') return next(httpErr(403, 'Permintaan ditolak'));
  req.admin = s;
  next();
}
const isAdminReq = (req) => !!verify(parseCookies(req.headers.cookie)[COOKIE]);

module.exports = { checkPassword, setSession, clearSession, requireAdmin, isAdminReq };
