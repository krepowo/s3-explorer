import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  verifyPassword,
  createSession,
  setSessionCookie,
} from '@/lib/auth';
import { logAudit } from '@/lib/audit/helpers';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function getIp(req: NextRequest): string | undefined {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    undefined;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // Generic error: never reveal whether email exists
  const GENERIC = 'Invalid email or password';
  const ip = getIp(req);
  const userAgent = req.headers.get('user-agent') ?? undefined;

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    // Still verify to prevent timing oracle
    await verifyPassword('$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy', password).catch(() => {});
    logAudit({
      action: 'auth.login.failed',
      actorEmail: email,
      metadata: { reason: user ? 'inactive' : 'unknown' },
      ip,
      userAgent,
    });
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    logAudit({
      action: 'auth.login.failed',
      actorId: user.id,
      actorEmail: user.email,
      metadata: { reason: 'bad_password' },
      ip,
      userAgent,
    });
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  const raw = await createSession(user.id, {
    userAgent,
    ip,
  });
  await setSessionCookie(raw);

  logAudit({
    action: 'auth.login.success',
    actorId: user.id,
    actorEmail: user.email,
    metadata: { sessionCreated: true },
    ip,
    userAgent,
  });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
}
