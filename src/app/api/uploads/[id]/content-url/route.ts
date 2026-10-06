import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { route } from '@/lib/api/route';
import { getPreviewTarget } from '@/lib/preview';

export const GET = route(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  const { id } = await params;

  try {
    return NextResponse.json(await getPreviewTarget(id, actor));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preview unavailable';
    return NextResponse.json({ error: message }, { status: message === 'File not found' ? 404 : 400 });
  }
});
