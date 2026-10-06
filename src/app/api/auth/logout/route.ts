import { NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';
import { getActor } from '@/lib/auth';
import { logAudit } from '@/lib/audit/helpers';

export async function POST() {
  const actor = await getActor();
  if (actor) {
    logAudit({
      action: 'auth.logout',
      actorId: actor.id,
      actorEmail: actor.email,
    });
  }
  await deleteSession();
  return NextResponse.json({ ok: true });
}
