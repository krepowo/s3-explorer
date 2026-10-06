import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getS3Client, sealCredential } from '@/lib/connections';
import { generatePublicToken } from '@/lib/public-links';
import {
  deleteFile,
  listFiles,
  listObjectKeys,
  prepareUpload,
  registerUpload,
  renameFile,
} from '@/lib/uploads';
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

/**
 * Exercises the real presign → PUT → register → rename → delete path against a
 * local S3 endpoint, writing throwaway rows to the real database.
 */
describe('uploads (integration)', () => {
  let connectionId = '';
  let userId = '';
  let ownerToken = '';
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
          label: `vitest-uploads-${stamp}`,
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

    ownerToken = generatePublicToken();
    const user = await db.user.create({
      data: {
        email: `vitest-uploads-${stamp}@example.com`,
        passwordHash: 'x',
        name: 'Vitest Uploader',
        role: 'uploader',
        publicToken: ownerToken,
        assignedConnectionId: connectionId,
      },
      select: { id: true, email: true, name: true },
    });
    userId = user.id;
    actor = { id: user.id, email: user.email, name: user.name, role: 'uploader' };
  });

  afterAll(async () => {
    if (!connectionId) return;

    // Remove the objects this suite left behind, then the fixtures.
    //
    // Scoped to this suite's own namespace on purpose. The bucket is shared
    // with real uploads and with the other integration file (Vitest runs files
    // in parallel), so a bare `files/` sweep deletes the developer's files and
    // pulls objects out from under a suite that is still running.
    const client = await getS3Client(connectionId).catch(() => null);
    if (client) {
      const keys = await listObjectKeys(connectionId, `files/${ownerToken}/`).catch(() => []);
      for (const key of keys) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
      }
      client.destroy();
    }
    if (userId) await db.user.delete({ where: { id: userId } }).catch(() => {});
    await db.s3Connection.delete({ where: { id: connectionId } }).catch(() => {});
  });

  /** Runs the browser half of the flow: PUT the bytes at the presigned URL. */
  async function put(url: string, body: string, contentType: string) {
    const res = await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': contentType } });
    expect(res.ok).toBe(true);
  }

  async function objectExists(key: string): Promise<boolean> {
    const client = await getS3Client(connectionId);
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    } finally {
      client.destroy();
    }
  }

  it('presigns, uploads, registers, and serves an anonymous public URL', async (ctx) => {
    if (!usable) return ctx.skip();

    const body = 'hello world';
    const target = await prepareUpload(actor, {
      filename: 'report.pdf',
      sizeBytes: BigInt(Buffer.byteLength(body)),
      contentType: 'application/pdf',
    });

    expect(target.filename).toBe('report.pdf');
    expect(target.key).toBe(`files/${ownerToken}/report.pdf`);

    await put(target.uploadUrl, body, 'application/pdf');
    const file = await registerUpload(actor, { key: target.key });

    expect(file.filename).toBe('report.pdf');
    expect(file.sizeBytes).toBe(String(Buffer.byteLength(body)));
    expect(file.contentType).toBe('application/pdf');
    expect(file.etag).toBeTruthy();

    // The point of the product: a guest fetches it with no account.
    const anon = await fetch(file.publicUrl);
    expect(anon.status).toBe(200);
    expect(await anon.text()).toBe(body);
  });

  it('auto-renames a colliding filename instead of overwriting', async (ctx) => {
    if (!usable) return ctx.skip();

    const target = await prepareUpload(actor, {
      filename: 'report.pdf',
      sizeBytes: 5n,
      contentType: 'application/pdf',
    });
    expect(target.filename).toBe('report-1.pdf');
    expect(target.key).toBe(`files/${ownerToken}/report-1.pdf`);

    await put(target.uploadUrl, 'other', 'application/pdf');
    const file = await registerUpload(actor, { key: target.key });
    expect(file.filename).toBe('report-1.pdf');
  });

  it('sanitises a traversal attempt into the owner namespace', async (ctx) => {
    if (!usable) return ctx.skip();

    const target = await prepareUpload(actor, {
      filename: '../../etc/passwd',
      sizeBytes: 3n,
      contentType: 'text/plain',
    });

    expect(target.filename).toBe('passwd');
    expect(target.key).toBe(`files/${ownerToken}/passwd`);
  });

  it('rejects a file over the user limit before signing anything', async (ctx) => {
    if (!usable) return ctx.skip();

    await db.user.update({ where: { id: userId }, data: { uploadLimitBytes: 10n } });
    await expect(
      prepareUpload(actor, {
        filename: 'big.bin',
        sizeBytes: 1024n,
        contentType: 'application/octet-stream',
      }),
    ).rejects.toThrow(/upload limit/);
    await db.user.update({ where: { id: userId }, data: { uploadLimitBytes: null } });
  });

  it('lists every file in the shared pool', async (ctx) => {
    if (!usable) return ctx.skip();

    const listed = await listFiles({ search: 'report', limit: 50 });
    const names = listed.files.map((f) => f.filename);
    expect(names).toContain('report.pdf');
    expect(names).toContain('report-1.pdf');
    expect(listed.total).toBeGreaterThanOrEqual(2);
    expect(listed.files[0].ownerEmail).toBeTruthy();
  });

  it('renames by moving the object, so the old URL dies and the new one lives', async (ctx) => {
    if (!usable) return ctx.skip();

    const target = await prepareUpload(actor, {
      filename: 'before.txt',
      sizeBytes: 4n,
      contentType: 'text/plain',
    });
    await put(target.uploadUrl, 'data', 'text/plain');
    const file = await registerUpload(actor, { key: target.key });

    const renamed = await renameFile(file.id, 'after.txt', actor);

    expect(renamed.filename).toBe('after.txt');
    expect(renamed.publicUrl).not.toBe(file.publicUrl);
    expect(await objectExists(target.key)).toBe(false);
    expect(await fetchEventually(renamed.publicUrl)).toBe(200);

    const row = await db.uploadedFile.findUniqueOrThrow({ where: { id: file.id } });
    expect(row.key).toBe(`files/${ownerToken}/after.txt`);
  });

  it('deletes both the object and the record', async (ctx) => {
    if (!usable) return ctx.skip();

    const target = await prepareUpload(actor, {
      filename: 'doomed.txt',
      sizeBytes: 3n,
      contentType: 'text/plain',
    });
    await put(target.uploadUrl, 'bye', 'text/plain');
    const file = await registerUpload(actor, { key: target.key });

    await deleteFile(file.id, actor);

    expect(await db.uploadedFile.findUnique({ where: { id: file.id } })).toBeNull();
    expect(await objectExists(target.key)).toBe(false);
  });

  it('refuses a body that does not match the declared size', async (ctx) => {
    if (!usable) return ctx.skip();

    const target = await prepareUpload(actor, {
      filename: 'mismatch.bin',
      sizeBytes: 4n,
      contentType: 'application/octet-stream',
    });

    // The signed Content-Length makes S3 reject a larger body, so a client
    // cannot declare a small file and upload a huge one.
    const res = await fetch(target.uploadUrl, { method: 'PUT', body: 'way too long' });
    expect(res.ok).toBe(false);
  });

  it('refuses to register a key outside the caller namespace', async (ctx) => {
    if (!usable) return ctx.skip();

    await expect(registerUpload(actor, { key: 'files/someone-else/steal.txt' })).rejects.toThrow(
      /namespace/,
    );
  });
});