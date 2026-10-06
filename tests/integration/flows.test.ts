import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getS3Client, sealCredential } from '@/lib/connections';
import { generatePublicToken } from '@/lib/public-links';
import { rotateToken } from '@/lib/public-links/rotate';
import { cleanOrphans } from '@/lib/maintenance/orphans';
import { readTextFile, writeTextFile } from '@/lib/preview';
import { buildObjectKey, prepareUpload, registerUpload } from '@/lib/uploads';
import type { Actor } from '@/lib/auth';
import { fetchEventually } from '../helpers/http';
import { testBucketIsIsolated } from '../helpers/s3';

function stripQuotes(v: string | undefined): string {
  if (!v) return '';
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

const endpoint = stripQuotes(process.env.S3_ENDPOINT);
const accessKeyId = stripQuotes(process.env.S3_ACCESS_KEY_ID);
const secretAccessKey = stripQuotes(process.env.S3_SECRET_ACCESS_KEY);
const bucket = stripQuotes(process.env.S3_BUCKET) || 's3-explorer';

/** Endpoint reachable AND the test bucket is not shared with real data. */
let usable = false;

/** Token rotation, text editing, and orphan cleanup — all against real storage. */
describe('links, preview, and maintenance (integration)', () => {
  let connectionId = '';
  let userId = '';
  let token = '';
  let actor: Actor;

  beforeAll(async () => {
    if (!endpoint || !accessKeyId) return;
    try {
      await fetch(endpoint, { signal: AbortSignal.timeout(2000) });
    } catch {
      return;
    }
    if (!(await testBucketIsIsolated(bucket))) return;
    usable = true;

    const stamp = Date.now();
    connectionId = (
      await db.s3Connection.create({
        data: {
          label: `vitest-flows-${stamp}`,
          provider: 'minio',
          endpoint,
          region: stripQuotes(process.env.S3_REGION) || 'us-east-1',
          forcePathStyle: true,
          bucket,
          publicBaseUrl: `${endpoint}/${bucket}`,
          accessKeyIdEnc: sealCredential(accessKeyId),
          secretAccessKeyEnc: sealCredential(secretAccessKey),
          createdBy: 'vitest',
        },
        select: { id: true },
      })
    ).id;

    token = generatePublicToken();
    const user = await db.user.create({
      data: {
        email: `vitest-flows-${stamp}@example.com`,
        passwordHash: 'x',
        name: 'Vitest Flows',
        role: 'uploader',
        publicToken: token,
        assignedConnectionId: connectionId,
      },
      select: { id: true, email: true, name: true },
    });
    userId = user.id;
    actor = { id: user.id, email: user.email, name: user.name, role: 'uploader' };
  });

  afterAll(async () => {
    if (!connectionId) return;

    const client = await getS3Client(connectionId).catch(() => null);
    if (client) {
      // Sweep this suite's own objects only. A bare `files/` sweep would delete
      // real uploads and the other integration file's objects — the bucket is
      // shared and Vitest runs test files in parallel.
      //
      // The rotation test moves everything to a new namespace, so the original
      // token and the current one both have to be swept.
      const current = (
        await db.user.findUnique({ where: { id: userId }, select: { publicToken: true } })
      )?.publicToken;
      const prefixes = [token, current].filter((t): t is string => Boolean(t));
      for (const prefix of new Set(prefixes)) {
        const listed = await client
          .send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `files/${prefix}/` }))
          .catch(() => null);
        for (const item of listed?.Contents ?? []) {
          if (item.Key) {
            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: item.Key })).catch(() => {});
          }
        }
      }
      client.destroy();
    }
    if (userId) await db.user.delete({ where: { id: userId } }).catch(() => {});
    await db.s3Connection.delete({ where: { id: connectionId } }).catch(() => {});
  });

  /** Uploads a file through the real presign → PUT → register path. */
  async function upload(filename: string, body: string, contentType: string) {
    const target = await prepareUpload(actor, {
      filename,
      sizeBytes: BigInt(Buffer.byteLength(body)),
      contentType,
    });
    const res = await fetch(target.uploadUrl, {
      method: 'PUT',
      body,
      headers: { 'Content-Type': contentType },
    });
    expect(res.ok).toBe(true);
    return registerUpload(actor, { key: target.key });
  }

  it('rotates the token, moving objects so old links stop working', async (ctx) => {
    if (!usable) return ctx.skip();

    const file = await upload('rotate-me.txt', 'rotate payload', 'text/plain');
    const oldUrl = file.publicUrl;
    expect((await fetch(oldUrl)).status).toBe(200);

    const result = await rotateToken(userId);

    expect(result.newToken).not.toBe(token);
    expect(result.moved).toBe(1);
    expect(result.failed).toBe(0);

    // Old link is dead, new link serves the same bytes.
    expect((await fetch(oldUrl)).ok).toBe(false);

    const row = await db.uploadedFile.findUniqueOrThrow({ where: { id: file.id } });
    expect(row.key.startsWith(`files/${result.newToken}/`)).toBe(true);

    const newUrl = oldUrl.replace(token, result.newToken);
    expect(await fetchEventually(newUrl)).toBe(200);
    expect(await (await fetch(newUrl)).text()).toBe('rotate payload');

    token = result.newToken;
  });

  it('refuses to rotate a user that does not exist', async (ctx) => {
    if (!usable) return ctx.skip();
    await expect(rotateToken('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      /not found/i,
    );
  });

  it('saves an edited text file and refreshes its metadata', async (ctx) => {
    if (!usable) return ctx.skip();

    const file = await upload('editable.txt', 'before', 'text/plain');
    const read = await readTextFile(file.id, actor);
    expect(read.content).toBe('before');

    const updated = await writeTextFile(file.id, actor, 'after — longer content');
    expect(updated.sizeBytes).toBe(String(Buffer.byteLength('after — longer content')));
    expect(updated.etag).toBeTruthy();

    // The stored object really changed.
    expect((await readTextFile(file.id, actor)).content).toBe('after — longer content');

    const row = await db.uploadedFile.findUniqueOrThrow({ where: { id: file.id } });
    expect(row.sizeBytes).toBe(BigInt(Buffer.byteLength('after — longer content')));
  });

  it('refuses to edit a text file over 5 MB', async (ctx) => {
    if (!usable) return ctx.skip();

    // A row is enough: the size check runs before anything is fetched.
    const oversized = await db.uploadedFile.create({
      data: {
        ownerId: userId,
        connectionId,
        key: buildObjectKey(token, 'huge.txt'),
        filename: 'huge.txt',
        sizeBytes: 6n * 1024n * 1024n,
        contentType: 'text/plain',
      },
      select: { id: true },
    });

    await expect(readTextFile(oversized.id, actor)).rejects.toThrow(/5 MB/);
    await expect(writeTextFile(oversized.id, actor, 'tiny')).rejects.toThrow(/5 MB/);

    await db.uploadedFile.delete({ where: { id: oversized.id } });
  });

  it('reports an orphan object without deleting it on a dry run', async (ctx) => {
    if (!usable) return ctx.skip();

    const client = await getS3Client(connectionId);
    const orphanKey = `files/${token}/orphan-object.txt`;
    try {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: orphanKey, Body: 'nobody owns me' }),
      );
    } finally {
      client.destroy();
    }

    // graceMs 0 makes the just-written object eligible immediately.
    const dry = await cleanOrphans({ dryRun: true, graceMs: 0, connectionIds: [connectionId] });
    expect(dry.orphanObjects).toContain(orphanKey);
    expect(dry.deletedObjects).toBe(0);

    const stillThere = await getS3Client(connectionId);
    try {
      await expect(
        stillThere.send(new HeadObjectCommand({ Bucket: bucket, Key: orphanKey })),
      ).resolves.toBeDefined();
    } finally {
      stillThere.destroy();
    }

    const real = await cleanOrphans({ dryRun: false, graceMs: 0, connectionIds: [connectionId] });
    expect(real.orphanObjects).toContain(orphanKey);
    expect(real.deletedObjects).toBeGreaterThanOrEqual(1);

    const after = await getS3Client(connectionId);
    try {
      await expect(
        after.send(new HeadObjectCommand({ Bucket: bucket, Key: orphanKey })),
      ).rejects.toBeDefined();
    } finally {
      after.destroy();
    }

    // Idempotent: a second pass finds nothing new.
    const again = await cleanOrphans({ dryRun: true, graceMs: 0, connectionIds: [connectionId] });
    expect(again.orphanObjects).not.toContain(orphanKey);
  });

  it('removes a record whose object is missing', async (ctx) => {
    if (!usable) return ctx.skip();

    const ghost = await db.uploadedFile.create({
      data: {
        ownerId: userId,
        connectionId,
        key: buildObjectKey(token, 'never-uploaded.txt'),
        filename: 'never-uploaded.txt',
        sizeBytes: 10n,
        contentType: 'text/plain',
      },
      select: { id: true },
    });

    const dry = await cleanOrphans({ dryRun: true, graceMs: 0, connectionIds: [connectionId] });
    expect(dry.orphanRecords.map((row) => row.id)).toContain(ghost.id);

    await cleanOrphans({ dryRun: false, graceMs: 0, connectionIds: [connectionId] });
    expect(await db.uploadedFile.findUnique({ where: { id: ghost.id } })).toBeNull();
  });

  it('leaves a fresh object alone, because its upload may still be in flight', async (ctx) => {
    if (!usable) return ctx.skip();

    const client = await getS3Client(connectionId);
    const freshKey = `files/${token}/in-flight.txt`;
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: freshKey, Body: 'pending' }));
    } finally {
      client.destroy();
    }

    const report = await cleanOrphans({ dryRun: false, connectionIds: [connectionId] });
    expect(report.orphanObjects).not.toContain(freshKey);

    const cleanup = await getS3Client(connectionId);
    try {
      await cleanup.send(new DeleteObjectCommand({ Bucket: bucket, Key: freshKey }));
    } finally {
      cleanup.destroy();
    }
  });
});