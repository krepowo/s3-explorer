import { HeadBucketCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  countConnectionUsers,
  getConnectionMeta,
  getS3Client,
  sealCredential,
  toPublicConnection,
} from '@/lib/connections';
import { connectionSelect } from '@/lib/connections';
import { testConnection } from '@/lib/s3/client';

function stripQuotes(v: string | undefined): string {
  if (!v) return '';
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

const endpoint = stripQuotes(process.env.S3_ENDPOINT);
const accessKeyId = stripQuotes(process.env.S3_ACCESS_KEY_ID);
const secretAccessKey = stripQuotes(process.env.S3_SECRET_ACCESS_KEY);

let reachable = false;

// This suite writes a throwaway row to the real database, so it only runs when
// a local S3 endpoint is both configured and actually answering.
describe('connections (integration)', () => {
  let connectionId = '';
  let userId = '';

  beforeAll(async () => {
    if (!endpoint || !accessKeyId) return;
    try {
      await fetch(endpoint, { signal: AbortSignal.timeout(2000) });
      reachable = true;
    } catch {
      return;
    }

    const row = await db.s3Connection.create({
      data: {
        label: `vitest-${Date.now()}`,
        provider: 'minio',
        endpoint,
        region: stripQuotes(process.env.S3_REGION) || 'us-east-1',
        forcePathStyle: true,
        bucket: stripQuotes(process.env.S3_BUCKET) || 's3-explorer',
        publicBaseUrl: `${endpoint}/${stripQuotes(process.env.S3_BUCKET) || 's3-explorer'}`,
        accessKeyIdEnc: sealCredential(accessKeyId),
        secretAccessKeyEnc: sealCredential(secretAccessKey),
        createdBy: 'vitest',
      },
      select: { id: true },
    });
    connectionId = row.id;

    const user = await db.user.create({
      data: {
        email: `vitest-${Date.now()}@example.com`,
        passwordHash: 'x',
        name: 'Vitest User',
        assignedConnectionId: connectionId,
      },
      select: { id: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) await db.user.delete({ where: { id: userId } }).catch(() => {});
    if (connectionId) await db.s3Connection.delete({ where: { id: connectionId } }).catch(() => {});
  });

  it('builds a working client from a stored connection', async (ctx) => {
    if (!reachable) return ctx.skip();

    const client = await getS3Client(connectionId);
    try {
      const meta = await getConnectionMeta(connectionId);
      await expect(client.send(new HeadBucketCommand({ Bucket: meta.bucket }))).resolves.toBeDefined();
      await expect(
        client.send(new ListObjectsV2Command({ Bucket: meta.bucket, MaxKeys: 1 })),
      ).resolves.toBeDefined();
    } finally {
      client.destroy();
    }
  });

  it('reports success for stored credentials and failure for a wrong secret', async (ctx) => {
    if (!reachable) return ctx.skip();

    const row = await db.s3Connection.findUniqueOrThrow({ where: { id: connectionId } });
    const config = {
      endpoint: row.endpoint,
      region: row.region,
      bucket: row.bucket,
      forcePathStyle: row.forcePathStyle,
      accessKeyId: stripQuotes(accessKeyId),
      secretAccessKey: stripQuotes(secretAccessKey),
    };

    await expect(testConnection(config)).resolves.toEqual({ ok: true });
    await expect(testConnection({ ...config, secretAccessKey: 'wrong-secret' })).resolves.toMatchObject({
      ok: false,
    });
  });

  it('never returns credentials through the public shape', async (ctx) => {
    if (!reachable) return ctx.skip();

    const row = await db.s3Connection.findUniqueOrThrow({
      where: { id: connectionId },
      select: connectionSelect,
    });
    const pub = toPublicConnection(row);

    expect(pub.accessKeyMasked).toBe(`${accessKeyId.slice(0, 4)}****${accessKeyId.slice(-4)}`);
    const serialised = JSON.stringify(pub);
    expect(serialised).not.toContain(secretAccessKey);
    expect(serialised).not.toContain(accessKeyId);
    expect(serialised).not.toContain('Enc');
  });

  it('counts the users referencing a connection so deletion can be refused', async (ctx) => {
    if (!reachable) return ctx.skip();

    await expect(countConnectionUsers(connectionId)).resolves.toBe(1);
  });
});
