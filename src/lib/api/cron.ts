import { NextResponse } from 'next/server';

/**
 * Guards a cron endpoint. Vercel sends `Authorization: Bearer $CRON_SECRET`,
 * so the same check also lets you trigger the job by hand from a terminal.
 * With no CRON_SECRET configured (local dev) the job is left open.
 */
export function cronUnauthorized(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;

  const header = request.headers.get('authorization');
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
