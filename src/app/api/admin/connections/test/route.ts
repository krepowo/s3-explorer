import { NextRequest, NextResponse } from 'next/server';
import { requireUser, requireRole } from '@/lib/auth';
import { logAudit } from '@/lib/audit/helpers';
import { connectionInput } from '@/lib/connections/schema';
import { testConnection } from '@/lib/s3/client';
import { route } from '@/lib/api/route';

/** Tests credentials straight from the form, before the connection is saved. */
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

  const { label, publicBaseUrl, isActive, ...config } = parsed.data;
  void label; void publicBaseUrl; void isActive;

  const result = await testConnection(config);

  logAudit({
    action: 'connections.test',
    actorId: actor.id,
    actorEmail: actor.email,
    metadata: { ok: result.ok, endpoint: config.endpoint, bucket: config.bucket },
  });

  return NextResponse.json(result);
});
