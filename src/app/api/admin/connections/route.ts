import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit/helpers';
import { sealCredential, toPublicConnection, connectionSelect } from '@/lib/connections';
import { allowOriginFromRequest } from '@/lib/connections/cors';
import { connectionInput } from '@/lib/connections/schema';
import { route } from '@/lib/api/route';

export const GET = route(async () => {
  const actor = await requireUser();
  requireRole(actor, 'admin');

  const rows = await db.s3Connection.findMany({
    select: connectionSelect,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(rows.map(toPublicConnection));
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');

  const body = await req.json().catch(() => null);
  const parsed = connectionInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { accessKeyId, secretAccessKey, ...rest } = parsed.data;

  const created = await db.s3Connection.create({
    data: {
      ...rest,
      accessKeyIdEnc: sealCredential(accessKeyId),
      secretAccessKeyEnc: sealCredential(secretAccessKey),
      createdBy: actor.id,
    },
    select: connectionSelect,
  });

  logAudit({
    action: 'connections.create',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'connection',
    targetId: created.id,
    metadata: { label: created.label, provider: created.provider, bucket: created.bucket },
  });

  // Done at save time so R2 has propagated the policy before anyone uploads.
  await allowOriginFromRequest(req, created.id);

  return NextResponse.json(toPublicConnection(created), { status: 201 });
});
