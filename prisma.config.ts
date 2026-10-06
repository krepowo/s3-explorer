import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env files itself, and the CLI runs on Node, so load
// them here before reading the datasource URL. `.env.local` wins over `.env`.
for (const file of ['.env', '.env.local']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

// Migrations run against the direct (non-pooled) connection.
const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(migrationUrl ? { datasource: { url: migrationUrl } } : {}),
});
