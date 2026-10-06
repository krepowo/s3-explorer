import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route } from '@/lib/api/route';
import { logAudit } from '@/lib/audit/helpers';
import { registerUpload } from '@/lib/uploads';

const schema = z.object({
  key: z.string().min(1),
  /// The connectionId presign returned, so the head request hits the same bucket.
  connectionId: z.uuid().optional(),
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireUser();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  let file;
  try {
    file = await registerUpload(actor, parsed.data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload could not be registered.' },
      { status: 400 },
    );
  }

  logAudit({
    action: 'uploads.create',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'file',
    targetId: file.id,
    metadata: { filename: file.filename, sizeBytes: file.sizeBytes, contentType: file.contentType },
  });

  return NextResponse.json(file, { status: 201 });
});
