import { NextRequest, NextResponse } from 'next/server';
import { route } from '@/lib/api/route';
import { cronUnauthorized } from '@/lib/api/cron';
import { cleanOrphans } from '@/lib/maintenance/orphans';

/**
 * GET /api/cron/orphan-cleanup
 * Reconciles S3 objects against the database. Vercel Cron only issues GET, so
 * this is GET rather than DELETE.
 *
 * `?dryRun=1` reports without deleting anything.
 */
export const GET = route(async (req: NextRequest) => {
  const denied = cronUnauthorized(req);
  if (denied) return denied;

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';
  const report = await cleanOrphans({ dryRun });

  // Keep the response small; the counts are what a cron log needs.
  return NextResponse.json({
    dryRun,
    scannedObjects: report.scannedObjects,
    scannedRecords: report.scannedRecords,
    orphanObjects: report.orphanObjects.length,
    orphanRecords: report.orphanRecords.length,
    deletedObjects: report.deletedObjects,
    deletedRecords: report.deletedRecords,
  });
});
