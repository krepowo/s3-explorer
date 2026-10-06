import 'server-only';
import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

export type AuditEvent = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
};

/**
 * Best-effort audit logger. Never throws, so callers never fail because of audit.
 * Sanitises metadata by stripping known secret keys.
 */
export async function recordAudit(event: AuditEvent): Promise<void> {
  try {
    const safeMetadata = stripSecrets(event.metadata ?? {});
    await db.auditLog.create({
      data: {
        actorId: event.actorId ?? null,
        actorEmail: event.actorEmail ?? null,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        metadata: safeMetadata as unknown as Prisma.InputJsonValue,
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error('Audit logging failed:', error instanceof Error ? error.message : error);
  }
}

const SECRET_KEYS = [
  'password',
  'passwordHash',
  'secret',
  'secretAccessKey',
  'accessKeyId',
  'token',
  'tokenHash',
  'credentialEncryptionKey',
  'key',
];

function stripSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.includes(k)) {
      cleaned[k] = '***';
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      cleaned[k] = stripSecrets(v as Record<string, unknown>);
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}
