'use client';

import type { SvgIconComponent } from '@mui/icons-material';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import DescriptionIcon from '@mui/icons-material/Description';
import ImageIcon from '@mui/icons-material/Image';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import MovieIcon from '@mui/icons-material/Movie';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import type { FileKind } from '@/lib/preview/types';

export const KIND_ICON: Record<FileKind, SvgIconComponent> = {
  image: ImageIcon,
  video: MovieIcon,
  audio: AudiotrackIcon,
  pdf: PictureAsPdfIcon,
  text: DescriptionIcon,
  other: InsertDriveFileIcon,
};

export const KIND_LABEL: Record<FileKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  pdf: 'PDF',
  text: 'Text',
  other: 'File',
};
