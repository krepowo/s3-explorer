'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Toast } from '@/components/Toast';
import { formatBytes } from '@/lib/uploads/filename';
import { uploadAll, type UploadProgress } from './upload';
import type { UploadedFile } from './types';

type ConnectionOption = { id: string; label: string; isPrimary: boolean };

export function UploadDialog({
  onClose,
  onUploaded,
  batch,
}: {
  onClose: () => void;
  onUploaded: () => void;
  /**
   * Files dropped on the page. They are *staged*, not uploaded: the user picks a
   * connection and presses Upload. Each drop is a fresh array, so every batch is
   * staged — not just the first one.
   */
  batch?: File[];
}) {
  const [staged, setStaged] = useState<{ id: string; file: File }[]>([]);
  const [progress, setProgress] = useState<UploadProgress[]>([]);
  const [uploaded, setUploaded] = useState<UploadedFile[]>([]);
  const [toast, setToast] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // start() reads the choice through a ref: a drop can arrive before the picker
  // has loaded, and a stale closure would lose the choice.
  const connectionRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    connectionRef.current = connectionId || undefined;
  }, [connectionId]);

  useEffect(() => {
    void fetch('/api/connections')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: ConnectionOption[]) => {
        setConnections(list);
        setConnectionId(list[0]?.id ?? '');
      })
      .catch(() => {});
  }, []);

  const stage = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setStaged((current) => [
      ...current,
      ...files.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  }, []);

  /*
    Comparing by array identity — rather than latching a "started" flag — is what
    lets a second drop be staged too: the page builds a new array per drop, so
    every batch is consumed exactly once. The ref also keeps a re-render with an
    unchanged array from staging the same files twice.
  */
  const consumed = useRef<File[] | null>(null);
  useEffect(() => {
    if (!batch?.length || consumed.current === batch) return;
    consumed.current = batch;
    stage(batch);
  }, [batch, stage]);

  const start = useCallback(async () => {
    const entries = staged;
    if (entries.length === 0) return;
    setBusy(true);
    // Clear the queue so a second press cannot re-upload the same files.
    setStaged([]);
    setProgress(
      entries.map(({ id, file }) => ({
        id,
        name: file.name,
        percent: 0,
        bytesPerSecond: 0,
        status: 'uploading' as const,
      })),
    );

    const results = await uploadAll(
      entries,
      (update) => {
        setProgress((prev) => prev.map((item) => (item.id === update.id ? { ...item, ...update } : item)));
      },
      connectionRef.current,
    );

    const done = results.flatMap((result) => (result.file ? [result.file] : []));
    setUploaded((prev) => [...prev, ...done]);
    setBusy(false);
    if (done.length > 0) onUploaded();
  }, [staged, onUploaded]);

  const failed = progress.filter((item) => item.status === 'error');
  const label = (count: number) => `Upload ${count} file${count === 1 ? '' : 's'}`;

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Upload files</DialogTitle>
      <DialogContent>
        {/* With a single usable connection there is nothing to choose. */}
        {connections.length > 1 && (
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Connection</InputLabel>
            <Select
              value={connectionId}
              label="Connection"
              disabled={busy}
              onChange={(event) => setConnectionId(event.target.value)}
            >
              {connections.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.label}
                  {option.isPrimary ? ' (primary)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/*
          The page owns every drop — including ones that land here — so a single
          batch is queued exactly once. This box only clears its own highlight;
          the event keeps bubbling to the page handler.
        */}
        <Box
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          sx={{
            border: 2,
            borderStyle: 'dashed',
            borderColor: dragging ? 'primary.main' : 'divider',
            bgcolor: dragging ? 'action.hover' : 'transparent',
            borderRadius: 1,
            py: 5,
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          <CloudUploadIcon color="primary" sx={{ fontSize: 40 }} />
          <Typography variant="body1" sx={{ mt: 1 }}>
            Drag files here, or click to choose
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Pick a connection, then press Upload — nothing is sent until you do.
          </Typography>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              stage(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </Box>

        {staged.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" component="h3">
              Ready to upload ({staged.length})
            </Typography>
            <List dense>
              {staged.map(({ id, file }) => (
                <ListItem key={id} disableGutters>
                  <ListItemText primary={file.name} secondary={formatBytes(BigInt(file.size))} />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {progress.length > 0 && (
          <List dense sx={{ mt: 2 }}>
            {progress.map((item) => (
              <ListItem key={item.id} sx={{ display: 'block' }}>
                <ListItemText
                  primary={item.name}
                  secondary={
                    item.status === 'error'
                      ? item.error
                      : item.status === 'done'
                        ? 'Uploaded'
                        : item.bytesPerSecond > 0
                          ? `${item.percent}% · ${formatBytes(BigInt(Math.round(item.bytesPerSecond)))}/s`
                          : `${item.percent}%`
                  }
                  slotProps={{ secondary: { color: item.status === 'error' ? 'error' : 'text.secondary' } }}
                />
                <LinearProgress
                  variant="determinate"
                  value={item.status === 'done' ? 100 : item.percent}
                  color={item.status === 'error' ? 'error' : item.status === 'done' ? 'success' : 'primary'}
                />
              </ListItem>
            ))}
          </List>
        )}

        {failed.length > 0 && !busy && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {failed.length} of {progress.length} uploads failed.
          </Alert>
        )}

        {uploaded.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" component="h3">Public links</Typography>
            <List dense>
              {uploaded.map((file) => (
                <ListItem
                  key={file.id}
                  disableGutters
                  secondaryAction={
                    <Tooltip title="Copy link">
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => {
                          void navigator.clipboard.writeText(file.publicUrl);
                          setToast(`Link copied: ${file.filename}`);
                        }}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <ListItemText
                    primary={file.filename}
                    secondary={file.publicUrl}
                    slotProps={{
                      secondary: { sx: { fontFamily: 'monospace', wordBreak: 'break-all' } },
                    }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button onClick={() => void start()} variant="contained" disabled={busy || staged.length === 0}>
          {busy ? 'Uploading…' : staged.length > 0 ? label(staged.length) : 'Upload'}
        </Button>
      </DialogActions>
      <Toast message={toast} onClose={() => setToast('')} />
    </Dialog>
  );
}
