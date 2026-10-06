import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function decodeKey(masterKey: string): Buffer {
  const key = Buffer.from(masterKey, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`Master key must decode to ${KEY_BYTES} bytes, got ${key.length}`);
  }
  return key;
}

/** Encrypts plaintext as base64(iv | authTag | ciphertext). A fresh IV is generated per call. */
export function seal(plaintext: string, masterKey: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, decodeKey(masterKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/** Decrypts a payload produced by {@link seal}. Throws if the payload or key was tampered with. */
export function open(sealed: string, masterKey: string): string {
  const raw = Buffer.from(sealed, 'base64');
  const iv = raw.subarray(0, IV_BYTES);
  const authTag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, decodeKey(masterKey), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
