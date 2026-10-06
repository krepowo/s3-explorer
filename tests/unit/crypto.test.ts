import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { open, seal } from '@/lib/crypto';

const KEY = randomBytes(32).toString('base64');

describe('crypto', () => {
  it('round-trips a value', () => {
    expect(open(seal('access-key-id', KEY), KEY)).toBe('access-key-id');
  });

  it('uses a fresh IV per call, so identical inputs differ', () => {
    expect(seal('same', KEY)).not.toBe(seal('same', KEY));
  });

  it('rejects a tampered payload', () => {
    const raw = Buffer.from(seal('secret', KEY), 'base64');
    raw[raw.length - 1] ^= 0x01;
    expect(() => open(raw.toString('base64'), KEY)).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => seal('secret', 'not-a-valid-key')).toThrow(/32 bytes/);
  });

  it('rejects decryption with the wrong key', () => {
    const otherKey = randomBytes(32).toString('base64');
    expect(() => open(seal('secret', KEY), otherKey)).toThrow();
  });
});
