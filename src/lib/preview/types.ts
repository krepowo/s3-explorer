/** Largest file the text editor will open. Anything bigger is download-only. */
export const MAX_EDITABLE_BYTES = 5n * 1024n * 1024n;

export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'other';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'log', 'ini', 'conf', 'env',
  'json', 'jsonc', 'xml', 'yml', 'yaml', 'toml', 'sql',
  'html', 'htm', 'css', 'scss', 'less', 'svg',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts',
  'py', 'rb', 'php', 'go', 'rs', 'java', 'kt', 'swift', 'cs', 'cpp', 'cc', 'c', 'h', 'hpp',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'dockerfile', 'makefile', 'gitignore',
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac']);

/** Lowercase extension without the dot, or '' when there is none. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/**
 * How a file should be previewed. The stored MIME type wins; the extension is
 * the fallback, because browsers report `application/octet-stream` often enough
 * that trusting it alone would send most files to "other".
 */
export function detectKind(contentType: string, filename: string): FileKind {
  const mime = contentType.toLowerCase().split(';')[0].trim();
  const ext = extensionOf(filename);

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/x-yaml' ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml')
  ) {
    return 'text';
  }

  // Octet-stream (or a wrong/missing type): fall back to the extension.
  if (ext === 'pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';

  return 'other';
}

const MONACO_LANGUAGES: Record<string, string> = {
  ts: 'typescript', mts: 'typescript', cts: 'typescript',
  tsx: 'typescript',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  json: 'json', jsonc: 'json',
  md: 'markdown', markdown: 'markdown',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  xml: 'xml', svg: 'xml',
  yml: 'yaml', yaml: 'yaml',
  py: 'python', rb: 'ruby', php: 'php', go: 'go', rs: 'rust',
  java: 'java', kt: 'kotlin', swift: 'swift', cs: 'csharp',
  cpp: 'cpp', cc: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
  sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell',
  sql: 'sql', toml: 'ini', ini: 'ini', conf: 'ini',
  dockerfile: 'dockerfile', makefile: 'makefile',
};

/** Monaco language id for a filename; plain text when unknown. */
export function monacoLanguage(filename: string): string {
  const ext = extensionOf(filename);
  if (MONACO_LANGUAGES[ext]) return MONACO_LANGUAGES[ext];

  const base = filename.toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  return 'plaintext';
}

export type EditableCheck = { ok: true } | { ok: false; error: string };

/** The 5 MB rule, in one place so the API and the UI cannot disagree. */
export function checkEditable(sizeBytes: bigint): EditableCheck {
  if (sizeBytes > MAX_EDITABLE_BYTES) {
    return { ok: false, error: 'File is larger than 5 MB — too large to edit. Download it instead.' };
  }
  return { ok: true };
}

/** Byte length of a string as UTF-8, which is what S3 stores. */
export function utf8Length(text: string): bigint {
  return BigInt(new TextEncoder().encode(text).length);
}
