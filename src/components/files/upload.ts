'use client';

import type { UploadedFile } from './types';

export type UploadProgress = {
  /** Identifies the staged entry, so two files with the same name stay separate. */
  id: string;
  name: string;
  percent: number;
  bytesPerSecond: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
};

export type UploadTick = { percent: number; bytesPerSecond: number };

export type UploadResult = { name: string; error?: string; file?: UploadedFile };

/**
 * Turns XHR progress events into a readable throughput number.
 *
 * The first event only sets the baseline (nothing has moved yet, so there is no
 * rate to report). After that a rate is computed over `windowMs` and blended
 * with the previous value — the raw per-event number jumps around far too much
 * to put in front of a user.
 */
export function createSpeedSampler(windowMs = 300) {
  let lastLoaded = 0;
  let lastAt = 0;
  let speed = 0;
  let started = false;

  return {
    /** Bytes per second, smoothed. Call on every progress event. */
    sample(loaded: number, at: number = Date.now()): number {
      if (!started) {
        started = true;
        lastLoaded = loaded;
        lastAt = at;
        return 0;
      }

      const elapsed = (at - lastAt) / 1000;
      if (elapsed < windowMs / 1000) return speed;

      const instant = elapsed > 0 ? (loaded - lastLoaded) / elapsed : 0;
      speed = speed === 0 ? instant : speed * 0.6 + instant * 0.4;
      lastLoaded = loaded;
      lastAt = at;
      return speed;
    },
  };
}

/**
 * Uploads one file: presign, PUT the bytes straight to S3, then register.
 * Progress comes from XHR, which is the only API that reports upload progress.
 */
export function uploadFile(
  file: File,
  onProgress: (tick: UploadTick) => void,
  connectionId?: string,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    void (async () => {
      let target: { key: string; uploadUrl: string; connectionId: string };
      try {
        const res = await fetch('/api/uploads/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            sizeBytes: file.size,
            contentType: file.type || 'application/octet-stream',
            connectionId,
          }),
        });
        const data = await res.json();
        if (!res.ok) return reject(new Error(data.error ?? 'Upload was rejected.'));
        target = data;
      } catch {
        return reject(new Error('Could not reach the server.'));
      }

      const xhr = new XMLHttpRequest();
      const speed = createSpeedSampler();
      xhr.open('PUT', target.uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      // Keep the last reading: zeroing it on completion would wipe the only
      // sample a short upload ever produced.
      let lastRate = 0;
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        lastRate = speed.sample(event.loaded);
        onProgress({
          percent: Math.round((event.loaded / event.total) * 100),
          bytesPerSecond: lastRate,
        });
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          return reject(new Error(`Upload failed (HTTP ${xhr.status}).`));
        }
        void (async () => {
          try {
            const res = await fetch('/api/uploads/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              // Echo the connection presign used, so the object is looked up in
            // the same bucket even if the primary changed meanwhile.
            body: JSON.stringify({ key: target.key, connectionId: target.connectionId }),
            });
            const data = await res.json();
            if (!res.ok) return reject(new Error(data.error ?? 'Could not record the upload.'));
            onProgress({ percent: 100, bytesPerSecond: lastRate });
            resolve(data as UploadedFile);
          } catch {
            reject(new Error('Upload finished but could not be recorded.'));
          }
        })();
      };
      // `onerror` fires when the browser blocks the request before sending it —
      // a CORS preflight refusal looks exactly like a dead network from here.
      xhr.onerror = () =>
        reject(
          new Error('Could not reach the storage bucket — check its CORS policy and your network.'),
        );
      xhr.send(file);
    })();
  });
}

/**
 * Runs uploads with a small concurrency cap so a big drop does not stall.
 *
 * Takes staged entries rather than bare files: progress is reported per entry id,
 * so staging the same file twice does not make one row overwrite the other.
 */
export async function uploadAll(
  entries: { id: string; file: File }[],
  onProgress: (progress: UploadProgress) => void,
  connectionId?: string,
  concurrency = 3,
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  const queue = [...entries];

  async function worker() {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;
      const { id, file } = entry;
      onProgress({ id, name: file.name, percent: 0, bytesPerSecond: 0, status: 'uploading' });
      try {
        const uploaded = await uploadFile(
          file,
          (tick) => onProgress({ id, name: file.name, ...tick, status: 'uploading' }),
          connectionId,
        );
        onProgress({ id, name: file.name, percent: 100, bytesPerSecond: 0, status: 'done' });
        results.push({ name: file.name, file: uploaded });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed.';
        onProgress({ id, name: file.name, percent: 0, bytesPerSecond: 0, status: 'error', error: message });
        results.push({ name: file.name, error: message });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  return results;
}
