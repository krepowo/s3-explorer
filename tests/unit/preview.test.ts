import { describe, expect, it } from 'vitest';
import {
  MAX_EDITABLE_BYTES,
  checkEditable,
  detectKind,
  extensionOf,
  monacoLanguage,
  utf8Length,
} from '@/lib/preview/types';

describe('extensionOf', () => {
  it('returns the lowercase extension', () => {
    expect(extensionOf('Report.PDF')).toBe('pdf');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });

  it('returns nothing when there is no extension', () => {
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.env')).toBe('');
  });
});

describe('detectKind', () => {
  it('trusts the MIME type when it is specific', () => {
    expect(detectKind('image/png', 'whatever')).toBe('image');
    expect(detectKind('video/mp4', 'whatever')).toBe('video');
    expect(detectKind('audio/mpeg', 'whatever')).toBe('audio');
    expect(detectKind('application/pdf', 'whatever')).toBe('pdf');
    expect(detectKind('text/plain', 'whatever')).toBe('text');
    expect(detectKind('application/json', 'whatever')).toBe('text');
  });

  it('ignores MIME parameters', () => {
    expect(detectKind('text/plain; charset=utf-8', 'a.txt')).toBe('text');
  });

  it('falls back to the extension for octet-stream', () => {
    // Browsers report this for anything they do not recognise.
    expect(detectKind('application/octet-stream', 'photo.jpg')).toBe('image');
    expect(detectKind('application/octet-stream', 'clip.webm')).toBe('video');
    expect(detectKind('application/octet-stream', 'song.flac')).toBe('audio');
    expect(detectKind('application/octet-stream', 'notes.md')).toBe('text');
    expect(detectKind('application/octet-stream', 'report.pdf')).toBe('pdf');
  });

  it('falls back to the extension when the type is wrong or empty', () => {
    expect(detectKind('', 'script.py')).toBe('text');
    expect(detectKind('application/octet-stream', 'data.csv')).toBe('text');
  });

  it('reports unknown types as other', () => {
    expect(detectKind('application/octet-stream', 'archive.zip')).toBe('other');
    expect(detectKind('application/zip', 'archive.zip')).toBe('other');
  });

  it('treats +json and +xml suffixes as text', () => {
    expect(detectKind('application/vnd.api+json', 'payload')).toBe('text');
    expect(detectKind('image/svg+xml', 'icon')).toBe('image');
  });
});

describe('monacoLanguage', () => {
  it('maps common extensions', () => {
    expect(monacoLanguage('main.ts')).toBe('typescript');
    expect(monacoLanguage('component.tsx')).toBe('typescript');
    expect(monacoLanguage('data.json')).toBe('json');
    expect(monacoLanguage('README.md')).toBe('markdown');
    expect(monacoLanguage('style.css')).toBe('css');
    expect(monacoLanguage('deploy.sh')).toBe('shell');
    expect(monacoLanguage('query.sql')).toBe('sql');
  });

  it('maps extensionless build files by name', () => {
    expect(monacoLanguage('Dockerfile')).toBe('dockerfile');
    expect(monacoLanguage('Makefile')).toBe('makefile');
  });

  it('falls back to plaintext', () => {
    expect(monacoLanguage('notes.unknownext')).toBe('plaintext');
    expect(monacoLanguage('LICENSE')).toBe('plaintext');
  });
});

describe('checkEditable', () => {
  it('accepts a file at the limit', () => {
    expect(checkEditable(MAX_EDITABLE_BYTES)).toEqual({ ok: true });
  });

  it('rejects a file one byte over', () => {
    const result = checkEditable(MAX_EDITABLE_BYTES + 1n);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('5 MB');
  });
});

describe('utf8Length', () => {
  it('counts bytes, not characters', () => {
    expect(utf8Length('abc')).toBe(3n);
    // Multi-byte characters count for more than one byte each.
    expect(utf8Length('é')).toBe(2n);
    expect(utf8Length('日本語')).toBe(9n);
  });
});
