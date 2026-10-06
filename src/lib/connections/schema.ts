import { z } from 'zod';

/** https everywhere, except a local dev endpoint. */
const publicBaseUrl = z
  .url()
  .refine((value) => value.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(value), {
    message: 'must be an https URL (http is allowed only for localhost)',
  })
  .refine((value) => !value.endsWith('/'), { message: 'must not end with a slash' });

export const connectionInput = z.object({
  label: z.string().min(1).max(100),
  provider: z.enum(['r2', 's3', 'b2', 'minio', 'other']),
  endpoint: z.url(),
  region: z.string().min(1),
  forcePathStyle: z.boolean().default(false),
  bucket: z.string().min(1),
  publicBaseUrl,
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  isActive: z.boolean().default(true),
});

export type ConnectionInput = z.infer<typeof connectionInput>;
