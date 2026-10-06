import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit/helpers';
import { connectionSelect, countConnectionUsers, sealCredential, toPublicConnection } from '@/lib/connections';
import { allowOriginFromRequest, forgetBucketCors } from '@/lib/connections/cors';
import { connectionInput } from '@/lib/connections/schema';
import { route } from '@/lib/api/route';

export const PATCH = route(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');
  const { id } = await params;

  const body = await req.json().catch(() => null);
  // Credentials are optional on update: omit them to keep the stored ones.
  const parsed = connectionInput.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { accessKeyId, secretAccessKey, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (accessKeyId !== undefined) data.accessKeyIdEnc = sealCredential(accessKeyId);
  if (secretAccessKey !== undefined) data.secretAccessKeyEnc = sealCredential(secretAccessKey);

  const updated = await db.s3Connection
    .update({ where: { id }, data, select: connectionSelect })
    .catch(() => null);

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  logAudit({
    action: 'connections.update',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'connection',
    targetId: id,
    metadata: { changedFields: Object.keys(parsed.data) },
  });

  // The bucket may have changed, so the memo from the old one must not stick.
  forgetBucketCors(id);
  await allowOriginFromRequest(req, id);

  return NextResponse.json(toPublicConnection(updated));
});

export const DELETE = route(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');
  const { id } = await params;

  const inUse = await countConnectionUsers(id);
  if (inUse > 0) {
    return NextResponse.json(
      { error: `Connection is assigned to ${inUse} user(s). Reassign them first.` },
      { status: 409 },
    );
  }

  const deleted = await db.s3Connection
    .delete({ where: { id }, select: { id: true, label: true, bucket: true } })
    .catch(() => null);

  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  logAudit({
    action: 'connections.delete',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'connection',
    targetId: id,
    metadata: { label: deleted.label, bucket: deleted.bucket },
  });

  return new NextResponse(null, { status: 204 });
});
