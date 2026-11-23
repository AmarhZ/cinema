/* MARR Cinema — SPA vanilla JS (hash routing) */
'use strict';

const $app = document.getElementById('app');
const TZ_LABEL = { 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT' };
let cleanup = null;

/* ---------- util ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Terjadi kesalahan. Coba lagi.'), { status: res.status });
  return data;
}

function toast(msg, ok = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (ok ? ' ok' : '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

const fmtTime = (iso, tz) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).replace('.', ':');
const fmtDateLong = (iso, tz) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
const fmtYmd = (ymd, opts) => new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', ...opts }).format(new Date(ymd + 'T12:00:00Z'));
const tzl = (tz) => TZ_LABEL[tz] || '';
const fmtRelease = (ymd) => ymd ? fmtYmd(ymd.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
const dur = (m) => `${Math.floor(m / 60)}j ${m % 60}m`;

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sc = (v) => Number(v).toFixed(1);
const daysTo = (ymd) => Math.ceil((new Date(String(ymd).slice(0, 10) + 'T00:00:00+07:00') - Date.now()) / 864e5);

/* ---------- favorit (disimpan di perangkat) ---------- */
const favs = () => new Set(store.get('favs', []));
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
const favBtn = (slug, cls = 'fav') => `<button type="button" class="${cls}" data-fav="${esc(slug)}" aria-pressed="${favs().has(slug)}" aria-label="${favs().has(slug) ? 'Hapus dari favorit' : 'Simpan ke favorit'}">${HEART}${cls === 'favtxt btn ghost' ? '<span>Favorit</span>' : ''}</button>`;
function syncFavs() {
  const s = favs();
  document.querySelectorAll('[data-fav]').forEach((b) => { const on = s.has(b.dataset.fav); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Hapus dari favorit' : 'Simpan ke favorit'); });
  const n = document.getElementById('favCount'); if (n) { n.textContent = s.size; n.hidden = !s.size; }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-fav]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const s = favs(), slug = b.dataset.fav;
  s.has(slug) ? s.delete(slug) : s.add(slug);
  store.set('favs', [...s]); syncFavs();
  b.classList.remove('beat'); void b.offsetWidth; b.classList.add('beat');
  document.dispatchEvent(new CustomEvent('favchange'));
});
async function shareMovie(m) {
  const url = location.href.split('#')[0] + '#/film/' + m.slug, data = { title: m.title + ' · MARR Cinema', text: `Nonton ${m.title} di MARR Cinema`, url };
  try { if (navigator.share) { await navigator.share(data); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Tautan film disalin ✓', true); } catch { toast('Salin tautan dari bilah alamat browser.'); }
}

let posterSeq = 0;
function poster(m, small = false) {
  const inner = m.poster_url || m.posterUrl
    ? `<img src="${esc(m.poster_url || m.posterUrl)}" alt="Poster ${esc(m.title)}" loading="lazy">`
    : genPoster(m);
  return `<div class="poster ${small ? 'poster-sm' : ''}">${inner}${m.poster_url || m.posterUrl ? '' : `<div class="poster-title">${esc(m.title)}</div>`}</div>`;
}
// Poster generatif (dipakai jika poster_url kosong)
function genPoster(m) {
  const h = Number(m.hue ?? 10), id = 'p' + (++posterSeq), v = (m.id ?? m.title?.length ?? 0) % 3;
  const c1 = `hsl(${h} 55% 14%)`, c2 = `hsl(${(h + 35) % 360} 70% 36%)`, c3 = `hsl(${(h + 20) % 360} 90% 66%)`, dark = `hsl(${h} 50% 9%)`;
  let art = '';
  if (v === 0) art = `<circle cx="150" cy="170" r="84" fill="${c3}" opacity=".92"/>
    <path d="M0 270 Q75 240 150 268 T300 262 V450 H0Z" fill="${dark}" opacity=".55"/>
    <path d="M0 310 Q75 280 150 308 T300 300 V450 H0Z" fill="${dark}" opacity=".75"/>
    <path d="M0 350 Q75 322 150 348 T300 340 V450 H0Z" fill="${dark}"/>`;
  else if (v === 1) art = `<path d="M-10 330 L120 120 L210 260 L260 190 L320 330Z" fill="${dark}" opacity=".6"/>
    <circle cx="215" cy="110" r="38" fill="${c3}"/>
    <path d="M0 340 L100 220 L190 330 L240 270 L300 340 V450H0Z" fill="${dark}"/>
    ${[40, 90, 130, 200, 250].map((x, i) => `<circle cx="${x}" cy="${60 + (i * 37) % 90}" r="1.6" fill="#fff" opacity=".7"/>`).join('')}`;
  else art = [120, 92, 64, 38].map((r, i) => `<circle cx="150" cy="190" r="${r}" fill="none" stroke="${c3}" stroke-width="${i % 2 ? 2 : 6}" opacity="${0.35 + i * .2}"/>`).join('') +
    `<circle cx="150" cy="190" r="12" fill="${c3}"/><path d="M0 330 H300 V450 H0Z" fill="${dark}" opacity=".7"/>`;
  return `<svg viewBox="0 0 300 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="300" height="450" fill="url(#${id})"/>${art}</svg>`;
}

function movieCard(m) {
  const soon = m.status === 'soon', d = soon && m.release_date ? daysTo(m.release_date) : 0;
  return `<article class="card-movie"><a class="card-link" href="#/film/${esc(m.slug)}">
    <div style="position:relative">${poster(m)}
      <span class="badge age" style="position:absolute;top:10px;left:10px;z-index:2">${esc(m.age_rating)}</span>
      ${m.score ? `<span class="score">★ ${sc(m.score)}</span>` : ''}
    </div>
    <div class="meta"><h3>${esc(m.title)}</h3>
      <div class="sub">${soon ? `<span class="badge gold">Rilis ${esc(fmtYmd(m.release_date.slice(0, 10), { day: 'numeric', month: 'short' }))}</span>${d > 0 ? `<span class="cd">${d} hari lagi</span>` : ''}` : `<span>${esc(m.genres.join(' · '))}</span>`}</div>
    </div></a>${favBtn(m.slug)}</article>`;
}

const SKEL_HOME = '<div class="wrap"><div class="skel" style="height:340px;margin:32px 0 18px"></div><div class="skel" style="height:420px"></div></div>';
const loading = (t = 'Memuat…') => `<div class="loading"><div class="spin"></div>${esc(t)}</div>`;
const errorBox = (msg, back = '#/') => `<div class="wrap"><div class="empty" style="margin:60px 0"><p>${esc(msg)}</p><p style="margin-top:14px"><a class="btn ghost sm" href="${back}">Kembali</a></p></div></div>`;

/* ---------- animasi scroll-reveal ---------- */
let io = null;
function reveal(root = $app) {
  if (io) io.disconnect();
  const els = [...root.querySelectorAll('.card-movie,.step,.city-tile,.pay-banner,.cinema,.section-head,.slider,.sl-thumbs')].filter((e) => !e.classList.contains('in'));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || reduce) { els.forEach((e) => e.classList.add('in')); return; }
  io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
  els.forEach((e, i) => { e.setAttribute('data-rv', ''); e.style.setProperty('--d', (i % 6) * 70 + 'ms'); io.observe(e); });
}

/* ---------- router ---------- */
const routes = [
  [/^\/?$/, home, 'MARR Cinema — Pesan Tiket Bioskop Online'],
  [/^\/film\/?$/, films, 'Film'],
  [/^\/film\/([^/]+)$/, movie, 'Detail Film'],
  [/^\/lokasi\/([^/]+)$/, locationPage, 'Pilih Bioskop'],
  [/^\/bioskop\/?$/, cinemasPage, 'Bioskop'],
  [/^\/kursi\/(\d+)$/, seats, 'Pilih Kursi'],
  [/^\/bayar\/([A-Za-z0-9]+)$/, pay, 'Pembayaran'],
  [/^\/cek\/?$/, check, 'Cek Pesanan'],
];

async function route() {
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  const path = location.hash.replace(/^#/, '') || '/';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', path.startsWith('/' + a.dataset.nav) || (a.dataset.nav === 'film' && path.startsWith('/lokasi'))));
  for (const [re, fn, title] of routes) {
    const m = re.exec(path);
    if (m) {
      document.title = title + (title.startsWith('MARR') ? '' : ' · MARR Cinema');
      window.scrollTo(0, 0);
      $app.innerHTML = path === '/' ? SKEL_HOME : loading();
      try { cleanup = (await fn(...m.slice(1).map(decodeURIComponent))) || null; reveal(); }
      catch (e) { $app.innerHTML = errorBox(e.message); }
      return;
    }
  }
  $app.innerHTML = errorBox('Halaman tidak ditemukan.');
}
async function loadBanner() {
  try {
    const c = await api('/config'); const el = document.getElementById('banner');
    const msg = !c.bookingOpen ? 'Penjualan tiket sedang ditutup sementara. Silakan kembali beberapa saat lagi.' : c.announcement;
    if (msg) { el.textContent = msg; el.classList.toggle('closed', !c.bookingOpen); el.hidden = false; } else el.hidden = true;
  } catch {}
}
window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', () => { loadBanner(); syncFavs(); route(); });

/* ---------- Landing ---------- */
async function home() {
  const [now, soon, cities] = await Promise.all([api('/movies?status=now'), api('/movies?status=soon'), api('/cities')]);
  const feat = [...now].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  $app.innerHTML = `
  <section class="hero" style="--h:${feat ? feat.hue : 10}">
    <div class="wrap hero-in">
      <div>
        <span class="eyebrow">Tiket bioskop online</span>
        <h1>Nonton seru, <span>tanpa antre.</span></h1>
        <p class="lead">Pilih film, bioskop, dan kursi favoritmu dalam hitungan menit. Bayar praktis lewat QRIS dari aplikasi bank atau dompet digital apa pun.</p>
        <div class="hero-cta">
          <a class="btn" href="#/film">Lihat film tayang</a>
          <a class="btn ghost" href="#/bioskop">Cari bioskop</a>
        </div>
        <div class="hero-stats">
          <div><b data-count="${now.length}">${now.length}</b><span>film sedang tayang</span></div>
          <div><b data-count="${cities.reduce((a, c) => a + c.cinemas, 0)}">${cities.reduce((a, c) => a + c.cinemas, 0)}</b><span>bioskop di ${cities.length} kota</span></div>
          <div><b>QRIS</b><span>semua e-wallet &amp; m-banking</span></div>
        </div>
      </div>
      ${feat ? `<a class="hero-poster" href="#/film/${esc(feat.slug)}" aria-label="Lihat ${esc(feat.title)}"><span class="tag">★ ${sc(feat.score)} · Pilihan minggu ini</span>${poster(feat)}</a>` : ''}
    </div>
  </section>

  <section class="section"><div class="wrap">
    <div class="section-head"><div><h2>Sedang tayang</h2><p>Geser atau ketuk film untuk melihat jadwal 7 hari ke depan.</p></div><a class="btn ghost sm" href="#/film">Semua film →</a></div>
    ${now.length ? sliderHTML(now) : '<div class="empty">Belum ada film yang tayang.</div>'}
  </div></section>

  <section class="section band"><div class="wrap">
    <div class="section-head"><div><h2>Pesan dalam 4 langkah</h2></div></div>
    <div class="steps">
      <div class="step"><h3>Pilih film</h3><p>Lihat sinopsis, durasi, rating usia, dan pemeran.</p></div>
      <div class="step"><h3>Pilih bioskop</h3><p>Tentukan kota, tanggal, dan jam tayang yang cocok.</p></div>
      <div class="step"><h3>Pilih kursi</h3><p>Lihat denah studio dan ambil kursi terbaikmu.</p></div>
      <div class="step"><h3>Bayar via QRIS</h3><p>Scan, bayar, lalu e-tiket langsung muncul setelah terverifikasi.</p></div>
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <div class="section-head"><div><h2>Temukan bioskop di kotamu</h2></div></div>
    <div class="city-tiles">${cities.map((c) => `<button class="city-tile" data-city="${esc(c.city)}"><b>${esc(c.city)}</b><span>${c.cinemas} bioskop</span></button>`).join('')}</div>
  </div></section>

  ${soon.length ? `<section class="section" style="padding-top:0"><div class="wrap">
    <div class="section-head"><div><h2>Segera tayang</h2><p>Catat tanggalnya, tiket segera dibuka.</p></div></div>
    <div class="strip">${soon.map(movieCard).join('')}</div></div></section>` : ''}

  <section class="section" style="padding-top:0"><div class="wrap">
    <div class="pay-banner"><div><h3>Bayar semudah scan.</h3><p>Dukung QRIS: GoPay, OVO, DANA, ShopeePay, LinkAja, dan seluruh aplikasi m-banking.</p></div><a class="btn" href="#/film">Pesan sekarang</a></div>
  </div></section>`;
  $app.querySelectorAll('.city-tile').forEach((b) => b.addEventListener('click', () => { store.set('city', b.dataset.city); location.hash = '#/bioskop'; }));
  countUp($app);
  return initSlider(now.length);
}

/* ---------- Slider film sedang tayang ---------- */
const PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
const ARROW = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
function slideHTML(m, i, n) {
  const g = (m.genres || []).slice(0, 3).map((x) => `<span class="badge">${esc(x)}</span>`).join('');
  return `<article class="sl-slide${i === 0 ? ' on' : ''}" role="group" aria-roledescription="slide" aria-label="${i + 1} dari ${n}" style="--h:${Number(m.hue ?? 10)}">
    <div class="sl-bg" aria-hidden="true">${poster(m)}</div>
    <div class="sl-in">
      <div class="sl-copy">
        <span class="eyebrow" style="--k:0">Sedang tayang</span>
        <h3 class="sl-title" style="--k:1">${esc(m.title)}</h3>
        ${m.tagline ? `<p class="sl-tag" style="--k:2">“${esc(m.tagline)}”</p>` : ''}
        <div class="facts" style="--k:3"><span class="badge age">${esc(m.age_rating)}</span><span class="badge">${dur(m.duration_min)}</span>${g}${m.score ? `<span class="score">★ ${sc(m.score)}</span>` : ''}</div>
        <div class="sl-cta" style="--k:4"><a class="btn" href="#/lokasi/${esc(m.slug)}">🎟 Beli tiket</a><a class="btn ghost" href="#/film/${esc(m.slug)}">Detail film</a>${favBtn(m.slug, 'fav lg')}</div>
      </div>
      <a class="sl-poster" href="#/film/${esc(m.slug)}" tabindex="-1" aria-hidden="true">${poster(m)}</a>
    </div></article>`;
}
function sliderHTML(now) {
  const n = now.length;
  return `<section class="slider${n > 1 ? ' multi' : ''}" id="slider" tabindex="0" aria-roledescription="carousel" aria-label="Film sedang tayang">
    <div class="sl-viewport">${now.map((m, i) => slideHTML(m, i, n)).join('')}</div>
    ${n > 1 ? `<button class="sl-arrow prev" type="button" aria-label="Film sebelumnya">${ARROW('M15 5l-7 7 7 7')}</button><button class="sl-arrow next" type="button" aria-label="Film berikutnya">${ARROW('M9 5l7 7-7 7')}</button>
    <div class="sl-bar"><div class="sl-dots" role="group" aria-label="Pilih slide">${now.map((m, i) => `<button class="dot${i === 0 ? ' on' : ''}" type="button" data-i="${i}" aria-label="Slide ${i + 1}: ${esc(m.title)}"><i></i></button>`).join('')}</div>
      <div class="sl-ctl"><span class="sl-count"><b id="slc">01</b> / ${String(n).padStart(2, '0')}</span><button class="sl-play" id="slp" type="button" aria-label="Jeda slide otomatis"><span class="i-pause">${PAUSE}</span><span class="i-play">${PLAY}</span></button></div></div>` : ''}
  </section>
  ${n > 1 ? `<div class="sl-thumbs" id="slt" role="group" aria-label="Daftar film tayang">${now.map((m, i) => `<button class="thumb${i === 0 ? ' on' : ''}" type="button" data-i="${i}" aria-label="Tampilkan ${esc(m.title)}">${poster(m, true)}<span>${esc(m.title)}</span></button>`).join('')}</div>` : ''}`;
}
function initSlider(n) {
  const root = $app.querySelector('#slider'); if (!root || n < 2) return null;
  const slides = [...root.querySelectorAll('.sl-slide')], dots = [...root.querySelectorAll('.dot')], thumbs = [...$app.querySelectorAll('#slt .thumb')];
  const strip = $app.querySelector('#slt'), count = root.querySelector('#slc'), playBtn = root.querySelector('#slp');
  let cur = 0, userPaused = REDUCE, hover = false, focus = false, hidden = document.hidden, off = false;
  const apply = () => {
    slides.forEach((el, k) => { el.classList.toggle('on', k === cur); el.inert = k !== cur; el.setAttribute('aria-hidden', k !== cur); });
    dots.forEach((b, k) => { b.classList.toggle('on', k === cur); b.setAttribute('aria-current', k === cur); });
    thumbs.forEach((t, k) => t.classList.toggle('on', k === cur));
    count.textContent = String(cur + 1).padStart(2, '0');
    const t = thumbs[cur];
    if (t && strip && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: t.offsetLeft - (strip.clientWidth - t.clientWidth) / 2, behavior: REDUCE ? 'auto' : 'smooth' });
  };
  const go = (i, d) => {
    i = (i + n) % n; if (i === cur) return;
    root.style.setProperty('--dir', d ?? (i > cur ? 1 : -1));
    cur = i; apply();
  };
  const state = () => {
    root.classList.toggle('auto', !userPaused);
    root.classList.toggle('user-paused', userPaused);
    root.classList.toggle('is-paused', hover || focus || hidden || off);
    playBtn.setAttribute('aria-label', userPaused ? 'Putar slide otomatis' : 'Jeda slide otomatis');
  };
  // autoplay digerakkan animasi CSS pada penanda progres → otomatis berhenti saat dijeda
  root.querySelector('.sl-dots').addEventListener('animationend', (e) => { if (e.animationName === 'slFill' && e.target.parentElement.classList.contains('on')) go(cur + 1, 1); });
  root.querySelector('.prev').addEventListener('click', () => go(cur - 1, -1));
  root.querySelector('.next').addEventListener('click', () => go(cur + 1, 1));
  dots.forEach((b) => b.addEventListener('click', () => go(+b.dataset.i)));
  thumbs.forEach((b) => b.addEventListener('click', () => go(+b.dataset.i)));
  playBtn.addEventListener('click', () => { userPaused = !userPaused; state(); });
  root.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { go(cur + 1, 1); e.preventDefault(); } else if (e.key === 'ArrowLeft') { go(cur - 1, -1); e.preventDefault(); } });
  root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hover = true; state(); } });
  root.addEventListener('pointerleave', () => { hover = false; root.style.setProperty('--px', 0); root.style.setProperty('--py', 0); state(); });
  root.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) { focus = true; state(); } });
  root.addEventListener('focusout', () => { focus = false; state(); });
  // geser (swipe) untuk layar sentuh & drag mouse
  const vp = root.querySelector('.sl-viewport'); let sx = 0, sy = 0, dx = 0, dy = 0, drag = false, moved = false;
  vp.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; sx = e.clientX; sy = e.clientY; dx = dy = 0; drag = true; moved = false; });
  vp.addEventListener('pointermove', (e) => { if (!drag) return; dx = e.clientX - sx; dy = e.clientY - sy; });
  const endDrag = () => { if (!drag) return; drag = false; if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) { moved = true; go(cur + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); } };
  vp.addEventListener('pointerup', endDrag); vp.addEventListener('pointercancel', () => { drag = false; });
  vp.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  vp.addEventListener('dragstart', (e) => e.preventDefault());
  // efek paralaks poster (mouse saja)
  let raf = 0;
  if (!REDUCE) root.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || raf) return;
    raf = requestAnimationFrame(() => { raf = 0; const r = root.getBoundingClientRect(); root.style.setProperty('--px', ((e.clientX - r.left) / r.width - .5).toFixed(3)); root.style.setProperty('--py', ((e.clientY - r.top) / r.height - .5).toFixed(3)); });
  });
  const onVis = () => { hidden = document.hidden; state(); };
  document.addEventListener('visibilitychange', onVis);
  const io2 = 'IntersectionObserver' in window ? new IntersectionObserver(([en]) => { off = !en.isIntersecting; state(); }, { threshold: 0.25 }) : null;
  io2?.observe(root);
  apply(); state();
  return () => { document.removeEventListener('visibilitychange', onVis); io2?.disconnect(); cancelAnimationFrame(raf); };
}
function countUp(root) {
  if (REDUCE) return;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count), t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 900); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1 && el.isConnected) requestAnimationFrame(step); };
    el.textContent = '0'; requestAnimationFrame(step);
  });
}

/* ---------- Daftar film ---------- */
async function films() {
  const all = await api('/movies?status=all');
  const genres = [...new Set(all.flatMap((m) => m.genres))].sort();
  let tab = store.get('filmTab', 'now'), genre = '', q = '', sort = 'new';
  store.set('filmTab', 'now'); if (!['now', 'soon', 'fav'].includes(tab)) tab = 'now';
  $app.innerHTML = `<div class="wrap">
    <div class="page-head"><h1>Film</h1><p>Temukan tontonan untukmu.</p></div>
    <div class="toolbar">
      <div class="chips" role="tablist" aria-label="Status film">
        <button class="chip" role="tab" data-tab="now" aria-pressed="${tab === 'now'}">Sedang tayang</button>
        <button class="chip" role="tab" data-tab="soon" aria-pressed="${tab === 'soon'}">Segera tayang</button>
        <button class="chip" role="tab" data-tab="fav" aria-pressed="${tab === 'fav'}">♥ Favorit <span id="fc"></span></button>
      </div>
      <div class="tools">
        <select class="input sel" id="sort" aria-label="Urutkan film"><option value="new">Terbaru</option><option value="score">Rating tertinggi</option><option value="az">Judul A–Z</option><option value="dur">Durasi terpendek</option></select>
        <input class="input search" type="search" placeholder="Cari judul…" aria-label="Cari judul film">
      </div>
    </div>
    <div class="chips" id="gen" style="margin:-8px 0 20px"><button class="chip" data-g="" aria-pressed="true">Semua genre</button>${genres.map((g) => `<button class="chip" data-g="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join('')}</div>
    <p class="muted result-count" id="cnt" aria-live="polite"></p>
    <div id="list" class="grid-movies" style="padding-bottom:64px"></div></div>`;
  const list = $app.querySelector('#list');
  const SORTS = { new: () => 0, score: (a, b) => (b.score || 0) - (a.score || 0), az: (a, b) => a.title.localeCompare(b.title, 'id'), dur: (a, b) => a.duration_min - b.duration_min };
  const draw = () => {
    const fv = favs();
    $app.querySelector('#fc').textContent = fv.size ? `(${fv.size})` : '';
    const f = all.filter((m) => (tab === 'fav' ? fv.has(m.slug) : m.status === tab) && (!genre || m.genres.includes(genre)) && m.title.toLowerCase().includes(q.toLowerCase())).sort(SORTS[sort]);
    $app.querySelector('#cnt').textContent = f.length ? `${f.length} film` : '';
    list.innerHTML = f.length ? f.map(movieCard).join('') : `<div class="empty" style="grid-column:1/-1">${tab === 'fav' && !fv.size ? 'Belum ada favorit. Ketuk ikon ♥ pada poster film untuk menyimpannya di sini.' : 'Tidak ada film yang cocok.'}</div>`;
    reveal(list);
  };
  $app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; $app.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); }));
  $app.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => { genre = b.dataset.g; $app.querySelectorAll('[data-g]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); }));
  $app.querySelector('.search').addEventListener('input', (e) => { q = e.target.value; draw(); });
  $app.querySelector('#sort').addEventListener('change', (e) => { sort = e.target.value; draw(); });
  const onFav = () => { if (tab === 'fav') draw(); else $app.querySelector('#fc').textContent = favs().size ? `(${favs().size})` : ''; };
  document.addEventListener('favchange', onFav);
  draw();
  return () => document.removeEventListener('favchange', onFav);
}

/* ---------- Detail film ---------- */
async function movie(slug) {
  const m = await api('/movies/' + encodeURIComponent(slug));
  document.title = m.title + ' · MARR Cinema';
  const now = m.status === 'now';
  $app.innerHTML = `<section class="detail-hero" style="--h:${m.hue}"><div class="wrap detail">
    <div>${poster(m)}</div>
    <div>
      <a class="muted" href="#/film" style="font-size:14px">← Semua film</a>
      <h1 style="margin-top:10px">${esc(m.title)}</h1>
      ${m.tagline ? `<p class="tagline">“${esc(m.tagline)}”</p>` : ''}
      <div class="facts">
        <span class="badge age">${esc(m.age_rating)}</span>
        <span class="badge">${dur(m.duration_min)}</span>
        ${m.genres.map((g) => `<span class="badge">${esc(g)}</span>`).join('')}
        ${m.score ? `<span class="score">★ ${sc(m.score)}</span>` : ''}
      </div>
      <p class="synopsis">${esc(m.synopsis)}</p>
      <div class="actions">
        ${now ? `<a class="btn" href="#/lokasi/${esc(m.slug)}">🎟 Beli tiket — pilih bioskop</a>` : `<span class="badge gold" style="padding:10px 16px;font-size:14px">Tiket dibuka mendekati tanggal rilis ${esc(fmtRelease(m.release_date))}</span>`}
        ${favBtn(m.slug, 'favtxt btn ghost')}
        <button type="button" class="btn ghost" id="share"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>Bagikan</button>
      </div>
      <dl class="dl">
        <dt>Sutradara</dt><dd>${esc(m.director || '-')}</dd>
        <dt>Pemeran</dt><dd>${esc((m.cast_list || []).join(', ') || '-')}</dd>
        <dt>Bahasa</dt><dd>${esc(m.language || '-')}</dd>
        <dt>Subtitle</dt><dd>${esc(m.subtitle || '-')}</dd>
        <dt>Tanggal rilis</dt><dd>${esc(fmtRelease(m.release_date))}</dd>
        <dt>Durasi</dt><dd>${dur(m.duration_min)} (${m.duration_min} menit)</dd>
      </dl>
    </div></div></section>
    <section class="section" id="relwrap" hidden><div class="wrap"><div class="section-head"><div><h2>Film lain yang sedang tayang</h2><p>Mungkin kamu juga suka.</p></div></div><div class="strip" id="rel"></div></div></section>`;
  $app.querySelector('#share').addEventListener('click', () => shareMovie(m));
  api('/movies?status=now').then((list) => {
    const box = $app.querySelector('#rel'); if (!box) return;
    const gs = new Set(m.genres);
    const rel = list.filter((x) => x.slug !== m.slug).sort((a, b) => b.genres.filter((g) => gs.has(g)).length - a.genres.filter((g) => gs.has(g)).length).slice(0, 8);
    if (!rel.length) return;
    box.innerHTML = rel.map(movieCard).join(''); $app.querySelector('#relwrap').hidden = false; reveal($app.querySelector('#relwrap'));
  }).catch(() => {});
}

/* ---------- Pilih lokasi / bioskop & jadwal ---------- */
async function locationPage(slug) {
  const [m, cities, dates] = await Promise.all([api('/movies/' + encodeURIComponent(slug)), api('/cities'), api('/movies/' + encodeURIComponent(slug) + '/dates')]);
  if (m.status !== 'now') throw new Error('Tiket film ini belum dibuka.');
  if (!dates.length) throw new Error('Belum ada jadwal tayang untuk film ini.');
  let city = store.get('city', cities[0]?.city);
  if (!cities.some((c) => c.city === city)) city = cities[0]?.city;
  let date = dates[0];
  $app.innerHTML = `<div class="wrap">
    <div class="loc-head">${poster(m, true)}<div><a class="muted" href="#/film/${esc(m.slug)}" style="font-size:14px">← Detail film</a><h1>${esc(m.title)}</h1>
      <div class="facts" style="margin:6px 0 0"><span class="badge age">${esc(m.age_rating)}</span><span class="badge">${dur(m.duration_min)}</span><span class="muted" style="font-size:14px">${esc(m.genres.join(' · '))}</span></div></div></div>
    <p class="step-label">1 · Pilih kota</p>
    <div class="chips" id="cities">${cities.map((c) => `<button class="chip" data-c="${esc(c.city)}" aria-pressed="${c.city === city}">${esc(c.city)}</button>`).join('')}</div>
    <p class="step-label">2 · Pilih tanggal</p>
    <div class="dates" id="dates">${dates.map((d) => `<button class="date" data-d="${d}" aria-pressed="${d === date}"><small>${esc(fmtYmd(d, { weekday: 'short' }))}</small><b>${esc(fmtYmd(d, { day: 'numeric' }))}</b><small>${esc(fmtYmd(d, { month: 'short' }))}</small></button>`).join('')}</div>
    <p class="step-label">3 · Pilih bioskop &amp; jam tayang</p>
    <div id="cinemas" style="padding-bottom:64px"></div></div>`;
  const box = $app.querySelector('#cinemas');
  let seq = 0;
  async function draw() {
    const my = ++seq;
    box.innerHTML = '<div class="skel"></div>';
    let list;
    try { list = await api(`/movies/${encodeURIComponent(slug)}/showtimes?date=${date}&city=${encodeURIComponent(city)}`); }
    catch (e) { if (my === seq) box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (my !== seq) return;
    if (!list.length) { box.innerHTML = `<div class="empty">Tidak ada jadwal di ${esc(city)} pada tanggal ini. Coba tanggal atau kota lain.</div>`; return; }
    box.innerHTML = list.map((c) => `<article class="cinema">
      <div class="cinema-top"><div><h3>${esc(c.name)}</h3><div class="addr">📍 ${esc(c.address)}</div></div>
      <div class="facs">${c.facilities.map((f) => `<span class="badge">${esc(f)}</span>`).join('')}</div></div>
      <div class="times">${c.showtimes.map((s) => `<button class="time ${s.kind === 'Premier' ? 'premier' : ''}" data-id="${s.id}" ${s.available <= 0 ? 'disabled' : ''} aria-label="${fmtTime(s.startsAt, c.tz)} ${tzl(c.tz)}, ${esc(s.studio)}, ${rp(s.price)}">
        <b>${fmtTime(s.startsAt, c.tz)}</b><small>${tzl(c.tz)} · ${esc(s.studio)}</small><span class="p">${rp(s.price)}</span>
        ${s.available <= 0 ? '<span class="low">Penuh</span>' : s.available <= 10 ? `<span class="low">Sisa ${s.available} kursi</span>` : ''}
      </button>`).join('')}</div></article>`).join('');
    box.querySelectorAll('.time').forEach((b) => b.addEventListener('click', () => { location.hash = '#/kursi/' + b.dataset.id; }));
    reveal(box);
  }
  $app.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { city = b.dataset.c; store.set('city', city); $app.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); }));
  $app.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { date = b.dataset.d; $app.querySelectorAll('[data-d]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); }));
  draw();
}

/* ---------- Halaman bioskop ---------- */
async function cinemasPage() {
  const [list, cities] = await Promise.all([api('/cinemas'), api('/cities')]);
  let city = store.get('city', '');
  $app.innerHTML = `<div class="wrap"><div class="page-head"><h1>Bioskop</h1><p>Lokasi MARR Cinema terdekat darimu.</p></div>
    <div class="toolbar"><div class="chips"><button class="chip" data-c="" aria-pressed="${!city}">Semua kota</button>${cities.map((c) => `<button class="chip" data-c="${esc(c.city)}" aria-pressed="${c.city === city}">${esc(c.city)}</button>`).join('')}</div></div>
    <div id="cl" style="padding-bottom:64px"></div></div>`;
  const draw = () => {
    const f = list.filter((c) => !city || c.city === city);
    const byCity = {}; f.forEach((c) => (byCity[c.city] ||= []).push(c));
    $app.querySelector('#cl').innerHTML = Object.entries(byCity).map(([cty, cs]) => `<h2 class="city-title">${esc(cty)}</h2><div class="cin-grid">${cs.map((c) => `<article class="cinema" style="margin:0">
      <h3>${esc(c.name)}</h3><div class="addr">📍 ${esc(c.address)}</div>
      <div class="facs" style="margin-top:12px">${c.kinds.map((k) => `<span class="badge ${k === 'Premier' ? 'gold' : ''}">${esc(k)}</span>`).join('')}${c.facilities.map((f) => `<span class="badge">${esc(f)}</span>`).join('')}</div>
      <p class="muted" style="margin-top:14px;font-size:14px">Mulai dari <b style="color:var(--text)">${rp(c.from_price)}</b> · ${tzl(c.tz)}</p></article>`).join('')}</div>`).join('') || '<div class="empty">Belum ada bioskop.</div>';
    reveal($app.querySelector('#cl'));
  };
  $app.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { city = b.dataset.c; store.set('city', city); $app.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); }));
  draw();
}

/* ---------- Pilih kursi ---------- */
async function seats(id) {
  const [s, cfg] = await Promise.all([api('/showtimes/' + id), api('/config')]);
  if (s.started) throw new Error('Pertunjukan ini sudah dimulai.');
  const tz = s.cinema.tz, rowsL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const taken = new Set(s.taken), sel = new Set();
  const prem = s.kind === 'Premier', aisleAt = Math.floor(s.cols / 2);
  const saved = store.get('buyer', { name: '', email: '', phone: '' });

  $app.innerHTML = `<div class="wrap"><div class="book">
    <section class="panel">
      <a class="muted" href="#/lokasi/${esc(s.movie.slug)}" style="font-size:14px">← Ganti jadwal</a>
      <h2 style="margin:8px 0 2px;font-size:26px">Pilih kursi</h2>
      <p class="muted" style="margin-bottom:18px;font-size:14.5px">${esc(s.cinema.name)} · ${esc(s.studio)} · maksimal ${s.maxSeats} kursi</p>
      <div class="quick"><label class="field"><span>Jumlah penonton</span><select class="input sel" id="qn" aria-label="Jumlah kursi">${Array.from({ length: s.maxSeats }, (_, i) => `<option value="${i + 1}">${i + 1} orang</option>`).join('')}</select></label><button type="button" class="btn ghost sm" id="qp">✨ Pilihkan kursi terbaik</button></div>
      <div class="screen">LAYAR</div>
      <div class="seatmap" style="--cols:${s.cols}"><div class="seatrows" id="rows"></div></div>
      <p class="hint-scroll">↔ Geser denah ke samping bila kursi terpotong</p>
      <div class="legend"><span><i></i>Tersedia</span><span><i class="s"></i>Dipilih</span><span><i class="t"></i>Terisi</span>${prem ? '<span><i style="background:rgba(242,196,109,.3)"></i>Premier</span>' : ''}</div>
    </section>
    <aside class="panel summary sticky">
      <div class="minfo">${poster(s.movie, true)}<div><h3>${esc(s.movie.title)}</h3><p>${esc(fmtDateLong(s.startsAt, tz))}</p><p><b style="color:var(--text)">${fmtTime(s.startsAt, tz)} ${tzl(tz)}</b> · ${esc(s.studio)}${prem ? ' ✦' : ''}</p></div></div>
      <div class="seat-tags" id="tags"><span class="muted" style="font-size:14px">Belum ada kursi dipilih</span></div>
      <div id="sum"></div>
      <form id="f" novalidate style="margin-top:14px">
        <label class="field"><span>Nama lengkap</span><input class="input" name="name" autocomplete="name" required maxlength="80" value="${esc(saved.name)}"></label>
        <label class="field"><span>Email (e-tiket dikirim ke sini)</span><input class="input" name="email" type="email" autocomplete="email" required value="${esc(saved.email)}"></label>
        <label class="field"><span>No. WhatsApp</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0812xxxxxxxx" required value="${esc(saved.phone)}"></label>
        <div class="form-err" id="err" role="alert"></div>
        <button class="btn block" id="go" type="submit" disabled>Lanjut ke pembayaran</button>
      </form>
    </aside></div></div>
    <div class="mbar" id="mbar"><div><small id="mn">0 kursi</small><b id="mt">Rp 0</b></div><button class="btn" id="mnext" type="button">Isi data &amp; bayar</button></div>`;

  const rowsEl = $app.querySelector('#rows');
  let html = '';
  for (let r = 0; r < s.rows; r++) {
    html += `<div class="srow" style="--cols:${s.cols}"><span class="lbl">${rowsL[r]}</span>`;
    for (let c = 1; c <= s.cols; c++) {
      const lab = rowsL[r] + c, isT = taken.has(lab);
      html += `${c === aisleAt + 1 ? '<span class="aisle"></span>' : ''}<button type="button" class="seat ${isT ? 'taken' : ''} ${prem ? 'prem' : ''}" data-s="${lab}" ${isT ? 'disabled' : ''} aria-pressed="false" aria-label="Kursi ${lab}${isT ? ', terisi' : ''}">${c}</button>`;
    }
    html += `<span class="lbl">${rowsL[r]}</span></div>`;
  }
  rowsEl.innerHTML = html;

  const render = () => {
    const n = sel.size, sub = n * s.price, fee = n * cfg.serviceFee;
    $app.querySelector('#tags').innerHTML = n ? [...sel].sort().map((x) => `<span class="badge">${x}</span>`).join('') : '<span class="muted" style="font-size:14px">Belum ada kursi dipilih</span>';
    $app.querySelector('#sum').innerHTML = n ? `
      <div class="row"><span>${n} × ${rp(s.price)}</span><span>${rp(sub)}</span></div>
      <div class="row"><span>Biaya layanan (${n} × ${rp(cfg.serviceFee)})</span><span>${rp(fee)}</span></div>
      <div class="row total"><span>Total</span><span>${rp(sub + fee)}</span></div>
      <p class="faint" style="font-size:12.5px">Kode unik 1–99 ditambahkan saat pembayaran.</p>` : '';
    $app.querySelector('#go').disabled = !n;
    $app.querySelector('#mn').textContent = n + ' kursi · ' + [...sel].sort().join(', ');
    $app.querySelector('#mt').textContent = rp(sub + fee);
    $app.querySelector('#mbar').classList.toggle('show', n > 0);
    rowsEl.querySelectorAll('.seat:not(.taken)').forEach((b) => { const on = sel.has(b.dataset.s); b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); });
  };
  rowsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.seat'); if (!b || b.disabled) return;
    const k = b.dataset.s;
    if (sel.has(k)) sel.delete(k);
    else if (sel.size >= s.maxSeats) return toast(`Maksimal ${s.maxSeats} kursi per pesanan.`);
    else sel.add(k);
    render();
  });
  // Kursi terbaik: berdampingan, sedikit di belakang tengah studio, tanpa melewati lorong
  $app.querySelector('#qp').addEventListener('click', () => {
    const n = Number($app.querySelector('#qn').value) || 1, idealR = (s.rows - 1) * 0.62, mid = (s.cols + 1) / 2;
    let best = null;
    for (let r = 0; r < s.rows; r++) for (let c = 1; c + n - 1 <= s.cols; c++) {
      let ok = true;
      for (let k = 0; k < n; k++) { const cc = c + k; if (taken.has(rowsL[r] + cc) || (k && cc === aisleAt + 1)) { ok = false; break; } }
      if (!ok) continue;
      const score = Math.abs(r - idealR) * 2 + Math.abs(c + (n - 1) / 2 - mid);
      if (!best || score < best.score) best = { score, list: Array.from({ length: n }, (_, k) => rowsL[r] + (c + k)) };
    }
    if (!best) return toast(`Tidak ada ${n} kursi berdampingan yang kosong. Coba jumlah lebih sedikit atau pilih manual.`);
    sel.clear(); best.list.forEach((k) => sel.add(k)); render();
    rowsEl.querySelector(`[data-s="${best.list[0]}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: REDUCE ? 'auto' : 'smooth' });
  });
  $app.querySelector('#mnext').addEventListener('click', () => { const f = $app.querySelector('#f'); f.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => f.querySelector('input')?.focus({ preventScroll: true }), 450); });
  const form = $app.querySelector('#f'), err = $app.querySelector('#err');
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const d = Object.fromEntries(new FormData(form));
    const btn = $app.querySelector('#go'); btn.disabled = true; btn.textContent = 'Memproses…';
    try {
      const r = await api('/orders', { method: 'POST', body: { showtimeId: s.id, seats: [...sel], name: d.name, email: d.email, phone: d.phone } });
      store.set('buyer', { name: d.name, email: d.email, phone: d.phone });
      store.set('lastOrder', r.code);
      location.hash = '#/bayar/' + r.code;
    } catch (ex) {
      err.textContent = ex.message;
      btn.textContent = 'Lanjut ke pembayaran'; btn.disabled = !sel.size;
      if (ex.status === 409) { // refresh denah
        const fresh = await api('/showtimes/' + id).catch(() => null);
        if (fresh) { fresh.taken.forEach((k) => { taken.add(k); sel.delete(k); const el = rowsEl.querySelector(`[data-s="${k}"]`); if (el) { el.classList.add('taken'); el.disabled = true; } }); render(); }
      }
    }
  });
  render();
}

/* ---------- Pembayaran QRIS & e-tiket ---------- */
async function pay(code) {
  code = code.toUpperCase();
  let o = await api('/orders/' + code);
  document.title = 'Pembayaran ' + code + ' · MARR Cinema';
  let timer = null, poll = null, proofData = null, lastStatus = null;
  const stop = () => { clearInterval(timer); clearInterval(poll); };

  const summary = () => `<section class="panel summary">
    <div class="minfo">${poster(o.movie, true)}<div><h3>${esc(o.movie.title)}</h3><p>${esc(o.cinema.name)}</p><p>${esc(fmtDateLong(o.startsAt, o.cinema.tz))}, <b style="color:var(--text)">${fmtTime(o.startsAt, o.cinema.tz)} ${tzl(o.cinema.tz)}</b></p><p>${esc(o.studio)} · Kursi <b style="color:var(--text)">${esc(o.seats.join(', '))}</b></p></div></div>
    <div class="row"><span>Kode pesanan</span><span><b>${esc(o.code)}</b></span></div>
    <div class="row"><span>Tiket (${o.seats.length})</span><span>${rp(o.subtotal)}</span></div>
    <div class="row"><span>Biaya layanan</span><span>${rp(o.serviceFee)}</span></div>
    <div class="row"><span>Kode unik</span><span>${rp(o.uniqueCode)}</span></div>
    <div class="row total"><span>Total bayar</span><span>${rp(o.total)}</span></div></section>`;

  const view = () => {
    stop();
    lastStatus = o.status;
    if (o.status === 'paid') return ticketView();
    if (['expired', 'cancelled', 'rejected'].includes(o.status)) {
      const t = { expired: ['⌛', 'Waktu pembayaran habis', 'Kursi sudah dilepas. Silakan pesan ulang.'], cancelled: ['✕', 'Pesanan dibatalkan', 'Kursi sudah dilepas. Silakan pesan ulang.'], rejected: ['!', 'Pembayaran tidak dapat diverifikasi', 'Pembayaran Anda belum kami temukan. Jika sudah membayar, hubungi kami dengan menyebut kode pesanan ' + o.code + '.'] }[o.status];
      $app.innerHTML = `<div class="wrap" style="max-width:560px"><div class="panel status-box" style="margin:60px 0"><div class="ico" style="background:rgba(239,51,64,.15);color:#ff8a93">${t[0]}</div><h2>${t[1]}</h2><p class="muted" style="margin:10px 0 22px">${esc(t[2])}</p><a class="btn" href="#/lokasi/${esc(o.movie.slug)}">Pesan lagi</a></div></div>`;
    } else if (o.status === 'awaiting_verification') {
      $app.innerHTML = `<div class="wrap pay"><div class="panel status-box"><div class="spin"></div><h2>Menunggu verifikasi</h2>
        <p class="muted" style="margin:10px 0 18px">Terima kasih! Kami sedang mencocokkan pembayaran sebesar <b style="color:var(--text)">${rp(o.total)}</b>. E-tiket akan muncul otomatis di halaman ini setelah terverifikasi.</p>
        <p class="note">Simpan kode pesanan <b>${esc(o.code)}</b> — Anda bisa membukanya lagi lewat menu <a class="link" href="#/cek">Cek Pesanan</a>.</p></div>${summary()}</div>`;
    } else pendingView();
    if (!['expired', 'cancelled', 'rejected', 'paid'].includes(o.status)) poll = setInterval(refresh, 5000);
  };

  const refresh = async () => {
    try { const n = await api('/orders/' + code); if (n.status !== lastStatus) { o = n; view(); } else o = n; } catch {}
  };

  function pendingView() {
    $app.innerHTML = `<div class="wrap pay">
      <section class="panel">
        <div class="timer" id="timer"><span>⏱</span><div><small class="muted">Selesaikan pembayaran dalam</small><br><b id="tt">--:--</b></div></div>
        <h2>Bayar dengan QRIS</h2>
        <div class="qris-card"><img src="img/qris.png" alt="Kode QRIS ${esc(o.merchant.name)}" width="620" height="875"></div>
        <p style="text-align:center;margin-top:10px"><a class="link" href="img/qris.png" download="QRIS-${esc(o.merchant.name)}.png" style="font-size:14px">⬇ Simpan gambar QRIS</a> <span class="faint" style="font-size:13px">(untuk scan dari galeri)</span></p>
        <div class="amount"><div><small>Nominal yang harus dibayar</small><b id="amt">${rp(o.total)}</b></div><button class="btn ghost sm" id="copy" type="button">Salin</button></div>
        <p class="note">⚠ Masukkan nominal <b>persis ${rp(o.total)}</b> (termasuk kode unik ${o.uniqueCode}). QRIS ini tidak mengisi nominal otomatis, dan nominal yang sama persis membantu kami memverifikasi pembayaran Anda dengan cepat.</p>
      </section>
      <div style="display:grid;gap:20px">
        ${summary()}
        <section class="panel"><h2>Cara membayar</h2>
          <ol class="howto">
            <li>Buka aplikasi <b>m-banking / e-wallet</b> favoritmu, pilih <b>Scan QRIS</b>.</li>
            <li>Scan kode di samping (merchant <b>${esc(o.merchant.name)}</b>, NMID ${esc(o.merchant.nmid)}).</li>
            <li>Isi nominal <b>${rp(o.total)}</b>, lalu konfirmasi pembayaran.</li>
            <li>Kembali ke sini, (opsional) unggah bukti bayar, lalu tekan <b>Saya sudah bayar</b>.</li>
          </ol>
          <label class="upload" id="up"><input type="file" accept="image/*" id="file"><span id="uptxt">📎 Unggah bukti pembayaran (opsional, mempercepat verifikasi)</span></label>
          <div class="form-err" id="perr" role="alert"></div>
          <button class="btn block" id="paid">Saya sudah bayar</button>
          <p style="text-align:center;margin-top:14px"><button class="link muted" id="cancel" style="font-size:14px;color:var(--muted)">Batalkan pesanan</button></p>
        </section>
      </div></div>`;
    const tt = $app.querySelector('#tt'), tm = $app.querySelector('#timer');
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(o.expiresAt) - Date.now()) / 1000));
      tt.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
      tm.classList.toggle('urgent', left < 120);
      if (left === 0) { clearInterval(timer); refresh(); }
    };
    tick(); timer = setInterval(tick, 1000);
    $app.querySelector('#copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(String(o.total)); toast('Nominal disalin: ' + o.total, true); } catch { toast('Salin manual: ' + o.total); }
    });
    $app.querySelector('#file').addEventListener('change', async (e) => {
      const f = e.target.files[0]; const perr = $app.querySelector('#perr'); perr.textContent = '';
      if (!f) return;
      try { proofData = await compress(f); $app.querySelector('#uptxt').innerHTML = `✓ ${esc(f.name)}<img src="${proofData}" alt="Pratinjau bukti">`; }
      catch { proofData = null; perr.textContent = 'File tidak dapat dibaca sebagai gambar.'; }
    });
    $app.querySelector('#paid').addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Mengirim…';
      try { await api(`/orders/${code}/paid`, { method: 'POST', body: { proof: proofData } }); o = await api('/orders/' + code); view(); }
      catch (ex) { $app.querySelector('#perr').textContent = ex.message; btn.disabled = false; btn.textContent = 'Saya sudah bayar'; if (ex.status === 409) refresh(); }
    });
    $app.querySelector('#cancel').addEventListener('click', async () => {
      if (!confirm('Batalkan pesanan ini? Kursi akan dilepas.')) return;
      try { await api(`/orders/${code}/cancel`, { method: 'POST' }); o = await api('/orders/' + code); view(); } catch (ex) { toast(ex.message); }
    });
  }

  function ticketView() {
    $app.innerHTML = `<div class="wrap"><div class="ticket" id="ticket">
      <div class="ticket-main">
        <div><span class="badge green">✓ Pembayaran terverifikasi</span></div>
        <div><h1>${esc(o.movie.title)}</h1><p class="muted" style="margin-top:6px">${esc(o.cinema.name)}, ${esc(o.cinema.city)}</p></div>
        <div class="tgrid">
          <div><small>Tanggal</small><b>${esc(fmtDateLong(o.startsAt, o.cinema.tz))}</b></div>
          <div><small>Jam tayang</small><b>${fmtTime(o.startsAt, o.cinema.tz)} ${tzl(o.cinema.tz)}</b></div>
          <div><small>Studio</small><b>${esc(o.studio)}${o.studioKind === 'Premier' ? ' ✦' : ''}</b></div>
          <div><small>Kursi</small><b>${esc(o.seats.join(', '))}</b></div>
          <div><small>Nama</small><b>${esc(o.name)}</b></div>
          <div><small>Rating usia</small><b>${esc(o.movie.ageRating)}</b></div>
        </div>
        <p class="muted" style="font-size:13.5px">📍 ${esc(o.cinema.address)}<br>Tunjukkan QR ini di loket / pintu studio. Datang 15 menit sebelum film dimulai.</p>
        <div class="no-print" style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn sm" onclick="window.print()">Cetak / simpan PDF</button><a class="btn ghost sm" href="#/film">Pesan tiket lain</a></div>
      </div>
      <div class="ticket-stub"><img src="${o.ticketQr}" alt="QR e-tiket ${esc(o.code)}"><div class="code">${esc(o.code)}</div><small>Kode booking</small></div>
    </div></div>`;
  }

  async function compress(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 1100 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.78);
    } finally { URL.revokeObjectURL(url); }
  }

  view();
  return stop;
}

/* ---------- Cek pesanan ---------- */
function check() {
  const last = store.get('lastOrder', '');
  $app.innerHTML = `<div class="wrap"><div class="check"><h1 style="font-size:40px">Cek pesanan</h1>
    <p class="muted" style="margin-top:8px">Masukkan kode pesanan (contoh: MR7K3P9Q) untuk melihat status pembayaran atau e-tiketmu.</p>
    <form id="cf"><input class="input" name="code" placeholder="Kode pesanan" maxlength="12" required value="${esc(last)}" aria-label="Kode pesanan"><button class="btn">Cari</button></form></div></div>`;
  $app.querySelector('#cf').addEventListener('submit', (e) => { e.preventDefault(); const c = new FormData(e.target).get('code').trim(); if (/^[A-Za-z0-9]{4,12}$/.test(c)) location.hash = '#/bayar/' + c.toUpperCase(); else toast('Kode tidak valid.'); });
}


/* ---------- efek global: progres scroll, kembali ke atas, ripple, tilt kartu, tombol favorit ---------- */
(() => {
  const prog = document.getElementById('prog'), top = document.getElementById('totop'); let tick = false;
  const upd = () => { tick = false; const max = document.documentElement.scrollHeight - innerHeight; if (prog) prog.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`; top?.classList.toggle('show', scrollY > 700); };
  addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
  top?.addEventListener('click', () => scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' }));
  document.getElementById('navFav')?.addEventListener('click', (e) => { e.preventDefault(); store.set('filmTab', 'fav'); if (location.hash === '#/film') route(); else location.hash = '#/film'; });
  if (REDUCE) return;
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn'); if (!b || b.disabled) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, el = document.createElement('span');
    el.className = 'rip'; el.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(el); el.addEventListener('animationend', () => el.remove());
  });
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    $app.addEventListener('pointermove', (e) => {
      const c = e.target.closest?.('.card-movie'); if (!c) return; const r = c.getBoundingClientRect();
      c.style.setProperty('--ry', (((e.clientX - r.left) / r.width - .5) * 10).toFixed(1) + 'deg');
      c.style.setProperty('--rx', ((.5 - (e.clientY - r.top) / r.height) * 8).toFixed(1) + 'deg');
    });
    $app.addEventListener('pointerout', (e) => { const c = e.target.closest?.('.card-movie'); if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } });
  }
})();
