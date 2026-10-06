import type { AuditEvent } from '.';

export { recordAudit, type AuditEvent } from '.';

/**
 * Helper for route handlers: fire an audit event without awaiting it.
 * The caller controls the event shape; secrets are stripped in recordAudit.
 */
export function logAudit(event: AuditEvent): void {
  // Dynamic import avoids a circular import if this grows later.
  void import('.').then((mod) => mod.recordAudit(event));
}
