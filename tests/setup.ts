import { readFileSync } from 'node:fs';

// Vitest does not load .env files (Bun does at runtime), so tests would see an
// empty environment. Load them here, without overriding anything already set.
for (const file of ['.env.local', '.env']) {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    process.env[match[1]] ??= match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

// Strip surrounding double-quotes that the Hermes dev environment injects
// (e.g. S3_ACCESS_KEY_ID="admin" → admin).
for (const key of Object.keys(process.env)) {
  const val = process.env[key];
  if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
    process.env[key] = val.slice(1, -1);
  }
}
