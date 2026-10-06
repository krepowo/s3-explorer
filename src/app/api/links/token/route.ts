import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { route } from '@/lib/api/route';
import { db } from '@/lib/db';
import { ensurePublicToken } from '@/lib/uploads';

/** The caller's own namespace token, for showing/copying their link prefix. */
export const GET = route(async () => {
  const actor = await requireUser();
  const token = await ensurePublicToken(actor.id);

  const connection = await db.s3Connection.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { publicBaseUrl: true },
  });

  return NextResponse.json({
    token,
    prefix: connection ? `${connection.publicBaseUrl.replace(/\/+$/, '')}/files/${token}/` : null,
  });
});
