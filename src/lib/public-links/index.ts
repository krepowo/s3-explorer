import { randomInt } from 'node:crypto';

/** Lowercase letters only — the token ends up in a URL people read and type. */
const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const TOKEN_LENGTH = 5;

/**
 * Namespace token: 5 lowercase letters, ~11.9M combinations.
 *
 * It is deliberately short and is not a secret — the bucket is public and every
 * signed-in user sees the whole pool. Its only job is to keep one uploader's
 * namespace apart from another's, so a readable URL beats extra entropy here.
 *
 * Because the space is small, anything that writes a token to the database must
 * check it is free first: see `newPublicToken`.
 */
export function generatePublicToken(): string {
  let token = '';
  for (let index = 0; index < TOKEN_LENGTH; index += 1) {
    token += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }
  return token;
}

/** Public URL for one file, served straight from the bucket/CDN. */
export function buildPublicUrl(publicBaseUrl: string, ownerToken: string, filename: string): string {
  const base = publicBaseUrl.replace(/\/+$/, '');
  return `${base}/files/${ownerToken}/${encodeURIComponent(filename)}`;
}
