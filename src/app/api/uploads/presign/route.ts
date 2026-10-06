import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route } from '@/lib/api/route';
import { prepareUpload } from '@/lib/uploads';
import { allowOriginFromRequest } from '@/lib/connections/cors';

const schema = z.object({
  filename: z.string().min(1),
  sizeBytes: z.coerce.bigint().positive(),
  contentType: z.string().min(1).default('application/octet-stream'),
  /// Chosen in the upload dialog; ignored when an admin assigned a connection.
  connectionId: z.uuid().optional(),
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireUser();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    );
  }

  try {
    const target = await prepareUpload(actor, parsed.data);

    // The browser PUTs straight to the bucket, so its preflight has to be
    // allowed before the upload is attempted.
    await allowOriginFromRequest(req, target.connectionId);

    return NextResponse.json(target);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload could not be prepared.' },
      { status: 400 },
    );
  }
});
