import 'server-only';
import { CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/lib/db';
import { getConnectionConfig, getS3Client } from '@/lib/connections';
import { buildObjectKey, keyBelongsToToken } from '@/lib/uploads/filename';
import { newPublicToken } from './unique';

export type RotateResult = {
  previousToken: string;
  newToken: string;
  moved: number;
  failed: number;
  failures: { filename: string; error: string }[];
};

/**
 * Rotates a user's public token, which means every old link must stop working.
 *
 * Because the bucket is public, changing the token alone is not enough — the
 * objects themselves live under the old prefix, so each one is copied to the
 * new prefix and deleted from the old one. The token is written first so the
 * database stays the source of truth if the move is interrupted; any object
 * left behind is swept by the orphan-cleanup job.
 */
export async function rotateToken(userId: string): Promise<RotateResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, publicToken: true },
  });
  if (!user) throw new Error('User not found');

  const previousToken = user.publicToken ?? '';
  const newToken = await newPublicToken();

  await db.user.update({ where: { id: userId }, data: { publicToken: newToken } });

  const files = await db.uploadedFile.findMany({
    where: { ownerId: userId },
    select: { id: true, key: true, filename: true, connectionId: true },
  });

  // One client per connection, reused across that connection's files.
  const clients = new Map<string, Awaited<ReturnType<typeof getS3Client>>>();
  const buckets = new Map<string, string>();
  const failures: RotateResult['failures'] = [];
  let moved = 0;

  try {
    for (const file of files) {
      if (keyBelongsToToken(file.key, newToken)) continue;

      try {
        if (!clients.has(file.connectionId)) {
          const config = await getConnectionConfig(file.connectionId);
          clients.set(file.connectionId, await getS3Client(file.connectionId));
          buckets.set(file.connectionId, config.bucket);
        }
        const client = clients.get(file.connectionId)!;
        const bucket = buckets.get(file.connectionId)!;
        const newKey = buildObjectKey(newToken, file.filename);

        await client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${encodeURIComponent(file.key)}`,
            Key: newKey,
          }),
        );
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: file.key }));
        await db.uploadedFile.update({ where: { id: file.id }, data: { key: newKey } });
        moved += 1;
      } catch (error) {
        failures.push({
          filename: file.filename,
          error: error instanceof Error ? error.message : 'move failed',
        });
      }
    }
  } finally {
    for (const client of clients.values()) client.destroy();
  }

  return {
    previousToken,
    newToken,
    moved,
    failed: failures.length,
    failures,
  };
}
