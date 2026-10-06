import 'server-only';
import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { db } from '@/lib/db';
import { getConnectionConfig, getS3Client } from '@/lib/connections';
import { filenameFromKey } from '@/lib/uploads/filename';

/**
 * Objects younger than this are left alone. A file sits in storage between
 * presign and register, so cleaning immediately would delete live uploads.
 */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export type OrphanReport = {
  scannedObjects: number;
  scannedRecords: number;
  /** Objects in the bucket with no matching row. */
  orphanObjects: string[];
  /** Rows whose object is missing from the bucket. */
  orphanRecords: { id: string; key: string; filename: string }[];
  deletedObjects: number;
  deletedRecords: number;
};

export type CleanupOptions = {
  /** Report only — nothing is deleted. */
  dryRun?: boolean;
  graceMs?: number;
  /**
   * Restrict the sweep to these connections. The cron job leaves this empty and
   * reconciles every connection; tests scope it so they cannot disturb each
   * other (or anything else sharing the bucket).
   */
  connectionIds?: string[];
};

/**
 * Reconciles storage against the database. Both directions are reported; only
 * objects are deleted (their bytes are unreachable anyway), while rows whose
 * object vanished are removed because their public link is already broken.
 *
 * Idempotent: running it twice in a row is a no-op the second time.
 */
export async function cleanOrphans(options: CleanupOptions = {}): Promise<OrphanReport> {
  const dryRun = options.dryRun ?? true;
  const graceMs = options.graceMs ?? ORPHAN_GRACE_MS;
  const cutoff = new Date(Date.now() - graceMs);

  const report: OrphanReport = {
    scannedObjects: 0,
    scannedRecords: 0,
    orphanObjects: [],
    orphanRecords: [],
    deletedObjects: 0,
    deletedRecords: 0,
  };

  const connections = await db.s3Connection.findMany({
    where: options.connectionIds ? { id: { in: options.connectionIds } } : {},
    select: { id: true },
  });

  for (const connection of connections) {
    const config = await getConnectionConfig(connection.id).catch(() => null);
    if (!config) continue;

    const records = await db.uploadedFile.findMany({
      where: { connectionId: connection.id },
      select: { id: true, key: true, filename: true },
    });
    report.scannedRecords += records.length;
    const knownKeys = new Set(records.map((row) => row.key));

    // Objects actually present in the bucket.
    const client = await getS3Client(connection.id);
    const present = new Map<string, Date>();
    try {
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: 'files/',
            ContinuationToken: token,
          }),
        );
        for (const item of page.Contents ?? []) {
          if (item.Key) present.set(item.Key, item.LastModified ?? new Date(0));
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);

      report.scannedObjects += present.size;

      // Objects with no row, old enough that no upload can be in flight.
      for (const [key, lastModified] of present) {
        if (knownKeys.has(key) || lastModified > cutoff) continue;
        report.orphanObjects.push(key);
        if (!dryRun) {
          await client
            .send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
            .then(() => {
              report.deletedObjects += 1;
            })
            .catch(() => {});
        }
      }
    } finally {
      client.destroy();
    }

    // Rows whose object is gone.
    for (const row of records) {
      if (present.has(row.key)) continue;
      report.orphanRecords.push(row);
      if (!dryRun) {
        await db.uploadedFile.delete({ where: { id: row.id } }).then(
          () => {
            report.deletedRecords += 1;
          },
          () => {},
        );
      }
    }
  }

  void filenameFromKey;
  return report;
}
