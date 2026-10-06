'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import DownloadIcon from '@mui/icons-material/Download';
import SaveIcon from '@mui/icons-material/Save';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Toast } from '@/components/Toast';
import { monacoLanguage, type FileKind } from '@/lib/preview/types';

// Monaco touches `window` at import time, so it must never render on the server.
const Editor = dynamic(() => import('@monaco-editor/react').then((mod) => mod.default), {
  ssr: false,
  loading: () => <CircularProgress size={20} />,
});

export type PreviewFile = {
  id: string;
  filename: string;
  kind: FileKind;
  editable: boolean;
  sizeBytes: string;
  contentUrl: string;
};

/**
 * Shown the instant a preview is requested, while its content URL is still being
 * fetched. Without it a click looks like it did nothing until the request lands.
 */
export function PreviewLoadingDialog({
  filename,
  onClose,
}: {
  filename: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{filename}</DialogTitle>
      <DialogContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          Preparing preview…
        </Typography>
      </DialogContent>
    </Dialog>
  );
}

/** Image / video / PDF / audio / text preview, all in one dialog. */
export function PreviewDialog({
  file,
  onClose,
  onSaved,
}: {
  file: PreviewFile;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(file.kind === 'text');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = file.kind === 'text' && content !== original;
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (file.kind !== 'text') return;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/uploads/${file.id}/text`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Could not load the file.');
          return;
        }
        setContent(data.content);
        setOriginal(data.content);
      } catch {
        setError('Network error while loading the file.');
      } finally {
        setLoading(false);
      }
    })();
  }, [file.id, file.kind]);

  // Warn before a reload discards unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const requestClose = useCallback(() => {
    if (dirtyRef.current) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }, [onClose]);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/uploads/${file.id}/text`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not save the file.');
        return;
      }
      setOriginal(content);
      setToast('Saved');
      onSaved?.();
    } catch {
      setError('Network error while saving.');
    } finally {
      setSaving(false);
    }
  }

  const title = file.filename;

  return (
    <Dialog open onClose={requestClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ wordBreak: 'break-all', pr: 6 }}>{title}</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {file.kind === 'image' && (
          <Box
            component="img"
            src={file.contentUrl}
            alt={file.filename}
            sx={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', mx: 'auto', objectFit: 'contain' }}
          />
        )}

        {file.kind === 'video' && (
          <Box
            component="video"
            src={file.contentUrl}
            controls
            autoPlay
            sx={{
              display: 'block',
              width: '100%',
              maxHeight: '70vh',
              mx: 'auto',
              bgcolor: 'black',
              borderRadius: 1,
            }}
          />
        )}

        {file.kind === 'pdf' && (
          <Box
            component="iframe"
            src={file.contentUrl}
            title={file.filename}
            sx={{ width: '100%', height: '70vh', border: 0 }}
          />
        )}

        {file.kind === 'audio' && (
          <Box
            component="audio"
            src={file.contentUrl}
            controls
            sx={{ display: 'block', width: '100%', mt: 2 }}
          />
        )}

        {file.kind === 'text' &&
          (loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ height: '60vh' }}>
              <Editor
                height="100%"
                language={monacoLanguage(file.filename)}
                value={content}
                onChange={(value) => setContent(value ?? '')}
                options={{ minimap: { enabled: false }, wordWrap: 'on', fontSize: 14 }}
              />
            </Box>
          ))}

        {file.kind === 'other' && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography variant="h6" component="h3">No preview for this file type</Typography>
            <Typography variant="body2" color="text.secondary">
              Download it to open it locally.
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button
          component="a"
          href={file.contentUrl}
          download={file.filename}
          startIcon={<DownloadIcon />}
        >
          Download
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={requestClose}>{dirty ? 'Discard' : 'Close'}</Button>
        {file.kind === 'text' && (
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            disabled={!dirty || saving || loading}
            onClick={() => void save()}
          >
            Save
          </Button>
        )}
      </DialogActions>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes"
        message="Your edits to this file have not been saved."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
      <Toast message={toast} onClose={() => setToast('')} />
    </Dialog>
  );
}
