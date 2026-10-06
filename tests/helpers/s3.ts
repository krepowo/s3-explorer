import { db } from '@/lib/db';

/**
 * Guard against a test run destroying real data.
 *
 * The integration suites create and delete objects, and one of them runs the
 * orphan sweeper with `graceMs: 0`. That sweep lists objects under `files/` in
 * the bucket and matches them against records **for its own connection** — so if
 * the test bucket is also the bucket a real connection points at, every real
 * upload looks like an orphan and gets deleted.
 *
 * Returns false when the bucket is shared, so callers skip instead of running.
 */
export async function testBucketIsIsolated(bucket: string): Promise<boolean> {
  const shared = await db.s3Connection.count({
    where: { bucket, NOT: { label: { startsWith: 'vitest-' } } },
  });
  if (shared > 0) {
    console.warn(
      `[integration] skipping: bucket "${bucket}" is also used by ${shared} non-test ` +
        'connection(s). Point S3_BUCKET at a throwaway bucket, or the tests will ' +
        'delete files that are not theirs.',
    );
  }
  return shared === 0;
}
