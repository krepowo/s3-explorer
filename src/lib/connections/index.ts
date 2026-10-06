import 'server-only';
import { db } from '@/lib/db';
import { createS3Client, type S3ConnectionConfig } from '@/lib/s3/client';
import type { S3Client } from '@aws-sdk/client-s3';
import type { S3Provider } from '@/generated/prisma/enums';
import { maskAccessKey, openCredential } from './credentials';

export { maskAccessKey, openCredential, sealCredential } from './credentials';

/** A connection row with credentials decrypted — internal to this module. */
export type ConnectionConfig = S3ConnectionConfig & { id: string; publicBaseUrl: string };

/** The only shape allowed to leave the server: credentials removed, access key masked. */
export type PublicConnection = {
  id: string;
  label: string;
  provider: S3Provider;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  bucket: string;
  publicBaseUrl: string;
  isActive: boolean;
  /// Preferred connection when a user has no explicit assignment.
  isPrimary: boolean;
  accessKeyMasked: string;
  createdAt: Date;
  updatedAt: Date;
};

/** A stored row as selected by {@link connectionSelect} — still holds sealed credentials. */
export type ConnectionRow = Omit<PublicConnection, 'accessKeyMasked'> & {
  accessKeyIdEnc: string;
  secretAccessKeyEnc: string;
};

/** Prisma select returning exactly what {@link toPublicConnection} needs. */
export const connectionSelect = {
  id: true, label: true, provider: true, endpoint: true, region: true,
  forcePathStyle: true, bucket: true, publicBaseUrl: true, isActive: true,
  isPrimary: true,
  accessKeyIdEnc: true, secretAccessKeyEnc: true, createdAt: true, updatedAt: true,
} as const;

export function toPublicConnection(row: ConnectionRow): PublicConnection {
  const { accessKeyIdEnc, secretAccessKeyEnc, ...rest } = row;
  void secretAccessKeyEnc;
  return { ...rest, accessKeyMasked: maskAccessKey(openCredential(accessKeyIdEnc)) };
}

/** Loads and decrypts one connection. Throws a generic error when missing or inactive. */
export async function getConnectionConfig(connectionId: string): Promise<ConnectionConfig> {
  const row = await db.s3Connection.findUnique({ where: { id: connectionId } });
  if (!row) throw new Error('S3 connection not found');
  if (!row.isActive) throw new Error('S3 connection is inactive');

  return {
    id: row.id,
    endpoint: row.endpoint,
    region: row.region,
    bucket: row.bucket,
    forcePathStyle: row.forcePathStyle,
    publicBaseUrl: row.publicBaseUrl,
    accessKeyId: openCredential(row.accessKeyIdEnc),
    secretAccessKey: openCredential(row.secretAccessKeyEnc),
  };
}

/** Ready-to-use S3 client for a connection. Used by the uploads and preview modules. */
export async function getS3Client(connectionId: string): Promise<S3Client> {
  const config = await getConnectionConfig(connectionId);
  return createS3Client(config);
}

/** How many users reference this connection. Callers reject deletion when > 0. */
export async function countConnectionUsers(connectionId: string): Promise<number> {
  return db.user.count({ where: { assignedConnectionId: connectionId } });
}

export type ConnectionOption = { id: string; label: string; isPrimary: boolean };

/**
 * Connections this user may upload through, best first.
 *
 * An explicit assignment is a deliberate restriction, so it is the only option
 * offered; without one, every active connection is available and the primary
 * sorts first.
 */
export async function listUploadConnections(actorId: string): Promise<ConnectionOption[]> {
  const user = await db.user.findUnique({
    where: { id: actorId },
    select: { assignedConnectionId: true },
  });

  return db.s3Connection.findMany({
    where: { isActive: true, ...(user?.assignedConnectionId ? { id: user.assignedConnectionId } : {}) },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, label: true, isPrimary: true },
  });
}

/** Non-secret connection fields, for modules that only need routing info. */
export async function getConnectionMeta(connectionId: string): Promise<{
  bucket: string;
  publicBaseUrl: string;
  provider: S3Provider;
}> {
  const row = await db.s3Connection.findUnique({
    where: { id: connectionId },
    select: { bucket: true, publicBaseUrl: true, provider: true },
  });
  if (!row) throw new Error('S3 connection not found');
  return row;
}
