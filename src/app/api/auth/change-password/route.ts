import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, verifyPassword, hashPassword } from '@/lib/auth';
import { route } from '@/lib/api/route';

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireUser();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: actor.id } });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ok = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
  if (!ok) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
  }

  await db.user.update({
    where: { id: actor.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });

  return NextResponse.json({ ok: true });
});
