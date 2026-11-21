import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// DIRECT_URL = koneksi langsung Neon (tanpa "-pooler") untuk migrasi. DATABASE_URL = koneksi pooled untuk aplikasi.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? 'postgresql://placeholder@localhost:5432/placeholder' },
});
