import { NextResponse } from 'next/server';
import { getActor } from '@/lib/auth';

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(actor);
}
