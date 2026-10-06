import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { route } from '@/lib/api/route';
import { listUploadConnections } from '@/lib/connections';

/** Connections the signed-in user may upload through, primary first. */
export const GET = route(async () => {
  const actor = await requireUser();
  return NextResponse.json(await listUploadConnections(actor.id));
});
