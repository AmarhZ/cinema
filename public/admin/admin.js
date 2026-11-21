/* MARR Cinema — Panel Admin (vanilla JS, hash routing) */
'use strict';
const $root = document.getElementById('root'), dlg = document.getElementById('dlg');
const TZL = { 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const rpShort = (n) => n >= 1e6 ? (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : n >= 1e3 ? Math.round(n / 1e3) + ' rb' : String(n);
const tm = (iso, tz) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).replace('.', ':');
const dtm = (iso, tz = 'Asia/Jakarta') => new Intl.DateTimeFormat('id-ID', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).replace('.', ':');
const ymdNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayLabel = (ymd, o) => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', ...o }).format(new Date(ymd + 'T12:00:00Z'));
function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'; return Math.floor(s / 86400) + ' hari lalu';
}
const ICON = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  ticket: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M13 6v12" stroke-dasharray="2 3"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 12h18M3 16h4M17 8h4M17 16h4"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  log: '<path d="M5 4h14v16H5zM9 9h6M9 13h6M9 17h3"/>',
  out: '<path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/>',
};
const ico = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ''}</svg>`;
const ST = {
  pending: ['Menunggu bayar', 'gold', '#f3dc96'], awaiting_verification: ['Perlu verifikasi', 'blue', '#bcc6ff'], paid: ['Lunas', 'green', '#9be8c3'],
  expired: ['Kedaluwarsa', '', '#8b90c6'], cancelled: ['Dibatalkan', '', '#aeb1d6'], rejected: ['Ditolak', 'red', '#ffb4bd'],
};
const badge = (s) => `<span class="badge ${ST[s]?.[1] || ''}">${ST[s]?.[0] || esc(s)}</span>`;

function toast(msg, ok = false) {
  const el = document.createElement('div'); el.className = 'toast' + (ok ? ' ok' : ''); el.textContent = msg;
  document.getElementById('toasts').appendChild(el); setTimeout(() => el.remove(), 4500);
}
async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch('/api/admin' + path, { method, credentials: 'same-origin', headers: { 'x-requested-with': 'marr-admin', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  if (r.status === 401 && path !== '/login') { showLogin('Sesi berakhir, silakan masuk lagi.'); throw Object.assign(new Error('401'), { silent: true }); }
  if (!r.ok) throw Object.assign(new Error(d?.error || 'Terjadi kesalahan'), { status: r.status });
  return d;
}
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (!e.silent) toast(e.message); } };

/* ---------- modal ---------- */
function modal(title, body, footer = '', wide = false) {
  dlg.className = wide ? 'wide' : '';
  dlg.innerHTML = `<div class="dlg-in"><div class="dlg-h"><h2>${title}</h2><button class="x" type="button" data-close aria-label="Tutup">×</button></div><div class="dlg-b">${body}</div>${footer ? `<div class="dlg-f">${footer}</div>` : ''}</div>`;
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('input:not([type=hidden]),select,textarea')?.focus({ preventScroll: true });
  return dlg;
}
const closeModal = () => dlg.open && dlg.close();
dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) closeModal(); });
function confirmBox({ title, message, ok = 'Ya, lanjutkan', danger = false, reason = false }) {
  return new Promise((resolve) => {
    modal(esc(title), `<p class="muted" style="margin-bottom:${reason ? 12 : 0}px">${message}</p>${reason ? '<label class="field"><span>Alasan / catatan (opsional)</span><input class="input" id="cb-reason" maxlength="300"></label>' : ''}`,
      `<button class="btn ghost" data-close>Batal</button><button class="btn ${danger ? 'danger' : ''}" id="cb-ok">${esc(ok)}</button>`);
    let done = false;
    const fin = (v) => { if (!done) { done = true; dlg.removeEventListener('close', onClose); resolve(v); } };
    const onClose = () => fin(null);
    dlg.addEventListener('close', onClose);
    dlg.querySelector('#cb-ok').onclick = () => { const v = { reason: dlg.querySelector('#cb-reason')?.value.trim() || '' }; fin(v); closeModal(); };
  });
}

/* ---------- login / shell ---------- */
let navToken = 0, current = null, pollTimer = null, lastAwaiting = null, salesOpen = true;
function showLogin(msg = '') {
  clearInterval(pollTimer); closeModal();
  $root.innerHTML = `<div class="login"><form class="panel fadein" id="lf"><a class="brand" href="/" style="margin-bottom:18px"><span class="brand-mark">M</span><span class="brand-name">MARR<em>Admin</em></span></a>
    <h2 style="margin-bottom:6px">Masuk panel admin</h2><p class="muted" style="margin-bottom:18px;font-size:14.5px">Kelola film, jadwal, pesanan, dan pantau penjualan.</p>
    <label class="field"><span>Kata sandi</span><input class="input" type="password" name="password" autocomplete="current-password" required autofocus></label>
    <div class="form-err" role="alert">${esc(msg)}</div><button class="btn block">Masuk</button></form></div>`;
  $root.querySelector('#lf').onsubmit = async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
    try { await api('/login', { method: 'POST', body: { password: new FormData(e.target).get('password') } }); boot(); }
    catch (ex) { e.target.querySelector('.form-err').textContent = ex.message; btn.disabled = false; e.target.password.select(); }
  };
}
const NAV = [['', 'Dashboard', 'dash'], ['pesanan', 'Pesanan', 'ticket'], ['jadwal', 'Jadwal', 'clock'], ['film', 'Film', 'film'], ['bioskop', 'Bioskop', 'pin'], ['pengaturan', 'Pengaturan', 'sliders'], ['log', 'Log aktivitas', 'log']];
function shell() {
  $root.innerHTML = `<div class="shell">
    <aside class="side"><a class="brand" href="/admin/"><span class="brand-mark">M</span><span class="brand-name">MARR<em>Admin</em></span></a>
      ${NAV.map(([k, l, i]) => `<a class="nav-i" href="#/${k}" data-k="${k}">${ico(i)}<span>${l}</span>${k === 'pesanan' ? '<span class="cnt" id="cnt-s" hidden></span>' : ''}</a>`).join('')}
      <div class="grow"></div>
      <a class="nav-i" href="/" target="_blank" rel="noopener">${ico('film')}<span>Lihat website ↗</span></a>
      <a class="nav-i" href="#/" id="logout">${ico('out')}<span>Keluar</span></a></aside>
    <div class="main"><header class="top"><a class="brand" href="/admin/"><span class="brand-mark">M</span></a><h1 id="ttl"></h1><span class="sp"></span>
      <button class="sales-pill" id="sales" type="button" title="Buka / tutup penjualan tiket"><i></i><span class="lbl">Penjualan</span> <b id="sales-t">…</b></button>
      <button class="btn ghost sm" id="logout2" type="button">Keluar</button></header>
      <nav class="tabs" aria-label="Menu">${NAV.map(([k, l]) => `<a href="#/${k}" data-k="${k}">${l}${k === 'pesanan' ? '<span class="cnt" data-cnt="pesanan" hidden></span>' : ''}</a>`).join('')}</nav>
      <main class="view" id="view" tabindex="-1"></main></div></div>`;
  const out = async (e) => { e?.preventDefault(); try { await api('/logout', { method: 'POST' }); } catch {} showLogin(); };
  $root.querySelector('#logout').onclick = out; $root.querySelector('#logout2').onclick = out;
  $root.querySelector('#sales').onclick = guard(async () => {
    const open = !salesOpen;
    const c = await confirmBox({ title: open ? 'Buka penjualan?' : 'Tutup penjualan?', message: open ? 'Pelanggan dapat memesan tiket kembali.' : 'Pelanggan tidak bisa membuat pesanan baru. Pesanan yang sudah ada tetap berjalan.', ok: open ? 'Buka' : 'Tutup', danger: !open });
    if (!c) return;
    await api('/settings', { method: 'PUT', body: { bookingOpen: open } }); setSales(open); toast(open ? 'Penjualan dibuka.' : 'Penjualan ditutup.', true); current?.refresh?.();
  });
}
function setSales(open) {
  salesOpen = open; const b = $root.querySelector('#sales'); if (!b) return;
  b.classList.toggle('off', !open); b.querySelector('#sales-t').textContent = open ? 'Buka' : 'Ditutup';
}
async function pollCounts(first = false) {
  try {
    const c = await api('/counts');
    document.querySelectorAll('#cnt-s,[data-cnt=pesanan]').forEach((el) => { el.hidden = !c.awaiting; el.textContent = c.awaiting; });
    document.title = (c.awaiting ? `(${c.awaiting}) ` : '') + 'Admin · MARR Cinema';
    if (!first && lastAwaiting !== null && c.awaiting > lastAwaiting) { toast(`Ada ${c.awaiting - lastAwaiting} pembayaran baru yang perlu diverifikasi.`, true); current?.refresh?.(); }
    lastAwaiting = c.awaiting;
  } catch {}
}
async function boot() {
  try { await api('/me'); } catch (e) { if (!e.silent) showLogin(); return; }
  shell(); lastAwaiting = null;
  api('/settings').then((s) => setSales(s.bookingOpen)).catch(() => {});
  pollCounts(true);
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.visibilityState !== 'visible' || dlg.open) return;
    pollCounts(); current?.refresh?.();
  }, 20000);
  route();
}

/* ---------- router ---------- */
const PAGES = { '': dashboard, pesanan, jadwal, film, bioskop, pengaturan, log };
async function route() {
  const k = (location.hash.replace(/^#\/?/, '').split('/')[0]) || '';
  const page = PAGES[k] || dashboard;
  const key = k in PAGES ? k : '';
  document.querySelectorAll('[data-k]').forEach((a) => { const on = a.dataset.k === key; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.querySelector('.tabs a.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  const label = NAV.find((n) => n[0] === key)[1];
  const t = $root.querySelector('#ttl'); if (t) t.textContent = label;
  hideTip(); const token = ++navToken; current = null;
  const view = $root.querySelector('#view'); if (!view) return;
  view.innerHTML = '<div class="grid"><div class="sk"></div><div class="sk"></div></div>';
  try { current = (await page(view, () => token !== navToken)) || null; } catch (e) { if (!e.silent && token === navToken) view.innerHTML = `<div class="empty">${esc(e.message)}<p style="margin-top:12px"><button class="btn ghost sm" onclick="location.reload()">Muat ulang</button></p></div>`; }
}
window.addEventListener('hashchange', () => { if (dlg.open) closeModal(); route(); });

/* ================= DASHBOARD ================= */
async function dashboard(view, stale) {
  let days = 14;
  const draw = async (soft) => {
    const d = await api('/stats?days=' + days); if (stale()) return;
    setSales(d.bookingOpen);
    const k = d.kpi, max = Math.max(1, ...d.series.map((x) => x.revenue)), tot = d.byStatus.reduce((a, b) => a + b.n, 0) || 1;
    const topMax = Math.max(1, ...d.topMovies.map((x) => x.tickets));
    const sum = d.series.reduce((a, x) => a + x.revenue, 0), tk = d.series.reduce((a, x) => a + x.tickets, 0);
    view.innerHTML = `<div class="${soft ? '' : 'fadein'}">
      <div class="grid kpis">
        <div class="kpi"><small>Pendapatan hari ini</small><b>${rp(k.revToday)}</b><span>${k.ticketsToday} tiket terjual</span></div>
        <div class="kpi"><small>7 hari terakhir</small><b>${rp(k.rev7)}</b><span>rata-rata ${rp(Math.round(k.rev7 / 7))}/hari</span></div>
        <div class="kpi"><small>30 hari terakhir</small><b>${rp(k.rev30)}</b><span>${k.tickets30} tiket</span></div>
        <a class="kpi ${k.awaiting ? 'alert' : ''}" href="#/pesanan"><small>Perlu verifikasi</small><b>${k.awaiting}</b><span>${k.awaiting ? 'Klik untuk memeriksa →' : 'Semua sudah diproses'}</span></a>
        <div class="kpi"><small>Menunggu pembayaran</small><b>${k.pending}</b><span>kursi sedang ditahan</span></div>
      </div>
      <div class="grid cols mt">
        <section class="panel"><div class="card-h"><h2>Pendapatan harian</h2>
          <div class="chips">${[7, 14, 30].map((n) => `<button class="chip" data-d="${n}" aria-pressed="${n === days}">${n} hari</button>`).join('')}</div></div>
          <div class="bars" role="img" aria-label="Grafik pendapatan harian">${d.series.map((x, i) => `<div class="bar ${x.revenue ? '' : 'zero'}" tabindex="0" style="--h:${Math.max(2, Math.round(x.revenue / max * 100))}%;--i:${i}" data-tip="${esc(dayLabel(x.day, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${rp(x.revenue)} · ${x.tickets} tiket"><i></i></div>`).join('')}</div>
          <div class="xl">${d.series.map((x, i) => `<span>${d.series.length <= 14 || i % 2 === 0 ? dayLabel(x.day, { day: 'numeric' }) : ''}</span>`).join('')}</div>
          <p class="muted" style="margin-top:12px;font-size:13.5px">Total ${days} hari: <b style="color:var(--text)">${rp(sum)}</b> · ${tk} tiket</p></section>
        <section class="panel"><div class="card-h"><h2>Film terlaris (30 hari)</h2></div>
          ${d.topMovies.length ? d.topMovies.map((m) => `<div class="hbar"><span class="t">${esc(m.title)}</span><span class="v">${m.tickets} tiket · ${rpShort(m.revenue)}</span><div class="track"><i style="--w:${Math.round(m.tickets / topMax * 100)}%"></i></div></div>`).join('') : '<p class="muted">Belum ada penjualan.</p>'}
          <div class="card-h" style="margin-top:20px"><h2>Status pesanan (30 hari)</h2></div>
          <div class="stack">${d.byStatus.map((s) => `<i title="${ST[s.status]?.[0]}: ${s.n}" style="width:${s.n / tot * 100}%;background:${ST[s.status]?.[2] || '#999'}"></i>`).join('')}</div>
          <div class="legend2">${d.byStatus.map((s) => `<span><i class="dot" style="background:${ST[s.status]?.[2] || '#999'}"></i>${ST[s.status]?.[0] || s.status} <b>${s.n}</b></span>`).join('') || '<span>Belum ada pesanan.</span>'}</div></section>
      </div>
      <div class="grid cols mt">
        <section class="panel"><div class="card-h"><h2>Tayang 36 jam ke depan · tingkat keterisian</h2><a class="link" href="#/jadwal">Kelola jadwal</a></div>
          ${d.occupancy.length ? d.occupancy.map((o) => { const p = Math.round(o.taken / o.capacity * 100); return `<div class="hbar"><span class="t">${esc(o.title)} <span class="muted" style="font-size:13px">· ${esc(o.cinema.replace('MARR Cinema ', ''))} · ${esc(o.studio)}</span></span><span class="v">${dtm(o.startsAt, o.tz)} ${TZL[o.tz] || ''} · ${o.taken}/${o.capacity}</span><div class="track ${p >= 100 ? 'full' : p >= 70 ? 'warn' : ''}"><i style="--w:${p}%"></i></div></div>`; }).join('') : '<p class="muted">Tidak ada jadwal dalam 36 jam ke depan.</p>'}</section>
        <section class="panel"><div class="card-h"><h2>Pesanan terbaru</h2><a class="link" href="#/pesanan">Semua</a></div>
          <ul class="feed">${d.recentOrders.map((o) => `<li><div><b>${esc(o.code)}</b> ${badge(o.status)}<small>${esc(o.name)} · ${esc(o.movie)} · ${o.seats.length} kursi</small></div><span class="when">${rp(o.total)}<br>${ago(o.createdAt)}</span></li>`).join('') || '<li class="muted">Belum ada pesanan.</li>'}</ul></section>
      </div>
      <section class="panel mt"><div class="card-h"><h2>Aktivitas terakhir</h2><a class="link" href="#/log">Lihat semua</a></div>
        <ul class="feed">${d.activity.map(logItem).join('') || '<li class="muted">Belum ada aktivitas.</li>'}</ul></section></div>`;
    view.querySelectorAll('[data-d]').forEach((b) => b.onclick = guard(async () => { days = Number(b.dataset.d); await draw(true); }));
  };
  await draw();
  return { refresh: () => draw(true).catch(() => {}) };
}

/* ================= LOG ================= */
const ACT = {
  login: ['Masuk admin', 'out'], login_failed: ['Gagal masuk', 'out'], order_confirm: ['Konfirmasi pesanan', 'ticket'], order_reject: ['Tolak pesanan', 'ticket'], order_cancel: ['Batalkan pesanan lunas', 'ticket'], order_note: ['Catatan pesanan', 'ticket'],
  movie_create: ['Film ditambahkan', 'film'], movie_update: ['Film diubah', 'film'], movie_delete: ['Film dihapus', 'film'],
  cinema_create: ['Bioskop ditambahkan', 'pin'], cinema_update: ['Bioskop diubah', 'pin'], cinema_delete: ['Bioskop dihapus', 'pin'],
  studio_create: ['Studio ditambahkan', 'pin'], studio_update: ['Studio diubah', 'pin'], studio_delete: ['Studio dihapus', 'pin'],
  showtime_create: ['Jadwal ditambahkan', 'clock'], showtime_update: ['Jadwal diubah', 'clock'], showtime_delete: ['Jadwal dihapus', 'clock'], showtime_bulk: ['Jadwal massal', 'clock'], showtime_generate: ['Jadwal otomatis dibuat', 'clock'],
  settings_update: ['Pengaturan diubah', 'sliders'],
};
function logItem(l) {
  let det = ''; try { const o = JSON.parse(l.detail || 'null'); if (o && typeof o === 'object') det = Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · '); else det = l.detail || ''; } catch { det = l.detail || ''; }
  const a = ACT[l.action] || [l.action, 'log'];
  return `<li><span class="ev">${ico(a[1])}</span><div style="min-width:0"><b>${esc(a[0])}</b>${l.entityId ? ` <span class="muted">#${esc(l.entityId)}</span>` : ''}<small>${esc(det)}</small></div><span class="when">${esc(l.actor)}<br>${ago(l.createdAt)}</span></li>`;
}
async function log(view, stale) {
  let rows = [], more = false;
  const load = async (reset) => {
    const d = await api('/logs?limit=40' + (!reset && rows.length ? '&before=' + rows[rows.length - 1].id : '')); if (stale()) return;
    rows = reset ? d.rows : rows.concat(d.rows); more = d.more; paint();
  };
  const paint = () => {
    view.innerHTML = `<section class="panel fadein"><div class="card-h"><h2>Log aktivitas</h2><span class="muted" style="font-size:13.5px">Semua perubahan oleh admin & sistem tercatat di sini.</span></div>
      <ul class="feed">${rows.map(logItem).join('') || '<li class="muted">Belum ada aktivitas.</li>'}</ul>${more ? '<p style="text-align:center;margin-top:14px"><button class="btn ghost sm" id="more">Muat lebih banyak</button></p>' : ''}</section>`;
    view.querySelector('#more')?.addEventListener('click', guard(() => load(false)));
  };
  await load(true);
  return { refresh: () => load(true).catch(() => {}) };
}

/* ================= PESANAN ================= */
async function pesanan(view, stale) {
  const S = { status: 'awaiting_verification', q: '', page: 1 };
  const tabs = [['awaiting_verification', 'Perlu verifikasi'], ['pending', 'Menunggu bayar'], ['paid', 'Lunas'], ['expired', 'Kedaluwarsa'], ['rejected', 'Ditolak'], ['cancelled', 'Dibatalkan'], ['', 'Semua']];
  view.innerHTML = `<div class="fadein"><div class="bar-t"><div class="chips" id="tabs">${tabs.map(([v, l]) => `<button class="chip" data-s="${v}" aria-pressed="${v === S.status}">${l}</button>`).join('')}</div>
    <input class="input sm" style="max-width:280px" id="q" type="search" placeholder="Cari kode / nama / HP / email" aria-label="Cari pesanan"></div><div id="list"></div></div>`;
  const list = view.querySelector('#list');
  let t, cache = [];
  const load = async () => {
    const d = await api(`/orders?status=${S.status}&q=${encodeURIComponent(S.q)}&page=${S.page}`); if (stale()) return;
    cache = d.rows;
    list.innerHTML = d.rows.length ? `<div class="tbl-w"><table class="t"><thead><tr><th>Kode</th><th>Pemesan</th><th>Film & jadwal</th><th>Kursi</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${d.rows.map((o) => `<tr>
      <td data-l="Kode"><div><b>${esc(o.code)}</b><small>${ago(o.createdAt)}</small></div></td>
      <td data-l="Pemesan"><div>${esc(o.name)}<small>${esc(o.phone)}</small></div></td>
      <td data-l="Film"><div>${esc(o.movie)}<small>${esc(o.cinema.replace('MARR Cinema ', ''))} · ${esc(o.studio)} · ${dtm(o.startsAt, o.tz)} ${TZL[o.tz] || ''}</small></div></td>
      <td data-l="Kursi">${esc(o.seats.join(', '))}</td>
      <td data-l="Total"><div style="text-align:right"><b>${rp(o.total)}</b><small>kode unik ${o.uniqueCode}</small></div></td>
      <td data-l="Status">${badge(o.status)}${o.hasProof ? ' <span class="badge">📎 bukti</span>' : ''}</td>
      <td class="act"><div class="acts"><button class="btn ghost sm" data-detail="${esc(o.code)}">Detail</button>${['awaiting_verification', 'pending'].includes(o.status) ? `<button class="btn sm" data-quick="confirm" data-c="${esc(o.code)}">Konfirmasi</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>
      <div class="pager"><button class="btn ghost sm" id="pv" ${S.page <= 1 ? 'disabled' : ''}>← Sebelumnya</button><span>Halaman ${d.page} / ${d.pages} · ${d.total} pesanan</span><button class="btn ghost sm" id="nx" ${S.page >= d.pages ? 'disabled' : ''}>Berikutnya →</button></div>`
      : '<div class="empty">Tidak ada pesanan pada filter ini.</div>';
    list.querySelector('#pv')?.addEventListener('click', () => { S.page--; guard(load)(); });
    list.querySelector('#nx')?.addEventListener('click', () => { S.page++; guard(load)(); });
    list.querySelectorAll('[data-detail]').forEach((b) => b.onclick = () => detail(cache.find((o) => o.code === b.dataset.detail)));
    list.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => act(b.dataset.c, 'confirm', cache.find((o) => o.code === b.dataset.c)));
  };
  const act = guard(async (code, action, o) => {
    const cfg = { confirm: { title: 'Konfirmasi pembayaran?', message: `Pastikan dana <b>${rp(o?.total)}</b> sudah masuk di mutasi QRIS (kode unik ${o?.uniqueCode}). E-tiket akan aktif untuk <b>${esc(o?.name)}</b>.`, ok: 'Ya, konfirmasi', reason: false },
      reject: { title: 'Tolak pesanan?', message: 'Kursi akan dilepas dan pelanggan melihat status "ditolak".', ok: 'Tolak pesanan', danger: true, reason: true },
      cancel: { title: 'Batalkan pesanan lunas?', message: 'Kursi dilepas dan e-tiket tidak berlaku. <b>Refund dilakukan manual</b> oleh Anda.', ok: 'Batalkan pesanan', danger: true, reason: true } }[action];
    const c = await confirmBox(cfg); if (!c) return;
    await api(`/orders/${code}/${action}`, { method: 'POST', body: { reason: c.reason } });
    toast({ confirm: 'Pembayaran dikonfirmasi — e-tiket aktif.', reject: 'Pesanan ditolak.', cancel: 'Pesanan dibatalkan.' }[action], true);
    closeModal(); pollCounts(); await load();
  });
  function detail(o) {
    const wa = '62' + o.phone.replace(/^(\+?62|0)/, '');
    const open = ['awaiting_verification', 'pending'].includes(o.status);
    modal(`Pesanan ${esc(o.code)}`, `<div style="margin-bottom:14px">${badge(o.status)}</div>
      <dl class="dgrid"><dt>Film</dt><dd>${esc(o.movie)}</dd><dt>Jadwal</dt><dd>${esc(o.cinema)} · ${esc(o.studio)}<br>${dtm(o.startsAt, o.tz)} ${TZL[o.tz] || ''}</dd><dt>Kursi</dt><dd>${esc(o.seats.join(', '))}</dd>
      <dt>Pemesan</dt><dd>${esc(o.name)}<br>${esc(o.email)}<br>${esc(o.phone)}</dd><dt>Tiket</dt><dd>${rp(o.subtotal)}</dd><dt>Biaya layanan</dt><dd>${rp(o.serviceFee)}</dd><dt>Kode unik</dt><dd>${rp(o.uniqueCode)}</dd>
      <dt>Total bayar</dt><dd><b style="font-size:18px">${rp(o.total)}</b></dd><dt>Dibuat</dt><dd>${dtm(o.createdAt)} WIB</dd>${o.paidAt ? `<dt>Dibayar</dt><dd>${dtm(o.paidAt)} WIB</dd>` : ''}</dl>
      ${o.hasProof ? `<p class="muted" style="font-size:13px;margin-bottom:4px">Bukti pembayaran:</p><a href="/api/admin/orders/${esc(o.code)}/proof" target="_blank" rel="noopener"><img class="proof" src="/api/admin/orders/${esc(o.code)}/proof" alt="Bukti pembayaran"></a>` : '<p class="muted" style="font-size:13.5px;margin-bottom:12px">Belum ada bukti pembayaran diunggah.</p>'}
      <label class="field"><span>Catatan admin</span><textarea class="input" id="note" maxlength="300" style="min-height:70px">${esc(o.note || '')}</textarea></label>`,
      `<a class="btn ghost" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a><button class="btn ghost" id="sv">Simpan catatan</button>
       ${open ? '<button class="btn danger" id="rj">Tolak</button><button class="btn ok" id="cf">Konfirmasi</button>' : ''}
       ${o.status === 'paid' ? '<button class="btn danger" id="cn">Batalkan (refund)</button>' : ''}
       ${o.status === 'expired' ? '<button class="btn ok" id="cf">Pulihkan &amp; konfirmasi</button>' : ''}`, true);
    dlg.querySelector('#sv').onclick = guard(async () => { await api('/orders/' + o.code, { method: 'PATCH', body: { note: dlg.querySelector('#note').value } }); toast('Catatan disimpan.', true); await load(); });
    dlg.querySelector('#cf')?.addEventListener('click', () => act(o.code, 'confirm', o));
    dlg.querySelector('#rj')?.addEventListener('click', () => act(o.code, 'reject', o));
    dlg.querySelector('#cn')?.addEventListener('click', () => act(o.code, 'cancel', o));
  }
  view.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { S.status = b.dataset.s; S.page = 1; view.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', x === b)); guard(load)(); });
  view.querySelector('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value.trim(); S.page = 1; guard(load)(); }, 300); });
  await load();
  return { refresh: () => load().catch(() => {}) };
}

/* ================= FILM ================= */
const hueBg = (h) => `linear-gradient(135deg,hsl(${h} 55% 16%),hsl(${(h + 35) % 360} 70% 38%))`;
const thumb = (m) => m.posterUrl ? `<img src="${esc(m.posterUrl)}" alt="" loading="lazy">` : `<div style="position:absolute;inset:0;background:${hueBg(m.hue)}"></div>`;
async function film(view, stale) {
  let all = [], f = 'now', q = '';
  const load = async () => { all = await api('/movies'); if (stale()) return; paint(); };
  const paint = () => {
    const rows = all.filter((m) => (!f || m.status === f) && m.title.toLowerCase().includes(q.toLowerCase()));
    const cnt = (s) => all.filter((m) => !s || m.status === s).length;
    view.innerHTML = `<div class="fadein"><div class="bar-t"><div class="chips">${[['now', 'Sedang tayang'], ['soon', 'Segera'], ['archived', 'Arsip'], ['', 'Semua']].map(([v, l]) => `<button class="chip" data-f="${v}" aria-pressed="${v === f}">${l} · ${cnt(v)}</button>`).join('')}</div>
      <div class="fld"><input class="input sm" id="q" type="search" placeholder="Cari judul…" value="${esc(q)}" aria-label="Cari film"><button class="btn" id="add">+ Tambah film</button></div></div>
      ${rows.length ? `<div class="grid tiles">${rows.map((m) => `<article class="tile"><div class="th">${thumb(m)}</div><div class="body"><h3>${esc(m.title)}</h3>
        <div class="meta"><span class="badge age">${esc(m.ageRating)}</span><span class="badge ${m.status === 'now' ? 'green' : m.status === 'soon' ? 'gold' : ''}">${{ now: 'Tayang', soon: 'Segera', archived: 'Arsip' }[m.status]}</span>${m.score != null ? `<span class="badge">★ ${m.score}</span>` : ''}</div>
        <p>${esc(m.genres.join(' · '))} · ${Math.floor(m.durationMin / 60)}j ${m.durationMin % 60}m</p><p>${m.showtimes} jadwal${m.releaseDate ? ' · rilis ' + dayLabel(m.releaseDate, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
        <div class="acts"><button class="btn ghost sm" data-e="${m.id}">Ubah</button><button class="btn danger sm" data-x="${m.id}">Hapus</button></div></div></article>`).join('')}</div>` : '<div class="empty">Tidak ada film.</div>'}</div>`;
    view.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { f = b.dataset.f; paint(); });
    const qi = view.querySelector('#q'); qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; paint(); const n = view.querySelector('#q'); n.focus(); n.setSelectionRange(pos, pos); };
    view.querySelector('#add').onclick = () => form();
    view.querySelectorAll('[data-e]').forEach((b) => b.onclick = () => form(all.find((m) => m.id == b.dataset.e)));
    view.querySelectorAll('[data-x]').forEach((b) => b.onclick = guard(async () => {
      const m = all.find((x) => x.id == b.dataset.x);
      const c = await confirmBox({ title: 'Hapus film?', message: `"${esc(m.title)}" dan ${m.showtimes} jadwalnya akan dihapus permanen. Bila sudah punya riwayat pesanan, gunakan status <b>Arsip</b>.`, ok: 'Hapus', danger: true }); if (!c) return;
      await api('/movies/' + m.id, { method: 'DELETE' }); toast('Film dihapus.', true); await load();
    }));
  };
  function form(m = null) {
    const v = m || { title: '', tagline: '', synopsis: '', genres: [], durationMin: 100, ageRating: 'SU', score: '', director: '', cast: [], language: 'Indonesia', subtitle: '-', releaseDate: ymdNow(), status: 'now', posterUrl: '', hue: 200 };
    modal(m ? 'Ubah film' : 'Tambah film', `<form id="mf">
      <label class="field"><span>Judul *</span><input class="input" name="title" required maxlength="120" value="${esc(v.title)}"></label>
      <label class="field"><span>Tagline</span><input class="input" name="tagline" maxlength="160" value="${esc(v.tagline)}"></label>
      <label class="field"><span>Sinopsis *</span><textarea class="input" name="synopsis" required maxlength="2000">${esc(v.synopsis)}</textarea></label>
      <div class="f2"><label class="field"><span>Genre * (pisahkan koma)</span><input class="input" name="genres" required value="${esc(v.genres.join(', '))}" placeholder="Drama, Keluarga"></label>
        <label class="field"><span>Durasi (menit) *</span><input class="input" type="number" name="durationMin" min="1" max="600" required value="${v.durationMin}"></label></div>
      <div class="f3"><label class="field"><span>Rating usia</span><select class="input" name="ageRating">${['SU', '13+', '17+', '21+'].map((x) => `<option ${x === v.ageRating ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field"><span>Skor (0–9.9)</span><input class="input" type="number" step="0.1" min="0" max="9.9" name="score" value="${v.score ?? ''}"></label>
        <label class="field"><span>Status</span><select class="input" name="status">${[['now', 'Sedang tayang'], ['soon', 'Segera tayang'], ['archived', 'Arsip']].map(([k, l]) => `<option value="${k}" ${k === v.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="f2"><label class="field"><span>Tanggal rilis</span><input class="input" type="date" name="releaseDate" value="${esc(v.releaseDate || '')}"></label>
        <label class="field"><span>Sutradara</span><input class="input" name="director" maxlength="80" value="${esc(v.director || '')}"></label></div>
      <label class="field"><span>Pemeran (pisahkan koma)</span><input class="input" name="cast" value="${esc((v.cast || []).join(', '))}"></label>
      <div class="f2"><label class="field"><span>Bahasa</span><input class="input" name="language" maxlength="40" value="${esc(v.language || '')}"></label><label class="field"><span>Subtitle</span><input class="input" name="subtitle" maxlength="40" value="${esc(v.subtitle || '')}"></label></div>
      <label class="field"><span>URL poster (opsional)</span><input class="input" name="posterUrl" inputmode="url" placeholder="https://…" value="${esc(v.posterUrl || '')}"><div class="help">Kosongkan untuk memakai poster otomatis berwarna di bawah ini.</div></label>
      <label class="field"><span>Warna poster otomatis</span><input type="range" name="hue" min="0" max="359" value="${v.hue}" style="width:100%;accent-color:var(--cream)"><div id="hp" style="height:10px;border-radius:99px;margin-top:6px;background:${hueBg(v.hue)}"></div></label>
      <div class="form-err" id="fe" role="alert"></div></form>`,
      '<button class="btn ghost" data-close>Batal</button><button class="btn" id="sv">Simpan</button>', true);
    const fm = dlg.querySelector('#mf');
    fm.hue.oninput = () => { dlg.querySelector('#hp').style.background = hueBg(fm.hue.value); };
    const save = async (e) => {
      e?.preventDefault(); if (!fm.reportValidity()) return;
      const body = Object.fromEntries(new FormData(fm)); const btn = dlg.querySelector('#sv'); btn.disabled = true;
      try { await api(m ? '/movies/' + m.id : '/movies', { method: m ? 'PUT' : 'POST', body }); closeModal(); toast(m ? 'Film diperbarui.' : 'Film ditambahkan. Jadwalkan di menu Jadwal.', true); await load(); }
      catch (ex) { if (!ex.silent) dlg.querySelector('#fe').textContent = ex.message; btn.disabled = false; }
    };
    fm.onsubmit = save; dlg.querySelector('#sv').onclick = save;
  }
  await load();
  return { refresh: () => { if (!dlg.open) load().catch(() => {}); } };
}

/* ================= BIOSKOP ================= */
async function bioskop(view, stale) {
  let list = [];
  const load = async () => { list = await api('/cinemas'); if (stale()) return; paint(); };
  const paint = () => {
    view.innerHTML = `<div class="fadein"><div class="bar-t"><span class="muted">${list.length} bioskop · ${list.reduce((a, c) => a + c.studios.length, 0)} studio</span><button class="btn" id="add">+ Tambah bioskop</button></div>
      ${list.map((c) => `<section class="cin ${c.active ? '' : 'off'}"><div class="cin-h"><div><h3>${esc(c.name)} ${c.active ? '' : '<span class="badge red">Nonaktif</span>'}</h3><p>${esc(c.city)} · ${TZL[c.tz]} · ${esc(c.address)}</p>
        <div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${c.facilities.map((x) => `<span class="badge">${esc(x)}</span>`).join('')}</div></div>
        <div class="acts" style="align-self:flex-start"><button class="btn ghost sm" data-ce="${c.id}">Ubah</button><button class="btn ghost sm" data-ct="${c.id}">${c.active ? 'Nonaktifkan' : 'Aktifkan'}</button><button class="btn danger sm" data-cx="${c.id}">Hapus</button></div></div>
        <div class="tbl-w"><table class="t"><thead><tr><th>Studio</th><th>Tipe</th><th>Kursi</th><th class="r">Harga dasar</th><th>Jadwal</th><th></th></tr></thead><tbody>
        ${c.studios.map((s) => `<tr><td data-l="Studio"><b>${esc(s.name)}</b></td><td data-l="Tipe"><span class="badge ${s.kind === 'Premier' ? 'gold' : ''}">${s.kind}</span></td><td data-l="Kursi">${s.seatRows} × ${s.seatCols} = ${s.seatRows * s.seatCols}</td><td class="r" data-l="Harga">${rp(s.basePrice)}</td><td data-l="Jadwal">${s.showtimes}</td>
          <td class="act"><div class="acts"><button class="btn ghost sm" data-se="${s.id}">Ubah</button><button class="btn danger sm" data-sx="${s.id}">Hapus</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada studio.</td></tr>'}</tbody></table></div>
        <p style="margin-top:12px"><button class="btn ghost sm" data-sa="${c.id}">+ Tambah studio</button></p></section>`).join('') || '<div class="empty">Belum ada bioskop.</div>'}</div>`;
    view.querySelector('#add').onclick = () => cForm();
    const cin = (id) => list.find((c) => c.id == id), stu = (id) => list.flatMap((c) => c.studios).find((s) => s.id == id);
    view.querySelectorAll('[data-ce]').forEach((b) => b.onclick = () => cForm(cin(b.dataset.ce)));
    view.querySelectorAll('[data-ct]').forEach((b) => b.onclick = guard(async () => { const c = cin(b.dataset.ct); await api('/cinemas/' + c.id, { method: 'PUT', body: { ...c, active: !c.active } }); toast(c.active ? 'Bioskop dinonaktifkan (disembunyikan dari website).' : 'Bioskop diaktifkan.', true); await load(); }));
    view.querySelectorAll('[data-cx]').forEach((b) => b.onclick = guard(async () => { const c = cin(b.dataset.cx); const ok = await confirmBox({ title: 'Hapus bioskop?', message: `"${esc(c.name)}" beserta studio & jadwalnya dihapus permanen.`, ok: 'Hapus', danger: true }); if (!ok) return; await api('/cinemas/' + c.id, { method: 'DELETE' }); toast('Bioskop dihapus.', true); await load(); }));
    view.querySelectorAll('[data-sa]').forEach((b) => b.onclick = () => sForm(cin(b.dataset.sa)));
    view.querySelectorAll('[data-se]').forEach((b) => b.onclick = () => sForm(null, stu(b.dataset.se)));
    view.querySelectorAll('[data-sx]').forEach((b) => b.onclick = guard(async () => { const s = stu(b.dataset.sx); const ok = await confirmBox({ title: 'Hapus studio?', message: `"${esc(s.name)}" dan ${s.showtimes} jadwalnya dihapus permanen.`, ok: 'Hapus', danger: true }); if (!ok) return; await api('/studios/' + s.id, { method: 'DELETE' }); toast('Studio dihapus.', true); await load(); }));
  };
  function submit(fm, fn, okMsg) {
    const save = async (e) => { e?.preventDefault(); if (!fm.reportValidity()) return; const btn = dlg.querySelector('#sv'); btn.disabled = true;
      try { await fn(Object.fromEntries(new FormData(fm))); closeModal(); toast(okMsg, true); await load(); } catch (ex) { if (!ex.silent) dlg.querySelector('#fe').textContent = ex.message; btn.disabled = false; } };
    fm.onsubmit = save; dlg.querySelector('#sv').onclick = save;
  }
  function cForm(c = null) {
    const v = c || { name: 'MARR Cinema ', city: '', address: '', facilities: [], tz: 'Asia/Jakarta', active: true };
    modal(c ? 'Ubah bioskop' : 'Tambah bioskop', `<form id="cf"><label class="field"><span>Nama *</span><input class="input" name="name" required maxlength="80" value="${esc(v.name)}"></label>
      <div class="f2"><label class="field"><span>Kota *</span><input class="input" name="city" required maxlength="40" value="${esc(v.city)}"></label><label class="field"><span>Zona waktu</span><select class="input" name="tz">${Object.entries(TZL).map(([k, l]) => `<option value="${k}" ${k === v.tz ? 'selected' : ''}>${l} (${k.split('/')[1]})</option>`).join('')}</select></label></div>
      <label class="field"><span>Alamat *</span><input class="input" name="address" required maxlength="200" value="${esc(v.address)}"></label>
      <label class="field"><span>Fasilitas (pisahkan koma)</span><input class="input" name="facilities" value="${esc(v.facilities.join(', '))}" placeholder="Dolby Atmos, Parkir luas"></label>
      ${c ? '' : '<label class="field"><span>Harga dasar Studio 1 (Rp)</span><input class="input" type="number" name="basePrice" min="0" value="45000"><div class="help">Studio 1 (8×12 kursi) dibuat otomatis; ubah/tambah studio setelahnya.</div></label>'}
      <label class="chk" style="margin-top:6px"><input type="checkbox" name="active" value="1" ${v.active ? 'checked' : ''}> Tampilkan di website</label><div class="form-err" id="fe" role="alert"></div></form>`,
      '<button class="btn ghost" data-close>Batal</button><button class="btn" id="sv">Simpan</button>');
    const fm = dlg.querySelector('#cf');
    submit(fm, (b) => api(c ? '/cinemas/' + c.id : '/cinemas', { method: c ? 'PUT' : 'POST', body: { ...b, active: b.active === '1' } }), c ? 'Bioskop diperbarui.' : 'Bioskop ditambahkan.');
  }
  function sForm(c, s = null) {
    const v = s || { name: '', kind: 'Regular', seatRows: 8, seatCols: 12, basePrice: 45000 };
    modal(s ? 'Ubah studio' : 'Tambah studio', `<form id="sf"><div class="f2"><label class="field"><span>Nama *</span><input class="input" name="name" required maxlength="40" value="${esc(v.name)}" placeholder="Studio 3"></label>
      <label class="field"><span>Tipe</span><select class="input" name="kind">${['Regular', 'Premier'].map((x) => `<option ${x === v.kind ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
      <div class="f3"><label class="field"><span>Baris (A–…)</span><input class="input" type="number" name="seatRows" min="1" max="26" required value="${v.seatRows}"></label><label class="field"><span>Kursi / baris</span><input class="input" type="number" name="seatCols" min="1" max="30" required value="${v.seatCols}"></label>
      <label class="field"><span>Harga dasar (Rp)</span><input class="input" type="number" name="basePrice" min="0" required value="${v.basePrice}"></label></div><div class="form-err" id="fe" role="alert"></div></form>`,
      '<button class="btn ghost" data-close>Batal</button><button class="btn" id="sv">Simpan</button>');
    submit(dlg.querySelector('#sf'), (b) => api(s ? '/studios/' + s.id : `/cinemas/${c.id}/studios`, { method: s ? 'PUT' : 'POST', body: b }), s ? 'Studio diperbarui.' : 'Studio ditambahkan.');
  }
  view.addEventListener('click', () => {}); await load();
  return { refresh: () => { if (!dlg.open) load().catch(() => {}); } };
}

/* ================= JADWAL ================= */
async function jadwal(view, stale) {
  const [movies, cinemas] = await Promise.all([api('/movies'), api('/cinemas')]); if (stale()) return;
  const S = { date: ymdNow(), movieId: '', cinemaId: '' };
  let rows = [];
  const studios = cinemas.flatMap((c) => c.studios.map((s) => ({ ...s, cinema: c })));
  const nowMovies = movies.filter((m) => m.status === 'now');
  view.innerHTML = `<div class="fadein"><div class="bar-t"><div class="fld"><button class="btn ghost sm" id="pd" aria-label="Hari sebelumnya">‹</button><input class="input sm" type="date" id="dt" value="${S.date}" aria-label="Tanggal"><button class="btn ghost sm" id="nd" aria-label="Hari berikutnya">›</button><button class="btn ghost sm" id="td">Hari ini</button></div>
    <div class="fld"><select class="input sm" id="fm" aria-label="Filter film"><option value="">Semua film</option>${movies.filter((m) => m.status !== 'archived').map((m) => `<option value="${m.id}">${esc(m.title)}</option>`).join('')}</select>
    <select class="input sm" id="fc" aria-label="Filter bioskop"><option value="">Semua bioskop</option>${cinemas.map((c) => `<option value="${c.id}">${esc(c.name.replace('MARR Cinema ', ''))}</option>`).join('')}</select></div></div>
    <div class="bar-t"><span class="muted" id="sum"></span><div class="fld"><button class="btn ghost sm" id="gen">Generate 7 hari otomatis</button><button class="btn ghost sm" id="bulk">Jadwal massal</button><button class="btn" id="add">+ Jadwal</button></div></div><div id="list"></div></div>`;
  const list = view.querySelector('#list');
  const load = async () => {
    const q = new URLSearchParams({ date: S.date, ...(S.movieId ? { movieId: S.movieId } : {}), ...(S.cinemaId ? { cinemaId: S.cinemaId } : {}) });
    rows = await api('/showtimes?' + q); if (stale()) return;
    view.querySelector('#sum').textContent = `${dayLabel(S.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${rows.length} pertunjukan · ${rows.reduce((a, r) => a + r.taken, 0)} kursi terisi`;
    const g = {}; rows.forEach((r) => ((g[r.cinema] ||= {})[r.studio] ||= []).push(r));
    list.innerHTML = Object.entries(g).map(([cn, ss]) => `<section class="panel grp"><h3>${esc(cn)}</h3>${Object.entries(ss).map(([sn, rs]) => `<div class="tbl-w mt"><table class="t"><thead><tr><th colspan="5" style="text-transform:none;font-size:13.5px;color:var(--text)">${esc(sn)}${sn !== rs[0].kind ? ` · <span class="muted">${rs[0].kind}</span>` : ''}</th></tr></thead><tbody>
      ${rs.map((r) => { const p = Math.round(r.taken / r.capacity * 100); return `<tr><td data-l="Jam"><b>${tm(r.startsAt, r.tz)}</b> <span class="muted">${TZL[r.tz]}</span></td><td data-l="Film">${esc(r.title)}<small>${r.durationMin} mnt</small></td><td data-l="Harga">${rp(r.price)}</td>
        <td data-l="Terisi" class="full"><div class="pb"><div class="track ${p >= 100 ? 'full' : p >= 70 ? 'warn' : ''}"><i style="--w:${p}%"></i></div><span>${r.taken}/${r.capacity}</span></div></td>
        <td class="act"><div class="acts"><button class="btn ghost sm" data-e="${r.id}">Ubah</button><button class="btn danger sm" data-x="${r.id}">Hapus</button></div></td></tr>`; }).join('')}</tbody></table></div>`).join('')}</section>`).join('') || '<div class="empty">Belum ada jadwal pada tanggal ini. Gunakan tombol <b>+ Jadwal</b> atau <b>Jadwal massal</b>.</div>';
    list.querySelectorAll('[data-e]').forEach((b) => b.onclick = () => edit(rows.find((r) => r.id == b.dataset.e)));
    list.querySelectorAll('[data-x]').forEach((b) => b.onclick = guard(async () => {
      const r = rows.find((x) => x.id == b.dataset.x);
      const c = await confirmBox({ title: 'Hapus jadwal?', message: `${esc(r.title)} · ${tm(r.startsAt, r.tz)} ${TZL[r.tz]} di ${esc(r.cinema)} (${esc(r.studio)}).`, ok: 'Hapus', danger: true }); if (!c) return;
      await api('/showtimes/' + r.id, { method: 'DELETE' }); toast('Jadwal dihapus.', true); await load();
    }));
  };
  const go = guard(load);
  const setDate = (d) => { S.date = d; view.querySelector('#dt').value = d; go(); };
  view.querySelector('#dt').onchange = (e) => e.target.value && setDate(e.target.value);
  view.querySelector('#pd').onclick = () => setDate(addDays(S.date, -1)); view.querySelector('#nd').onclick = () => setDate(addDays(S.date, 1)); view.querySelector('#td').onclick = () => setDate(ymdNow());
  view.querySelector('#fm').onchange = (e) => { S.movieId = e.target.value; go(); }; view.querySelector('#fc').onchange = (e) => { S.cinemaId = e.target.value; go(); };
  view.querySelector('#gen').onclick = guard(async () => {
    const c = await confirmBox({ title: 'Generate jadwal otomatis?', message: 'Membuat jadwal 7 hari ke depan untuk semua film berstatus <b>Sedang tayang</b> di slot yang masih kosong. Jadwal yang sudah ada tidak diubah.', ok: 'Generate' }); if (!c) return;
    const r = await api('/showtimes/generate', { method: 'POST', body: { days: 7 } }); toast(`${r.created} jadwal baru dibuat.`, true); await load();
  });
  const studioOptions = (sel) => cinemas.map((c) => `<optgroup label="${esc(c.name)}">${c.studios.map((s) => `<option value="${s.id}" ${s.id == sel ? 'selected' : ''}>${esc(s.name)} (${s.kind}) · ${rp(s.basePrice)}</option>`).join('')}</optgroup>`).join('');
  const bind = (fm, fn, okMsg) => {
    const save = async (e) => { e?.preventDefault(); if (!fm.reportValidity()) return; const btn = dlg.querySelector('#sv'); btn.disabled = true;
      try { const r = await fn(fm); closeModal(); toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, true); await load(); } catch (ex) { if (!ex.silent) dlg.querySelector('#fe').textContent = ex.message; btn.disabled = false; } };
    fm.onsubmit = save; dlg.querySelector('#sv').onclick = save;
  };
  view.querySelector('#add').onclick = () => {
    modal('Tambah jadwal', `<form id="af"><label class="field"><span>Film *</span><select class="input" name="movieId" required>${nowMovies.map((m) => `<option value="${m.id}">${esc(m.title)} (${m.durationMin} mnt)</option>`).join('')}</select></label>
      <label class="field"><span>Studio *</span><select class="input" name="studioId" required>${studioOptions()}</select></label>
      <div class="f3"><label class="field"><span>Tanggal *</span><input class="input" type="date" name="date" required value="${S.date}"></label><label class="field"><span>Jam * (waktu setempat)</span><input class="input" type="time" name="time" required value="18:00"></label><label class="field"><span>Harga (Rp)</span><input class="input" type="number" name="price" min="0" placeholder="harga dasar"></label></div>
      <div class="help">Sistem menolak jadwal yang bentrok dengan pertunjukan lain di studio yang sama (durasi film + jeda 15 menit).</div><div class="form-err" id="fe" role="alert"></div></form>`,
      '<button class="btn ghost" data-close>Batal</button><button class="btn" id="sv">Simpan</button>');
    bind(dlg.querySelector('#af'), (fm) => { const b = Object.fromEntries(new FormData(fm)); if (b.price === '') delete b.price; return api('/showtimes', { method: 'POST', body: b }); }, 'Jadwal ditambahkan.');
  };
  view.querySelector('#bulk').onclick = () => {
    const presets = ['10:30', '13:00', '15:30', '18:00', '20:30', '22:30'];
    modal('Jadwal massal', `<form id="bf"><label class="field"><span>Film *</span><select class="input" name="movieId" required>${nowMovies.map((m) => `<option value="${m.id}">${esc(m.title)} (${m.durationMin} mnt)</option>`).join('')}</select></label>
      <p class="muted" style="font-size:13px;margin-bottom:6px">Studio *</p>${cinemas.map((c) => `<div style="margin-bottom:10px"><b style="font-size:14px">${esc(c.name)}</b><div class="chipset" style="margin-top:6px">${c.studios.map((s) => `<label class="chk"><input type="checkbox" name="studio" value="${s.id}"> ${esc(s.name)}</label>`).join('')}</div></div>`).join('')}
      <div class="f2"><label class="field"><span>Dari tanggal *</span><input class="input" type="date" name="from" required value="${S.date}"></label><label class="field"><span>Sampai tanggal *</span><input class="input" type="date" name="to" required value="${addDays(S.date, 6)}"></label></div>
      <p class="muted" style="font-size:13px;margin-bottom:6px">Jam tayang * (waktu setempat bioskop)</p><div class="chipset" id="tms">${presets.map((t) => `<label class="chk"><input type="checkbox" name="time" value="${t}" ${['13:00', '18:00'].includes(t) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
      <div class="fld" style="margin:10px 0 14px"><input class="input sm" type="time" id="ct" style="max-width:140px" aria-label="Jam lain"><button type="button" class="btn ghost sm" id="ctb">+ Tambah jam</button></div>
      <label class="field"><span>Harga (Rp) — kosongkan untuk harga dasar studio (+ tambahan akhir pekan)</span><input class="input" type="number" name="price" min="0"></label>
      <div class="help" id="est"></div><div class="form-err" id="fe" role="alert"></div></form>`,
      '<button class="btn ghost" data-close>Batal</button><button class="btn" id="sv">Buat jadwal</button>', true);
    const fm = dlg.querySelector('#bf');
    const sel = (n) => [...fm.querySelectorAll(`[name=${n}]:checked`)].map((i) => i.value);
    const rangeDays = () => { const a = fm.from.value, b = fm.to.value; if (!a || !b || b < a) return []; const out = []; for (let d = a, i = 0; d <= b && i < 62; d = addDays(d, 1), i++) out.push(d); return out; };
    const est = () => { const n = sel('studio').length * rangeDays().length * sel('time').length; dlg.querySelector('#est').textContent = `Akan dicoba membuat sampai ${n} jadwal (yang bentrok/duplikat dilewati).`; };
    fm.addEventListener('change', est); est();
    dlg.querySelector('#ctb').onclick = () => { const t = dlg.querySelector('#ct').value; if (!t || fm.querySelector(`[name=time][value="${t}"]`)) return; dlg.querySelector('#tms').insertAdjacentHTML('beforeend', `<label class="chk"><input type="checkbox" name="time" value="${t}" checked> ${t}</label>`); est(); };
    bind(fm, async () => {
      const days = rangeDays(); if (days.length > 31) throw new Error('Rentang maksimal 31 hari.');
      const body = { movieId: fm.movieId.value, studioIds: sel('studio'), dates: days, times: sel('time'), price: fm.price.value };
      if (!body.studioIds.length || !body.times.length || !days.length) throw new Error('Pilih minimal satu studio, rentang tanggal valid, dan satu jam.');
      return api('/showtimes/bulk', { method: 'POST', body });
    }, (r) => `${r.created} jadwal dibuat${r.skipped ? `, ${r.skipped} dilewati (bentrok/duplikat)` : ''}.`);
  };
  function edit(r) {
    const locked = r.activeOrders > 0;
    const local = new Intl.DateTimeFormat('sv-SE', { timeZone: r.tz, dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(r.startsAt)).split(' ');
    modal('Ubah jadwal', `<form id="ef">${locked ? `<p class="note" style="color:var(--gold)">Sudah ada ${r.activeOrders} pesanan aktif/lunas — hanya <b>harga</b> yang dapat diubah.</p>` : ''}
      <label class="field"><span>Film</span><select class="input" name="movieId" ${locked ? 'disabled' : ''}>${movies.filter((m) => m.status !== 'archived').map((m) => `<option value="${m.id}" ${m.id === r.movieId ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select></label>
      <label class="field"><span>Studio</span><select class="input" name="studioId" ${locked ? 'disabled' : ''}>${studioOptions(r.studioId)}</select></label>
      <div class="f3"><label class="field"><span>Tanggal</span><input class="input" type="date" name="date" value="${local[0]}" ${locked ? 'disabled' : ''}></label><label class="field"><span>Jam</span><input class="input" type="time" name="time" value="${local[1]}" ${locked ? 'disabled' : ''}></label><label class="field"><span>Harga (Rp)</span><input class="input" type="number" name="price" min="0" required value="${r.price}"></label></div><div class="form-err" id="fe" role="alert"></div></form>`,
      '<button class="btn ghost" data-close>Batal</button><button class="btn" id="sv">Simpan</button>');
    bind(dlg.querySelector('#ef'), (fm) => { const b = { price: fm.price.value }; if (!locked) Object.assign(b, { movieId: fm.movieId.value, studioId: fm.studioId.value, date: fm.date.value, time: fm.time.value }); return api('/showtimes/' + r.id, { method: 'PUT', body: b }); }, 'Jadwal diperbarui.');
  }
  await load();
  return { refresh: () => { if (!dlg.open) load().catch(() => {}); } };
}

/* ================= PENGATURAN ================= */
async function pengaturan(view, stale) {
  const s = await api('/settings'); if (stale()) return;
  view.innerHTML = `<form id="sf" class="grid fadein" style="max-width:760px">
    <section class="panel"><h2 style="margin-bottom:6px">Penjualan</h2>
      <div class="sw"><div><b>Penjualan tiket dibuka</b><small>Matikan untuk menutup pemesanan baru (mis. saat maintenance).</small></div><label class="switch"><input type="checkbox" name="bookingOpen" ${s.bookingOpen ? 'checked' : ''} aria-label="Penjualan dibuka"><i></i></label></div>
      <label class="field" style="margin-top:14px"><span>Pengumuman di website (tampil sebagai banner, kosongkan untuk menyembunyikan)</span><input class="input" name="announcement" maxlength="300" value="${esc(s.announcement)}" placeholder="Mis. Libur Natal: semua studio buka 09.00–24.00"></label></section>
    <section class="panel"><h2 style="margin-bottom:14px">Harga & pembayaran</h2>
      <div class="f2"><label class="field"><span>Biaya layanan per tiket (Rp)</span><input class="input" type="number" name="serviceFee" min="0" value="${s.serviceFee}"></label>
        <label class="field"><span>Tambahan harga akhir pekan (Rp)</span><input class="input" type="number" name="weekendSurcharge" min="0" value="${s.weekendSurcharge}"><div class="help">Dipakai saat jadwal dibuat otomatis / massal.</div></label>
        <label class="field"><span>Batas waktu bayar (menit)</span><input class="input" type="number" name="payWindowMin" min="3" max="120" value="${s.payWindowMin}"></label>
        <label class="field"><span>Batas verifikasi admin (jam)</span><input class="input" type="number" name="verifyWindowHours" min="1" max="72" value="${s.verifyWindowHours}"><div class="help">Setelah pelanggan menekan "sudah bayar".</div></label>
        <label class="field"><span>Maks. kursi per pesanan</span><input class="input" type="number" name="maxSeats" min="1" max="10" value="${s.maxSeats}"></label></div></section>
    <section class="panel"><h2 style="margin-bottom:6px">QRIS</h2><p class="muted" style="font-size:13.5px;margin-bottom:12px">Teks merchant yang tampil di halaman pembayaran. Gambar kode QR ada di <code>public/img/qris.png</code> — timpa file itu bila QRIS berganti.</p>
      <div class="f2"><label class="field"><span>Nama merchant</span><input class="input" name="merchantName" required maxlength="80" value="${esc(s.merchantName)}"></label><label class="field"><span>NMID</span><input class="input" name="merchantNmid" required maxlength="80" value="${esc(s.merchantNmid)}"></label></div></section>
    <div class="form-err" id="fe" role="alert"></div><div><button class="btn" id="sv">Simpan pengaturan</button></div></form>`;
  const fm = view.querySelector('#sf');
  fm.onsubmit = async (e) => {
    e.preventDefault(); const btn = fm.querySelector('#sv'); btn.disabled = true; fm.querySelector('#fe').textContent = '';
    const b = Object.fromEntries(new FormData(fm)); b.bookingOpen = fm.bookingOpen.checked;
    try { const r = await api('/settings', { method: 'PUT', body: b }); setSales(r.bookingOpen); toast('Pengaturan disimpan.', true); }
    catch (ex) { if (!ex.silent) fm.querySelector('#fe').textContent = ex.message; } finally { btn.disabled = false; }
  };
}

/* tooltip grafik: satu elemen, dijepit di dalam layar (aman untuk mobile & sentuhan) */
const tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl);
let tipT;
function showTip(el) {
  tipEl.textContent = el.dataset.tip; tipEl.classList.add('on');
  const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  tipEl.style.top = Math.max(8, r.top - h - 8) + 'px';
}
const hideTip = () => tipEl.classList.remove('on');
document.addEventListener('mouseover', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) showTip(t); });
document.addEventListener('mouseout', (e) => { if (e.target.closest?.('[data-tip]')) hideTip(); });
document.addEventListener('focusin', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) showTip(t); });
document.addEventListener('focusout', hideTip);
document.addEventListener('click', (e) => { const t = e.target.closest?.('[data-tip]'); if (t) { showTip(t); clearTimeout(tipT); tipT = setTimeout(hideTip, 2500); } else hideTip(); });
window.addEventListener('scroll', hideTip, { passive: true });

window.addEventListener('DOMContentLoaded', boot);
