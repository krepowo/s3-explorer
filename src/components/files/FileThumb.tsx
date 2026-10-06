'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import { detectKind } from '@/lib/preview/types';
import { KIND_ICON } from '@/components/preview/kind';

export type ThumbFile = {
  filename: string;
  contentType: string;
  publicUrl: string;
};

/**
 * Square preview for a file: the real image, the first video frame, or an icon
 * for anything a browser cannot paint.
 *
 * The image comes straight from the public URL — no thumbnail pipeline, no
 * signed URL round-trip. The trade-off is that the grid downloads the full
 * originals; `loading="lazy"` keeps that to what is on screen. Move to
 * server-side thumbnails if the pool ever holds multi-megabyte photos.
 */
export function FileThumb({
  file,
  size = 48,
  radius = 1,
  full = false,
}: {
  file: ThumbFile;
  /** Height in px; width follows it unless `full` is set. */
  size?: number;
  radius?: number;
  /** Stretch to the parent's width instead of staying square. */
  full?: boolean;
}) {
  // A public URL can rot — the object deleted, the CDN 404ing, the connection
  // misconfigured — so a failed load falls back to the icon rather than leaving
  // the browser's broken-image glyph in the grid.
  const [broken, setBroken] = useState(false);
  const kind = detectKind(file.contentType, file.filename);
  // Default to a square of `size`. A bare `width: 100%` makes the thumb the
  // flexible item of any flex parent, so it swallows the whole row and pushes
  // the sibling text into a sliver at the edge — only the full-width grid card
  // wants that, hence the opt-in.
  const box = {
    width: full ? '100%' : size,
    height: size,
    borderRadius: radius,
    bgcolor: 'action.hover',
    flexShrink: 0,
    display: 'block',
  } as const;

  if (kind === 'image' && !broken) {
    return (
      <Box
        component="img"
        src={file.publicUrl}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        sx={{ ...box, objectFit: 'cover' }}
      />
    );
  }

  // `preload="metadata"` makes the browser fetch just enough to paint frame one.
  if (kind === 'video' && !broken) {
    return (
      <Box
        component="video"
        src={file.publicUrl}
        preload="metadata"
        muted
        playsInline
        aria-hidden
        onError={() => setBroken(true)}
        sx={{ ...box, objectFit: 'cover', bgcolor: 'black' }}
      />
    );
  }

  const Icon = KIND_ICON[kind];
  return (
    <Box
      sx={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon sx={{ fontSize: Math.round(size * 0.5), color: 'text.secondary' }} aria-hidden />
    </Box>
  );
}
