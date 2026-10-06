import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { route } from '@/lib/api/route';
import { listFiles } from '@/lib/uploads';

const querySchema = z.object({
  search: z.string().optional(),
  contentType: z.string().optional(),
  sort: z.enum(['newest', 'oldest', 'name', 'size']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

/** Shared pool: every authenticated user sees every file. */
export const GET = route(async (req: NextRequest) => {
  await requireUser();

  const query = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return NextResponse.json(await listFiles(query));
});
