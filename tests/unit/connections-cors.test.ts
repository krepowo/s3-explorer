import { describe, expect, it } from 'vitest';
import type { CORSRule } from '@aws-sdk/client-s3';
import { isUsableOrigin, withAllowedOrigin } from '@/lib/connections/cors';

const PUT_RULE: CORSRule = {
  AllowedOrigins: ['https://app.example.com'],
  AllowedMethods: ['PUT', 'GET'],
};

describe('isUsableOrigin', () => {
  it('accepts a bare http(s) origin', () => {
    expect(isUsableOrigin('https://app.example.com')).toBe(true);
    expect(isUsableOrigin('http://localhost:3000')).toBe(true);
  });

  it('rejects anything that is not exactly an origin', () => {
    expect(isUsableOrigin(null)).toBe(false);
    expect(isUsableOrigin('')).toBe(false);
    expect(isUsableOrigin('null')).toBe(false);
    expect(isUsableOrigin('https://app.example.com/')).toBe(false);
    expect(isUsableOrigin('https://app.example.com/path')).toBe(false);
    expect(isUsableOrigin('not a url')).toBe(false);
    expect(isUsableOrigin('ftp://app.example.com')).toBe(false);
  });
});

describe('withAllowedOrigin', () => {
  it('appends a PUT rule when the bucket has no policy at all', () => {
    const rules = withAllowedOrigin([], 'http://localhost:3000');
    expect(rules).toHaveLength(1);
    expect(rules[0].AllowedOrigins).toEqual(['http://localhost:3000']);
    expect(rules[0].AllowedMethods).toContain('PUT');
  });

  it('keeps every existing rule, so a shared bucket is never narrowed', () => {
    const existing: CORSRule[] = [
      { AllowedOrigins: ['https://other.example.com'], AllowedMethods: ['GET'] },
      PUT_RULE,
    ];

    const rules = withAllowedOrigin(existing, 'http://localhost:3000');
    expect(rules).toHaveLength(3);
    expect(rules.slice(0, 2)).toEqual(existing);
  });

  it('returns the same array when a PUT rule already names the origin', () => {
    const existing: CORSRule[] = [{ ...PUT_RULE, AllowedOrigins: ['http://localhost:3000'] }];
    expect(withAllowedOrigin(existing, 'http://localhost:3000')).toBe(existing);
  });

  it('treats a wildcard as already covering the origin', () => {
    const existing: CORSRule[] = [{ ...PUT_RULE, AllowedOrigins: ['*'] }];
    expect(withAllowedOrigin(existing, 'http://localhost:3000')).toBe(existing);
  });

  it('adds the origin when the rule naming it cannot PUT', () => {
    // A read-only rule is not enough: the preflight asks for PUT specifically.
    const existing: CORSRule[] = [
      { AllowedOrigins: ['http://localhost:3000'], AllowedMethods: ['GET'] },
    ];
    expect(withAllowedOrigin(existing, 'http://localhost:3000')).toHaveLength(2);
  });

  it('is idempotent', () => {
    const once = withAllowedOrigin([], 'http://localhost:3000');
    expect(withAllowedOrigin(once, 'http://localhost:3000')).toBe(once);
  });
});
