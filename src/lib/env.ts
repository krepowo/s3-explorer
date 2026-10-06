import 'server-only';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'must be the base64 encoding of exactly 32 bytes',
    }),
  SESSION_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Validates and returns the environment on first use rather than at import time,
 * so a build without secrets (and any module that never touches the DB) still works.
 */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new Error(`Invalid environment — ${detail}`);
    }
    cached = parsed.data;
  }
  return cached;
}
