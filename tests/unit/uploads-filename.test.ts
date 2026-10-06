import { describe, expect, it } from 'vitest';
import {
  MAX_FILENAME_LENGTH,
  buildObjectKey,
  checkUploadLimit,
  filenameFromKey,
  formatBytes,
  keyBelongsToToken,
  nextAvailableFilename,
  sanitizeFilename,
} from '@/lib/uploads/filename';

const GB = 1024n * 1024n * 1024n;

describe('sanitizeFilename', () => {
  it('keeps ordinary names untouched', () => {
    expect(sanitizeFilename('holiday photo.jpg')).toBe('holiday photo.jpg');
  });

  it('keeps only the final segment, so traversal cannot escape the prefix', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('a/b\\c.txt')).toBe('c.txt');
    expect(sanitizeFilename('C:\\Windows\\system32')).toBe('system32');
  });

  it('drops control characters', () => {
    expect(sanitizeFilename('bad\u0000name\n.txt')).toBe('badname.txt');
  });

  it('replaces characters Windows rejects', () => {
    expect(sanitizeFilename('a:b*c?d"e<f>g|h.txt')).toBe('a-b-c-d-e-f-g-h.txt');
  });

  it('never returns an empty name', () => {
    expect(sanitizeFilename('...')).toBe('file');
    expect(sanitizeFilename('   ')).toBe('file');
  });

  it('truncates long names but keeps the extension', () => {
    const long = `${'a'.repeat(400)}.zip`;
    const result = sanitizeFilename(long);
    expect(result.length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH);
    expect(result.endsWith('.zip')).toBe(true);
  });

  it('keeps a leading-dot file usable', () => {
    expect(sanitizeFilename('.env')).toBe('env');
  });
});

describe('nextAvailableFilename', () => {
  it('keeps the name when free', () => {
    expect(nextAvailableFilename('file.zip', [])).toBe('file.zip');
  });

  it('appends -1, then -2 on repeated collisions', () => {
    expect(nextAvailableFilename('file.zip', ['file.zip'])).toBe('file-1.zip');
    expect(nextAvailableFilename('file.zip', ['file.zip', 'file-1.zip'])).toBe('file-2.zip');
  });

  it('inserts the counter before the extension', () => {
    expect(nextAvailableFilename('report.tar.gz', ['report.tar.gz'])).toBe('report.tar-1.gz');
  });

  it('handles names without an extension', () => {
    expect(nextAvailableFilename('README', ['README'])).toBe('README-1');
  });
});

describe('object keys', () => {
  it('builds a key inside the owner namespace', () => {
    expect(buildObjectKey('abc123', 'photo.jpg')).toBe('files/abc123/photo.jpg');
  });

  it('round-trips the filename', () => {
    const key = buildObjectKey('abc123', 'photo.jpg');
    expect(filenameFromKey(key)).toBe('photo.jpg');
  });

  it('recognises keys belonging to a token', () => {
    expect(keyBelongsToToken('files/abc123/photo.jpg', 'abc123')).toBe(true);
    expect(keyBelongsToToken('files/abc123/photo.jpg', 'other')).toBe(false);
    expect(keyBelongsToToken('files/abc123/', 'abc123')).toBe(false);
  });
});

describe('checkUploadLimit', () => {
  it('accepts a file under the limit', () => {
    expect(checkUploadLimit(1024n, 2n * GB)).toEqual({ ok: true });
  });

  it('accepts a file exactly at the limit', () => {
    expect(checkUploadLimit(2n * GB, 2n * GB)).toEqual({ ok: true });
  });

  it('rejects a file over the limit with a readable message', () => {
    const result = checkUploadLimit(3n * GB, 2n * GB);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('2 GB');
  });

  it('rejects an empty file', () => {
    expect(checkUploadLimit(0n, 2n * GB).ok).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats the common sizes', () => {
    expect(formatBytes(512n)).toBe('512 B');
    expect(formatBytes(2n * GB)).toBe('2 GB');
    expect(formatBytes(1536n * 1024n * 1024n)).toBe('1.5 GB');
  });
});
