/**
 * Seed: create the first admin user.
 * Usage: bun scripts/seed-admin.ts
 *   (or: npm run db:seed)
 *
 * Env vars (all optional — defaults shown):
 *   ADMIN_EMAIL=admin@example.com
 *   ADMIN_PASSWORD=changeme123
 *   ADMIN_NAME=Admin
 *
 * Bun loads .env.local automatically.
 */
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const email    = process.env.ADMIN_EMAIL    ?? 'admin@example.com';
const password = process.env.ADMIN_PASSWORD ?? 'changeme123';
const name     = process.env.ADMIN_NAME     ?? 'Admin';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const existing = await db.user.findUnique({ where: { email } });
if (existing) {
  console.log(`User ${email} already exists (role: ${existing.role}). Nothing done.`);
  await db.$disconnect();
  process.exit(0);
}

const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
const user = await db.user.create({
  data: { email, passwordHash, name, role: 'admin' },
  select: { id: true, email: true, name: true, role: true },
});

console.log('Created admin user:', user);
await db.$disconnect();
