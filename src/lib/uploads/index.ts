import 'server-only';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '@/lib/db';
import { getUploadLimitBytes, type Actor } from '@/lib/auth';
import { getConnectionConfig, getS3Client } from '@/lib/connections';
import { buildPublicUrl } from '@/lib/public-links';
import { newPublicToken } from '@/lib/public-links/unique';
import {
  buildObjectKey,
  checkUploadLimit,
  filenameFromKey,
  keyBelongsToToken,
  nextAvailableFilename,
  sanitizeFilename,
} from './filename';

export * from './filename';

/** Presigned PUT lifetime. */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

export type UploadTarget = {
  key: string;
  filename: string;
  uploadUrl: string;
  expiresIn: number;
  /// Echoed back to /register so both halves use the same bucket.
  connectionId: string;
};

/**
 * The connection an upload goes through, in order of precedence:
 *
 *  1. the one an admin assigned to this user — a deliberate restriction, so it
 *     wins over anything the client asks for;
 *  2. `requestedId`, the choice made in the upload dialog;
 *  3. the primary connection, then the oldest active one.
 */
export async function resolveConnectionId(actor: Actor, requestedId?: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: actor.id },
    select: { assignedConnectionId: true },
  });
  if (user?.assignedConnectionId) return user.assignedConnectionId;

  if (requestedId) {
    const chosen = await db.s3Connection.findFirst({
      where: { id: requestedId, isActive: true },
      select: { id: true },
    });
    if (!chosen) throw new Error('That S3 connection is not available.');
    return chosen.id;
  }

  const fallback = await db.s3Connection.findFirst({
    where: { isActive: true },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  if (!fallback) throw new Error('No S3 connection is available. Ask an admin to add one.');

  return fallback.id;
}

/** The user's namespace token, created on first use if the row predates it. */
export async function ensurePublicToken(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { publicToken: true },
  });
  if (!user) throw new Error('User not found');
  if (user.publicToken) return user.publicToken;

  return (
    await db.user.update({
      where: { id: userId },
      data: { publicToken: await newPublicToken() },
      select: { publicToken: true },
    })
  ).publicToken!;
}

/** Reserves a free filename in the owner's namespace and presigns a PUT for it. */
export async function prepareUpload(
  actor: Actor,
  input: { filename: string; sizeBytes: bigint; contentType: string; connectionId?: string },
): Promise<UploadTarget> {
  const connectionId = await resolveConnectionId(actor, input.connectionId);

  const limit = await getUploadLimitBytes(actor.id);
  const withinLimit = checkUploadLimit(input.sizeBytes, limit);
  if (!withinLimit.ok) throw new Error(withinLimit.error);

  const token = await ensurePublicToken(actor.id);
  const existing = await db.uploadedFile.findMany({
    where: { ownerId: actor.id, connectionId },
    select: { filename: true },
  });

  const filename = nextAvailableFilename(
    sanitizeFilename(input.filename),
    existing.map((f) => f.filename),
  );
  const key = buildObjectKey(token, filename);

  const { bucket } = await getConnectionConfig(connectionId);
  const client = await getS3Client(connectionId);
  try {
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: input.contentType,
        // Signing the length makes S3 reject a body that does not match the
        // declared size, so the per-file limit cannot be bypassed client-side.
        ContentLength: Number(input.sizeBytes),
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
    return { key, filename, uploadUrl, expiresIn: UPLOAD_URL_TTL_SECONDS, connectionId };
  } finally {
    client.destroy();
  }
}

/** Confirms the object really landed in S3, then records it. */
export async function registerUpload(
  actor: Actor,
  input: { key: string; connectionId?: string },
): Promise<UploadedFileView> {
  // Must be the same connection the PUT was signed for, or the object is not
  // there and HeadObject fails — the client echoes back what presign returned.
  const connectionId = await resolveConnectionId(actor, input.connectionId);
  const token = await ensurePublicToken(actor.id);

  if (!keyBelongsToToken(input.key, token)) {
    throw new Error('Object key is outside your namespace.');
  }

  const connection = await getConnectionConfig(connectionId);
  const client = await getS3Client(connectionId);
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: connection.bucket, Key: input.key }),
    );

    const filename = filenameFromKey(input.key);
    const sizeBytes = BigInt(head.ContentLength ?? 0);
    const contentType = head.ContentType ?? 'application/octet-stream';

    const file = await db.uploadedFile.create({
      data: {
        ownerId: actor.id,
        connectionId,
        key: input.key,
        filename,
        sizeBytes,
        contentType,
        etag: head.ETag?.replace(/"/g, '') ?? null,
      },
      include: { owner: { select: { email: true, name: true } } },
    });

    return toFileView(file, connection.publicBaseUrl, token);
  } finally {
    client.destroy();
  }
}

type FileRow = {
  id: string;
  ownerId: string;
  connectionId: string;
  key: string;
  filename: string;
  sizeBytes: bigint;
  contentType: string;
  etag: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner?: { email: string; name: string } | null;
};

export type UploadedFileView = {
  id: string;
  filename: string;
  sizeBytes: string;
  contentType: string;
  etag: string | null;
  ownerId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  publicUrl: string;
  createdAt: Date;
};

/** Serialises a record for the client: bigint → string, plus the public URL. */
export function toFileView(row: FileRow, publicBaseUrl: string, ownerToken: string): UploadedFileView {
  return {
    id: row.id,
    filename: row.filename,
    sizeBytes: row.sizeBytes.toString(),
    contentType: row.contentType,
    etag: row.etag,
    ownerId: row.ownerId,
    ownerEmail: row.owner?.email ?? null,
    ownerName: row.owner?.name ?? null,
    publicUrl: buildPublicUrl(publicBaseUrl, ownerToken, row.filename),
    createdAt: row.createdAt,
  };
}

export type FileWithOwner = FileRow & {
  owner: { email: string; name: string; publicToken: string | null };
  connection: { publicBaseUrl: string };
};

/** Rebuilds the public URL for an already-loaded row. */
export function viewFromLoaded(row: FileWithOwner): UploadedFileView {
  return toFileView(row, row.connection.publicBaseUrl, row.owner.publicToken ?? '');
}

/**
 * Loads one file with its owner and connection. Every authenticated user may
 * read any file (shared pool); the actor argument documents the trust boundary.
 */
export async function getFileForActor(id: string, actor: Actor): Promise<FileWithOwner | null> {
  void actor;
  return db.uploadedFile.findUnique({
    where: { id },
    include: {
      owner: { select: { email: true, name: true, publicToken: true } },
      connection: { select: { publicBaseUrl: true } },
    },
  });
}

export type ListFilesQuery = {
  search?: string;
  contentType?: string;
  sort?: 'newest' | 'oldest' | 'name' | 'size';
  page?: number;
  limit?: number;
};

/** Shared pool listing: every user sees every file. */
export async function listFiles(query: ListFilesQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 24;
  const skip = (page - 1) * limit;

  const where = {
    ...(query.search ? { filename: { contains: query.search, mode: 'insensitive' as const } } : {}),
    ...(query.contentType ? { contentType: { startsWith: query.contentType } } : {}),
  };

  const orderBy =
    query.sort === 'oldest'
      ? { createdAt: 'asc' as const }
      : query.sort === 'name'
        ? { filename: 'asc' as const }
        : query.sort === 'size'
          ? { sizeBytes: 'desc' as const }
          : { createdAt: 'desc' as const };

  const [rows, total] = await Promise.all([
    db.uploadedFile.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        owner: { select: { email: true, name: true, publicToken: true } },
        connection: { select: { publicBaseUrl: true } },
      },
    }),
    db.uploadedFile.count({ where }),
  ]);

  return { files: rows.map(viewFromLoaded), total, page, limit };
}

/** Moves the object to a new name (copy+delete) so the old URL stops working. */
export async function renameFile(
  id: string,
  requestedName: string,
  actor: Actor,
): Promise<UploadedFileView> {
  const file = await getFileForActor(id, actor);
  if (!file) throw new Error('File not found');

  const token = file.owner.publicToken;
  if (!token) throw new Error('Owner has no public token.');

  const siblings = await db.uploadedFile.findMany({
    where: { ownerId: file.ownerId, connectionId: file.connectionId, id: { not: id } },
    select: { filename: true },
  });
  const filename = nextAvailableFilename(
    sanitizeFilename(requestedName),
    siblings.map((f) => f.filename),
  );
  if (filename === file.filename) return viewFromLoaded(file);

  const newKey = buildObjectKey(token, filename);
  const connection = await getConnectionConfig(file.connectionId);
  const client = await getS3Client(file.connectionId);

  try {
    await client.send(
      new CopyObjectCommand({
        Bucket: connection.bucket,
        CopySource: `${connection.bucket}/${encodeURIComponent(file.key)}`,
        Key: newKey,
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: connection.bucket, Key: file.key }));

    const updated = await db.uploadedFile.update({
      where: { id },
      data: { key: newKey, filename },
      include: {
        owner: { select: { email: true, name: true, publicToken: true } },
        connection: { select: { publicBaseUrl: true } },
      },
    });
    return viewFromLoaded(updated);
  } finally {
    client.destroy();
  }
}

/** Deletes the object first, then the record — orphans are swept by the cron job. */
export async function deleteFile(id: string, actor: Actor): Promise<{ key: string; filename: string }> {
  const file = await getFileForActor(id, actor);
  if (!file) throw new Error('File not found');

  const connection = await getConnectionConfig(file.connectionId);
  const client = await getS3Client(file.connectionId);
  try {
    await client.send(new DeleteObjectCommand({ Bucket: connection.bucket, Key: file.key }));
    await db.uploadedFile.delete({ where: { id } });
    return { key: file.key, filename: file.filename };
  } finally {
    client.destroy();
  }
}

/** Object keys present in the owner's namespace, straight from the bucket. */
export async function listObjectKeys(connectionId: string, prefix: string): Promise<string[]> {
  const connection = await getConnectionConfig(connectionId);
  const client = await getS3Client(connectionId);
  try {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: connection.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const item of page.Contents ?? []) if (item.Key) keys.push(item.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys;
  } finally {
    client.destroy();
  }
}
