import { NextRequest, NextResponse } from 'next/server';
import { requireUser, requireRole } from '@/lib/auth';
import { route } from '@/lib/api/route';
import { logAudit } from '@/lib/audit/helpers';
import { db } from '@/lib/db';
import { rotateToken } from '@/lib/public-links/rotate';

/**
 * Rotates an uploader's public token. Destructive: every link they shared stops
 * working, which is why the object move is part of the same operation.
 */
export const POST = route(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');
  const { id } = await params;

  const target = await db.user.findUnique({
    where: { id },
    select: { email: true, name: true, role: true },
  });
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let result;
  try {
    result = await rotateToken(id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Rotation failed' },
      { status: 400 },
    );
  }

  logAudit({
    action: 'links.rotate',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'user',
    targetId: id,
    metadata: {
      email: target.email,
      moved: result.moved,
      failed: result.failed,
    },
  });

  return NextResponse.json({
    token: result.newToken,
    moved: result.moved,
    failed: result.failed,
    failures: result.failures,
  });
});
