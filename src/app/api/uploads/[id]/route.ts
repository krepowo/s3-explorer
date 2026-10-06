import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route } from '@/lib/api/route';
import { logAudit } from '@/lib/audit/helpers';
import { deleteFile, getFileForActor, renameFile, viewFromLoaded } from '@/lib/uploads';

export const GET = route(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  const { id } = await params;

  const file = await getFileForActor(id, actor);
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(viewFromLoaded(file));
});

const patchSchema = z.object({ filename: z.string().min(1) });

export const PATCH = route(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const file = await renameFile(id, parsed.data.filename, actor);
    logAudit({
      action: 'uploads.rename',
      actorId: actor.id,
      actorEmail: actor.email,
      targetType: 'file',
      targetId: file.id,
      metadata: { filename: file.filename },
    });
    return NextResponse.json(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rename failed';
    return NextResponse.json({ error: message }, { status: message === 'File not found' ? 404 : 400 });
  }
});

export const DELETE = route(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  const { id } = await params;

  try {
    const { filename } = await deleteFile(id, actor);
    logAudit({
      action: 'uploads.delete',
      actorId: actor.id,
      actorEmail: actor.email,
      targetType: 'file',
      targetId: id,
      metadata: { filename },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: message === 'File not found' ? 404 : 400 });
  }
});
