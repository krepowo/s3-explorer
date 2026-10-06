import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser, requireRole, hashPassword } from '@/lib/auth';
import { logAudit } from '@/lib/audit/helpers';
import { route } from '@/lib/api/route';
import { newPublicToken } from '@/lib/public-links/unique';

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['admin', 'uploader']).default('uploader'),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = route(async (req: NextRequest) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');

  const { page, limit } = listSchema.parse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    db.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, name: true, role: true,
        isActive: true, uploadLimitBytes: true,
        assignedConnectionId: true, publicToken: true,
        createdAt: true,
      },
    }),
    db.user.count(),
  ]);

  return NextResponse.json({ users, total, page, limit });
});

export const POST = route(async (req: NextRequest) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join('; ') },
      { status: 400 },
    );
  }

  const { email, password, name, role } = parsed.data;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  const user = await db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      name,
      role,
      // Every uploader owns a namespace token; admins get one too so the
      // schema stays uniform, but only uploaders ever upload.
      publicToken: await newPublicToken(),
    },
    select: {
      id: true, email: true, name: true, role: true,
      isActive: true, publicToken: true, createdAt: true,
    },
  });

  logAudit({
    action: 'users.create',
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: 'user',
    targetId: user.id,
    metadata: { email: user.email, name: user.name, role: user.role },
  });

  return NextResponse.json(user, { status: 201 });
});
