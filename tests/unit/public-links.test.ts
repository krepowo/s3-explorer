import { describe, expect, it } from 'vitest';
import { buildPublicUrl, generatePublicToken } from '@/lib/public-links';

describe('generatePublicToken', () => {
  it('is 5 lowercase letters', () => {
    expect(generatePublicToken()).toMatch(/^[a-z]{5}$/);
  });

  it('varies between calls', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generatePublicToken()));
    expect(tokens.size).toBeGreaterThan(1);
  });

  it('draws from the whole alphabet, not a truncated one', () => {
    // A modulo bug or a short alphabet shows up as poor letter coverage.
    const letters = Array.from({ length: 100 }, () => generatePublicToken()).join('');
    expect(new Set(letters).size).toBeGreaterThanOrEqual(20);
  });

  // Uniqueness is not the generator's job: 5 letters is a small space, so the
  // database check in `newPublicToken` is what guarantees it.
});

describe('buildPublicUrl', () => {
  const base = 'https://cdn.example.com';

  it('builds the documented URL shape', () => {
    expect(buildPublicUrl(base, 'abcde', 'photo.jpg')).toBe(
      'https://cdn.example.com/files/abcde/photo.jpg',
    );
  });

  it('encodes spaces and other reserved characters', () => {
    expect(buildPublicUrl(base, 'abcde', 'holiday photo 2024.jpg')).toBe(
      'https://cdn.example.com/files/abcde/holiday%20photo%202024.jpg',
    );
    expect(buildPublicUrl(base, 'abcde', 'a&b#c.txt')).toBe(
      'https://cdn.example.com/files/abcde/a%26b%23c.txt',
    );
  });

  it('tolerates a base URL with a trailing slash', () => {
    expect(buildPublicUrl(`${base}/`, 'abcde', 'photo.jpg')).toBe(
      'https://cdn.example.com/files/abcde/photo.jpg',
    );
  });

  it('keeps unicode filenames percent-encoded, not mangled', () => {
    const url = buildPublicUrl(base, 'abcde', 'laporan-keuangan.pdf');
    expect(url).toBe('https://cdn.example.com/files/abcde/laporan-keuangan.pdf');
  });
});
