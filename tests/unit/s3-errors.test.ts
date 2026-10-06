import { describe, expect, it } from 'vitest';
import { describeS3Error } from '@/lib/s3/client';

describe('describeS3Error', () => {
  it('explains a missing bucket', () => {
    expect(describeS3Error({ name: 'NotFound', $metadata: { httpStatusCode: 404 } }))
      .toBe('Bucket not found at this endpoint.');
  });

  it('explains a credential failure', () => {
    expect(describeS3Error({ name: 'UnknownError', message: '', $metadata: { httpStatusCode: 403 } }))
      .toBe('Access denied — check the access key and secret.');
  });

  it('explains a region mismatch', () => {
    expect(describeS3Error({ $metadata: { httpStatusCode: 301 } }))
      .toBe('Wrong region for this bucket.');
  });

  it('prefers the SDK message when it has one', () => {
    expect(describeS3Error({ name: 'NetworkingError', message: 'getaddrinfo ENOTFOUND host' }))
      .toBe('NetworkingError: getaddrinfo ENOTFOUND host');
  });

  it('falls back to the error name, never an empty string', () => {
    expect(describeS3Error({ name: 'UnknownError', message: '  ' })).toBe('UnknownError');
    expect(describeS3Error('boom')).toBe('boom');
  });
});
