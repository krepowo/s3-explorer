import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser, requireRole } from '@/lib/auth';
import { route } from '@/lib/api/route';
import { viewFromLoaded } from '@/lib/uploads';

/** Counters for the admin dashboard. */
export const GET = route(async () => {
  const actor = await requireUser();
  requireRole(actor, 'admin');

  const [totalFiles, totalBytes, uploaders, connections, recent] = await Promise.all([
    db.uploadedFile.count(),
    db.uploadedFile.aggregate({ _sum: { sizeBytes: true } }),
    db.user.count({ where: { role: 'uploader' } }),
    db.s3Connection.count({ where: { isActive: true } }),
    db.uploadedFile.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        owner: { select: { email: true, name: true, publicToken: true } },
        connection: { select: { publicBaseUrl: true } },
      },
    }),
  ]);

  return NextResponse.json({
    totalFiles,
    totalBytes: (totalBytes._sum.sizeBytes ?? 0n).toString(),
    uploaders,
    connections,
    recent: recent.map(viewFromLoaded),
  });
});
