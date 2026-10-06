import { describe, expect, it } from 'vitest';
import {
  maskAccessKey,
  openCredential,
  sealCredential,
} from '@/lib/connections/credentials';
import { toPublicConnection } from '@/lib/connections';

describe('connection credentials', () => {
  it('round-trips a credential', () => {
    expect(openCredential(sealCredential('AKIAIOSFODNN7EXAMPLE'))).toBe('AKIAIOSFODNN7EXAMPLE');
  });

  it('uses a fresh IV per call, so identical inputs differ', () => {
    expect(sealCredential('same')).not.toBe(sealCredential('same'));
  });

  it('rejects a tampered payload', () => {
    const raw = Buffer.from(sealCredential('secret'), 'base64');
    raw[raw.length - 1] ^= 0x01;
    expect(() => openCredential(raw.toString('base64'))).toThrow();
  });

  it('masks the middle of a long access key', () => {
    expect(maskAccessKey('AKIAIOSFODNN7EXAMPLE')).toBe('AKIA****MPLE');
  });

  it('reveals nothing for a short access key', () => {
    expect(maskAccessKey('short')).toBe('****');
  });

  it('never exposes credentials in the public shape', () => {
    const row = {
      id: 'c1',
      label: 'local',
      provider: 'minio' as const,
      endpoint: 'http://localhost:8333',
      region: 'us-east-1',
      forcePathStyle: true,
      bucket: 's3-explorer',
      publicBaseUrl: 'http://localhost:8333/s3-explorer',
      isActive: true,
      isPrimary: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      accessKeyIdEnc: sealCredential('AKIAIOSFODNN7EXAMPLE'),
      secretAccessKeyEnc: sealCredential('super-secret-value'),
    };

    const pub = toPublicConnection(row);
    expect(pub.accessKeyMasked).toBe('AKIA****MPLE');
    expect(Object.keys(pub)).not.toContain('accessKeyIdEnc');
    expect(Object.keys(pub)).not.toContain('secretAccessKeyEnc');
    expect(JSON.stringify(pub)).not.toContain('super-secret-value');
  });
});
