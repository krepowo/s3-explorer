import { NextRequest, NextResponse } from 'next/server';
import { requireUser, requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit/helpers';
import { getConnectionConfig } from '@/lib/connections';
import { testConnection } from '@/lib/s3/client';
import { route } from '@/lib/api/route';

/** Tests the stored configuration of an existing connection. */
export const POST = route(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');
  const { id } = await params;

  let result;
  try {
    result = await testConnection(await getConnectionConfig(id));
  } catch {
    return NextResponse.json({ ok: false, error: 'Connection not found or inactive' }, { status: 404 });
  }

  logAudit({
    action: 'connections.test',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'connection',
    targetId: id,
    metadata: { ok: result.ok, error: result.ok ? undefined : result.error },
  });

  return NextResponse.json(result);
});
