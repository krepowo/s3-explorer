/** Max filename length, measured in characters, extension included. */
export const MAX_FILENAME_LENGTH = 200;

const FALLBACK_NAME = 'file';

/**
 * Makes an untrusted filename safe to use as an object-key segment.
 *
 * Keeps only the final path segment, so a crafted name can never escape the
 * `files/<token>/` prefix. Control characters are dropped and characters that
 * are invalid in Windows filenames become dashes. Unicode letters and spaces
 * are kept — they get percent-encoded when the public URL is built.
 */
export function sanitizeFilename(input: string): string {
  const base = input.split(/[/\\]/).pop() ?? '';

  let name = base
    // Control characters (NUL, newlines, …).
    .replace(/[\u0000-\u001f\u007f]/g, '')
    // Characters Windows rejects, plus the drive/ADS separator.
    .replace(/[:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    // Leading dots mean "hidden" on Unix and enable traversal; drop them.
    .replace(/^\.+/, '');

  if (name.length > MAX_FILENAME_LENGTH) {
    const { stem, ext } = splitExtension(name);
    name = stem.slice(0, Math.max(1, MAX_FILENAME_LENGTH - ext.length)) + ext;
  }

  return name || FALLBACK_NAME;
}

/** Splits `report.tar.gz` into `{ stem: 'report.tar', ext: '.gz' }`. */
function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  // A leading dot (e.g. `.env`) is part of the stem, not an extension.
  if (dot <= 0) return { stem: name, ext: '' };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

/**
 * Picks the first free name in the owner's namespace: `file.zip`, `file-1.zip`,
 * `file-2.zip`, … `taken` holds filenames already used by that owner.
 */
export function nextAvailableFilename(filename: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(filename)) return filename;

  const { stem, ext } = splitExtension(filename);
  for (let n = 1; ; n += 1) {
    const candidate = `${stem}-${n}${ext}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Object key for a file: `files/<ownerToken>/<filename>`. */
export function buildObjectKey(ownerToken: string, filename: string): string {
  return `files/${ownerToken}/${filename}`;
}

/** Last key segment — the inverse of {@link buildObjectKey}. */
export function filenameFromKey(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1);
}

/** True when `key` sits inside the given owner's namespace. */
export function keyBelongsToToken(key: string, ownerToken: string): boolean {
  return key.startsWith(`files/${ownerToken}/`) && filenameFromKey(key).length > 0;
}

export type LimitCheck = { ok: true } | { ok: false; error: string };

/** Enforces the per-user upload limit for a single file. */
export function checkUploadLimit(sizeBytes: bigint, limitBytes: bigint): LimitCheck {
  if (sizeBytes <= 0n) return { ok: false, error: 'File is empty.' };
  if (sizeBytes > limitBytes) {
    return {
      ok: false,
      error: `File is larger than your ${formatBytes(limitBytes)} upload limit.`,
    };
  }
  return { ok: true };
}

/** Human-readable size, e.g. `2 GB`, `512 MB`. */
export function formatBytes(bytes: bigint): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
