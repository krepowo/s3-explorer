import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { route } from '@/lib/api/route';
import { cronUnauthorized } from '@/lib/api/cron';

const RETENTION_DAYS = 90;

/**
 * GET /api/cron/audit-retention
 * Deletes audit rows older than 90 days. GET, not DELETE: Vercel Cron only
 * issues GET requests.
 */
export const GET = route(async (req: NextRequest) => {
  const denied = cronUnauthorized(req);
  if (denied) return denied;

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await db.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return NextResponse.json({ deleted: count, cutoff });
});
