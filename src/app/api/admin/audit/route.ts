import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, requireRole } from '@/lib/auth';
import { route } from '@/lib/api/route';
import { db } from '@/lib/db';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  action: z.string().optional(),
  actorId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const GET = route(async (req: NextRequest) => {
  const actor = await requireUser();
  requireRole(actor, 'admin');

  const parsed = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const { page, limit, action, actorId, from, to } = parsed;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (action) where.action = { contains: action };
  if (actorId) where.actorId = actorId;
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, Date>).gte = from;
    if (to) (where.createdAt as Record<string, Date>).lte = to;
  }

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.auditLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, limit });
});
