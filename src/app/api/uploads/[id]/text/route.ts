import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route } from '@/lib/api/route';
import { logAudit } from '@/lib/audit/helpers';
import { readTextFile, writeTextFile } from '@/lib/preview';

export const GET = route(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  const { id } = await params;

  try {
    return NextResponse.json(await readTextFile(id, actor));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read the file';
    const status = message === 'File not found' ? 404 : message.includes('5 MB') ? 413 : 400;
    return NextResponse.json({ error: message }, { status });
  }
});

const schema = z.object({ content: z.string() });

export const PUT = route(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const result = await writeTextFile(id, actor, parsed.data.content);
    logAudit({
      action: 'files.edit',
      actorId: actor.id,
      actorEmail: actor.email,
      targetType: 'file',
      targetId: id,
      metadata: { sizeBytes: result.sizeBytes },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the file';
    const status = message === 'File not found' ? 404 : message.includes('5 MB') ? 413 : 400;
    return NextResponse.json({ error: message }, { status });
  }
});
