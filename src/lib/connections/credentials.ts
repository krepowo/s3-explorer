import 'server-only';
import { env } from '@/lib/env';
import { open, seal } from '@/lib/crypto';

/** Encrypts a credential with the master key. A fresh IV is used on every call. */
export function sealCredential(plaintext: string): string {
  return seal(plaintext, env().CREDENTIAL_ENCRYPTION_KEY);
}

/** Decrypts a credential sealed by {@link sealCredential}. Callers must not log the result. */
export function openCredential(sealed: string): string {
  return open(sealed, env().CREDENTIAL_ENCRYPTION_KEY);
}

/** `AKIAIOSFODNN7EXAMPLE` → `AKIA****MPLE`. Short keys never reveal any character. */
export function maskAccessKey(key: string): string {
  return key.length <= 8 ? '****' : `${key.slice(0, 4)}****${key.slice(-4)}`;
}
