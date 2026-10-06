import 'server-only';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

/** Everything needed to reach one S3-compatible bucket. Credentials arrive decrypted. */
export type S3ConnectionConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
};

export function createS3Client(config: S3ConnectionConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    // SDK v3 signs a default CRC32 checksum into presigned PUTs, computed from an
    // empty body — S3-compatible servers (SeaweedFS, MinIO, R2) reject that with
    // BadDigest. Only checksum when the operation actually requires it.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export type ConnectionCheck = { ok: true } | { ok: false; error: string };

/**
 * Turns an AWS SDK error into something an admin can act on. The SDK often
 * reports only `UnknownError` with an empty message, so the HTTP status is the
 * useful signal. Never includes credentials or the request body.
 */
export function describeS3Error(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error);

  const { name, message, $metadata } = error as {
    name?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const status = $metadata?.httpStatusCode;
  const detail = message?.trim();

  if (status === 404) return 'Bucket not found at this endpoint.';
  if (status === 403) return 'Access denied — check the access key and secret.';
  if (status === 301) return 'Wrong region for this bucket.';
  if (status === 400) return 'Bad request — check the endpoint URL and region.';
  if (detail) return `${name ?? 'Error'}: ${detail}`;
  if (status) return `Request failed with HTTP ${status}.`;
  return name ?? 'Unknown error';
}

/** Verifies endpoint + credentials + bucket by issuing a HeadBucket request. */
export async function testConnection(config: S3ConnectionConfig): Promise<ConnectionCheck> {
  const client = createS3Client(config);
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describeS3Error(error) };
  } finally {
    client.destroy();
  }
}
