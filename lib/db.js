require('dotenv').config({ quiet: true });
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL belum diatur');
  // Di Vercel (serverless) tiap instance cukup 1 koneksi; gunakan connection string "pooled" dari Neon.
  const pool = new Pool({
    connectionString: url,
    max: process.env.VERCEL ? 1 : 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  // Adapter menulis Date sebagai timestamp tanpa zona → sesi HARUS UTC agar now()/expires_at/jadwal konsisten
  // (Neon default UTC, tetapi Postgres lokal bisa memakai WIB). SET dijalankan sekali per koneksi SEBELUM koneksi dipakai.
  const origConnect = pool.connect.bind(pool);
  pool.connect = function (cb) {
    const p = origConnect().then(async (client) => {
      if (!client.__utc) { await client.query("SET TIME ZONE 'UTC'"); client.__utc = true; }
      return client;
    });
    if (!cb) return p;
    p.then((c) => cb(undefined, c, (err) => c.release(err)), (e) => cb(e));
  };
  pool.on('error', (e) => console.error('[pg] idle client error:', e.message));
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// Singleton: aman terhadap hot-reload & reuse instance serverless
const prisma = (globalThis.__marrPrisma ||= make());
module.exports = { prisma, Prisma };
