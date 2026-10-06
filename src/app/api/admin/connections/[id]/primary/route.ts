import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit/helpers';
import { route } from '@/lib/api/route';

/**
 * Makes one connection the default for uploads. There is no unique constraint
 * on `isPrimary` — the swap below is the only thing that writes it, and it runs
 * in one transaction, so two rows can never both be primary.
 */
export const POST = route(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');
  const { id } = await params;

  const target = await db.s3Connection.findUnique({
    where: { id },
    select: { id: true, label: true },
  });
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.$transaction([
    db.s3Connection.updateMany({ where: { id: { not: id } }, data: { isPrimary: false } }),
    db.s3Connection.update({ where: { id }, data: { isPrimary: true } }),
  ]);

  logAudit({
    action: 'connections.primary',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'connection',
    targetId: id,
    metadata: { label: target.label },
  });

  return NextResponse.json({ id, label: target.label, isPrimary: true });
});
