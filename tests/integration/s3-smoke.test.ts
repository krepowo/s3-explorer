import { describe, expect, it, beforeAll } from 'vitest';
import { testConnection, type S3ConnectionConfig } from '@/lib/s3/client';

function stripQuotes(v: string | undefined): string {
  if (!v) return '';
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

// Runs only when a local S3 endpoint is configured; see README > Local development.
const config: S3ConnectionConfig | null = process.env.S3_ENDPOINT
  ? {
      endpoint: stripQuotes(process.env.S3_ENDPOINT),
      region: stripQuotes(process.env.S3_REGION) || 'us-east-1',
      bucket: stripQuotes(process.env.S3_BUCKET) || 's3-explorer',
      forcePathStyle: stripQuotes(process.env.S3_FORCE_PATH_STYLE) !== 'false',
      accessKeyId: stripQuotes(process.env.S3_ACCESS_KEY_ID),
      secretAccessKey: stripQuotes(process.env.S3_SECRET_ACCESS_KEY),
    }
  : null;

// The endpoint is often absent in CI and on machines where SeaweedFS is stopped,
// so probe it and skip rather than fail on an unreachable host.
let reachable = false;

describe.skipIf(!config)('s3 smoke', () => {
  beforeAll(async () => {
    if (!config) return;
    try {
      await fetch(config.endpoint, { method: 'GET', signal: AbortSignal.timeout(2000) });
      reachable = true;
    } catch {
      reachable = false;
    }
  });

  it('reaches the bucket with the configured credentials', async (ctx) => {
    if (!reachable) return ctx.skip();
    await expect(testConnection(config as S3ConnectionConfig)).resolves.toEqual({ ok: true });
  });

  it('reports a failure instead of throwing on bad credentials', async (ctx) => {
    if (!reachable) return ctx.skip();
    const bad = { ...(config as S3ConnectionConfig), secretAccessKey: 'wrong-secret' };
    const result = await testConnection(bad);
    expect(result.ok).toBe(false);
  });
});
