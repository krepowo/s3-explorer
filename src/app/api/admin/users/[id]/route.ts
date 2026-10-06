import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit/helpers';
import { route } from '@/lib/api/route';

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'uploader']).optional(),
  isActive: z.boolean().optional(),
  uploadLimitBytes: z.number().int().positive().nullable().optional(),
  assignedConnectionId: z.string().nullable().optional(),
});

export const PATCH = route(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { uploadLimitBytes, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (uploadLimitBytes !== undefined) {
    data.uploadLimitBytes = uploadLimitBytes != null ? BigInt(uploadLimitBytes) : null;
  }

  const user = await db.user.update({
    where: { id },
    data,
    select: {
      id: true, email: true, name: true, role: true,
      isActive: true, uploadLimitBytes: true, assignedConnectionId: true,
    },
  }).catch(() => null);

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  logAudit({
    action: 'users.update',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'user',
    targetId: id,
    metadata: { changedFields: Object.keys(parsed.data) },
  });

  return NextResponse.json({
    ...user,
    uploadLimitBytes: user.uploadLimitBytes?.toString() ?? null,
  });
});

export const DELETE = route(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');
  const { id } = await params;

  if (id === actor.id) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id },
    select: { email: true, name: true, role: true },
  }).catch(() => null);

  await db.user.delete({ where: { id } }).catch(() => null);

  if (user) {
    logAudit({
      action: 'users.delete',
      actorId: actor.id,
      actorEmail: actor.email,
      targetType: 'user',
      targetId: id,
      metadata: { email: user.email, name: user.name, role: user.role },
    });
  }

  return new NextResponse(null, { status: 204 });
});
