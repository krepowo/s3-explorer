import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, requireRole, hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit/helpers';
import { route } from '@/lib/api/route';

const schema = z.object({ password: z.string().min(8) });

export const POST = route(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters' },
      { status: 400 },
    );
  }

  await db.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(parsed.data.password) },
  }).catch(() => null);

  logAudit({
    action: 'users.reset_password',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'user',
    targetId: id,
  });

  return NextResponse.json({ ok: true });
});
