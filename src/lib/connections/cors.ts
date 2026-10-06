import 'server-only';
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  type CORSRule,
} from '@aws-sdk/client-s3';
import { getConnectionConfig, getConnectionMeta, getS3Client } from './index';

/** Only a well-formed http(s) origin may be written into a bucket policy. */
export function isUsableOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === origin
    );
  } catch {
    return false;
  }
}

const allowsPut = (rule: CORSRule) =>
  (rule.AllowedMethods ?? []).some((method) => method.toUpperCase() === 'PUT');

const namesOrigin = (rule: CORSRule, origin: string) =>
  (rule.AllowedOrigins ?? []).some((allowed) => allowed === '*' || allowed === origin);

/**
 * Returns `rules` unchanged when a PUT-capable rule already covers the origin,
 * otherwise appends one. Appending never narrows what the bucket already allows,
 * which matters because `PutBucketCors` replaces the whole policy.
 */
export function withAllowedOrigin(rules: CORSRule[], origin: string): CORSRule[] {
  if (rules.some((rule) => allowsPut(rule) && namesOrigin(rule, origin))) return rules;

  return [
    ...rules,
    {
      AllowedOrigins: [origin],
      AllowedMethods: ['PUT', 'GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    },
  ];
}

/** Attempted origins, so a busy page does not re-issue the request per upload. */
const applied = new Set<string>();

/** Drops the memo for one connection, so a reconfigured bucket is re-checked. */
export function forgetBucketCors(connectionId: string): void {
  for (const key of applied) {
    if (key.startsWith(`${connectionId}|`)) applied.delete(key);
  }
}

/**
 * Makes the bucket accept a browser PUT from `origin`.
 *
 * A presigned PUT is cross-origin, so the browser sends a preflight first. R2
 * answers OPTIONS with a 403 until the bucket's CORS policy names the origin —
 * the PUT itself would have succeeded, but the browser never sends it, and the
 * XHR surfaces that as an opaque failure that looks like a dead network.
 *
 * Only R2 is handled: it is the one provider where the app can be sure the
 * browser PUT is blocked by a policy the app is expected to own. Other buckets
 * keep whatever the admin configured in their console.
 *
 * Never throws — a key without CORS permission must not fail the upload.
 */
export async function ensureBucketAllowsOrigin(
  connectionId: string,
  origin: string,
): Promise<void> {
  const key = `${connectionId}|${origin}`;
  if (applied.has(key)) return;
  applied.add(key);

  try {
    const { provider } = await getConnectionMeta(connectionId);
    if (provider !== 'r2') return;

    const connection = await getConnectionConfig(connectionId);
    const client = await getS3Client(connectionId);
    try {
      let rules: CORSRule[] = [];
      try {
        const existing = await client.send(
          new GetBucketCorsCommand({ Bucket: connection.bucket }),
        );
        rules = existing.CORSRules ?? [];
      } catch {
        // R2 answers NoSuchCORSConfiguration when the bucket has no policy yet.
      }

      const next = withAllowedOrigin(rules, origin);
      if (next === rules) return;

      await client.send(
        new PutBucketCorsCommand({
          Bucket: connection.bucket,
          CORSConfiguration: { CORSRules: next },
        }),
      );
    } finally {
      client.destroy();
    }
  } catch {
    // Let a later upload retry rather than remembering the failure.
    applied.delete(key);
  }
}

/**
 * Convenience for request handlers: applies the caller's own origin. Called when
 * a connection is saved so the policy is in place — and propagated at R2's edge —
 * long before the first upload, which would otherwise lose that race.
 */
export async function allowOriginFromRequest(
  req: Request,
  connectionId: string,
): Promise<void> {
  const origin = req.headers.get('origin');
  if (isUsableOrigin(origin)) await ensureBucketAllowsOrigin(connectionId, origin);
}
