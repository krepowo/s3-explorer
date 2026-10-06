import 'server-only';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '@/lib/db';
import { getConnectionConfig, getS3Client } from '@/lib/connections';
import { getFileForActor } from '@/lib/uploads';
import type { Actor } from '@/lib/auth';
import { checkEditable, detectKind, utf8Length, type FileKind } from './types';

export * from './types';

/** Presigned GET lifetime — long enough to load, short enough to leak nothing. */
export const CONTENT_URL_TTL_SECONDS = 5 * 60;

export type PreviewTarget = {
  id: string;
  filename: string;
  contentType: string;
  kind: FileKind;
  sizeBytes: string;
  editable: boolean;
  contentUrl: string;
  expiresIn: number;
};

/**
 * Everything the viewer needs for one file: how to render it and a short-lived
 * URL to fetch it. Credentials never leave the server — the URL is signed here.
 */
export async function getPreviewTarget(fileId: string, actor: Actor): Promise<PreviewTarget> {
  const file = await getFileForActor(fileId, actor);
  if (!file) throw new Error('File not found');

  const connection = await getConnectionConfig(file.connectionId);
  const client = await getS3Client(file.connectionId);
  try {
    const contentUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: connection.bucket, Key: file.key }),
      { expiresIn: CONTENT_URL_TTL_SECONDS },
    );

    const kind = detectKind(file.contentType, file.filename);
    return {
      id: file.id,
      filename: file.filename,
      contentType: file.contentType,
      kind,
      sizeBytes: file.sizeBytes.toString(),
      editable: kind === 'text' && checkEditable(file.sizeBytes).ok,
      contentUrl,
      expiresIn: CONTENT_URL_TTL_SECONDS,
    };
  } finally {
    client.destroy();
  }
}

/** Reads a text file for the editor. Refuses anything over the edit limit. */
export async function readTextFile(
  fileId: string,
  actor: Actor,
): Promise<{ filename: string; content: string; sizeBytes: string }> {
  const file = await getFileForActor(fileId, actor);
  if (!file) throw new Error('File not found');

  const withinLimit = checkEditable(file.sizeBytes);
  if (!withinLimit.ok) throw new Error(withinLimit.error);

  const connection = await getConnectionConfig(file.connectionId);
  const client = await getS3Client(file.connectionId);
  try {
    const object = await client.send(
      new GetObjectCommand({ Bucket: connection.bucket, Key: file.key }),
    );
    const content = (await object.Body?.transformToString('utf-8')) ?? '';

    return { filename: file.filename, content, sizeBytes: file.sizeBytes.toString() };
  } finally {
    client.destroy();
  }
}

/** Overwrites a text file in place and refreshes the stored size and ETag. */
export async function writeTextFile(
  fileId: string,
  actor: Actor,
  content: string,
): Promise<{ id: string; sizeBytes: string; etag: string | null }> {
  const file = await getFileForActor(fileId, actor);
  if (!file) throw new Error('File not found');

  // Check the file that is already stored as well as the new content: a file
  // too large to open must not be overwritten blind either.
  const existing = checkEditable(file.sizeBytes);
  if (!existing.ok) throw new Error(existing.error);

  const size = utf8Length(content);
  const withinLimit = checkEditable(size);
  if (!withinLimit.ok) throw new Error(withinLimit.error);

  const connection = await getConnectionConfig(file.connectionId);
  const client = await getS3Client(file.connectionId);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: connection.bucket,
        Key: file.key,
        Body: content,
        ContentType: file.contentType,
        ContentLength: Number(size),
      }),
    );

    // Read the authoritative size/ETag back rather than trusting what we sent.
    const head = await client.send(
      new HeadObjectCommand({ Bucket: connection.bucket, Key: file.key }),
    );

    const updated = await db.uploadedFile.update({
      where: { id: fileId },
      data: {
        sizeBytes: BigInt(head.ContentLength ?? Number(size)),
        etag: head.ETag?.replace(/"/g, '') ?? null,
      },
      select: { id: true, sizeBytes: true, etag: true },
    });

    return {
      id: updated.id,
      sizeBytes: updated.sizeBytes.toString(),
      etag: updated.etag,
    };
  } finally {
    client.destroy();
  }
}
