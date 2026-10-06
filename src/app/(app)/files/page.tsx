'use client';

import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import GridViewIcon from '@mui/icons-material/GridView';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import TableRowsIcon from '@mui/icons-material/TableRows';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { AppShell } from '@/components/layout/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Toast, type ToastSeverity } from '@/components/Toast';
import { FileThumb } from '@/components/files/FileThumb';
import { UploadDialog } from '@/components/files/UploadDialog';
import { RenameDialog } from '@/components/files/RenameDialog';
import { PreviewDialog, PreviewLoadingDialog, type PreviewFile } from '@/components/preview/PreviewDialog';
import type { UploadedFile } from '@/components/files/types';
import { formatBytes } from '@/lib/uploads/filename';

/** True when a drag is carrying files rather than text or a selection. */
function carriesFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

/*
  The filename is the preview trigger and the only one: it reads as a link, so a
  single click is discoverable without the hint line. Nothing else in the row or
  the card opens a preview, which keeps a stray click elsewhere harmless.
*/
const FILENAME_SX = {
  cursor: 'pointer',
  color: 'primary.main',
  '&:hover': { textDecoration: 'underline' },
} as const;

export default function FilesPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name' | 'size'>('newest');
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [dropped, setDropped] = useState<File[] | null>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const [renameTarget, setRenameTarget] = useState<UploadedFile | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewFile | null>(null);
  const [previewLoading, setPreviewLoading] = useState<UploadedFile | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<UploadedFile[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; severity: ToastSeverity } | null>(null);

  /*
    Selection is kept as ids and intersected with what is on screen, so a search
    change can never leave the bulk actions pointing at a file the user cannot
    see. Nothing has to be cleared when the list reloads.
  */
  const selectedFiles = files.filter((file) => selected.has(file.id));
  const allSelected = files.length > 0 && files.every((file) => selected.has(file.id));

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(files.map((file) => file.id)));
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ sort });
    if (search) params.set('search', search);
    try {
      const res = await fetch(`/api/uploads?${params.toString()}`);
      if (!res.ok) {
        setError('Failed to load files.');
        return;
      }
      const data = await res.json();
      setFiles(data.files ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('Network error while loading files.');
    } finally {
      setLoading(false);
    }
  }, [search, sort]);

  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  async function copyLink(file: UploadedFile) {
    await navigator.clipboard.writeText(file.publicUrl);
    setToast({ message: `Link copied: ${file.filename}`, severity: 'success' });
  }

  async function confirmDelete() {
    const targets = deleteTargets;
    setDeleteTargets(null);
    if (!targets?.length) return;

    /*
      Reuse the single-file endpoint rather than adding a batch route: it already
      does the S3 delete, the row delete and the audit entry, and a partial
      failure is reported per file instead of rolling everything back.
    */
    const results = await Promise.all(
      targets.map(async (file) => ({
        ok: (await fetch(`/api/uploads/${file.id}`, { method: 'DELETE' })).ok,
      })),
    );

    const failed = results.filter((result) => !result.ok).length;
    if (failed) {
      setError(`Deleted ${targets.length - failed} of ${targets.length} file(s); ${failed} failed.`);
    } else {
      setToast({
        message:
          targets.length === 1
            ? `Deleted ${targets[0].filename}`
            : `Deleted ${targets.length} files`,
        severity: 'success',
      });
    }
    setSelected(new Set());
    void load();
  }

  async function handlePreview(file: UploadedFile) {
    // Open the loading dialog first: resolving the content URL is a round trip,
    // and a click that shows nothing for that long reads as broken.
    setPreviewLoading(file);
    try {
      const res = await fetch(`/api/uploads/${file.id}/content-url`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Could not open this file.');
        return;
      }
      if (data.kind === 'other') {
        setToast({
          message: `${file.filename} cannot be previewed — download it instead.`,
          severity: 'info',
        });
        return;
      }
      setPreviewTarget(data);
    } catch {
      setError('Network error while opening this file.');
    } finally {
      setPreviewLoading(null);
    }
  }

  function closeUpload() {
    setUploadOpen(false);
    setDropped(null);
    // A drop inside the dialog never reaches the page's onDrop, so the depth
    // counter can still be non-zero — clear it or the overlay sticks.
    setDragDepth(0);
  }

  const actions = (file: UploadedFile) => (
    <>
      <Tooltip title="Preview">
        <IconButton size="small" onClick={() => void handlePreview(file)}>
          <VisibilityIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Copy public link">
        <IconButton size="small" onClick={() => void copyLink(file)}>
          <LinkIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Open public link">
        <IconButton size="small" component="a" href={file.publicUrl} target="_blank" rel="noreferrer">
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Rename">
        <IconButton size="small" onClick={() => setRenameTarget(file)}>
          <DriveFileRenameOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete">
        <IconButton size="small" onClick={() => setDeleteTargets([file])}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );

  const dragging = dragDepth > 0;

  return (
    /*
      Drop anywhere on the page to upload. This wrapper sits above AppShell so a
      drop on the top bar or the sidebar counts too. dragenter/dragleave fire for
      every child the pointer crosses, so the depth counter — not the event
      itself — decides whether the overlay is showing.
    */
    <Box
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setDragDepth((depth) => depth + 1);
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!carriesFiles(event)) return;
        setDragDepth((depth) => Math.max(0, depth - 1));
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setDragDepth(0);
        const files = Array.from(event.dataTransfer.files);
        if (files.length === 0) return;
        setDropped(files);
        setUploadOpen(true);
      }}
    >
    <AppShell>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, flexGrow: 1 }}>
            Files
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setUploadOpen(true)}>
            Upload
          </Button>
        </Box>
        <Divider sx={{ mb: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Click a file name to preview it, or drop files anywhere on this page to upload.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            label="Search by name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            size="small"
            sx={{ minWidth: 240 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Sort</InputLabel>
            <Select
              value={sort}
              label="Sort"
              onChange={(event) => setSort(event.target.value as typeof sort)}
            >
              <MenuItem value="newest">Newest first</MenuItem>
              <MenuItem value="oldest">Oldest first</MenuItem>
              <MenuItem value="name">Name</MenuItem>
              <MenuItem value="size">Largest first</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ flexGrow: 1 }} />
          <ToggleButtonGroup
            exclusive
            size="small"
            value={view}
            onChange={(_event, next) => next && setView(next)}
            aria-label="Change layout"
          >
            <ToggleButton value="table" aria-label="Table view">
              <TableRowsIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="grid" aria-label="Grid view">
              <GridViewIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {selectedFiles.length > 0 && (
          <Stack
            direction="row"
            spacing={2}
            sx={{
              mb: 2,
              px: 2,
              py: 1,
              alignItems: 'center',
              bgcolor: 'action.hover',
              borderRadius: 1,
            }}
          >
            <Typography variant="body2">{selectedFiles.length} selected</Typography>
            <Button
              size="small"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteTargets(selectedFiles)}
            >
              Delete selected
            </Button>
            <Button size="small" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </Stack>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
            <CircularProgress />
          </Box>
        ) : files.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10, color: 'text.secondary' }}>
            <UploadFileIcon sx={{ fontSize: 48, mb: 1 }} />
            <Typography variant="h6" component="h2">No files yet</Typography>
            <Typography variant="body2">
              {search ? 'Nothing matches that search.' : 'Upload a file to get a public link.'}
            </Typography>
            <Button sx={{ mt: 2 }} variant="contained" startIcon={<AddIcon />} onClick={() => setUploadOpen(true)}>
              Upload
            </Button>
          </Box>
        ) : view === 'table' ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selectedFiles.length > 0 && !allSelected}
                    onChange={toggleAll}
                    slotProps={{ input: { 'aria-label': 'Select all files' } }}
                  />
                </TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Uploaded</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.has(file.id)}
                      onChange={() => toggleOne(file.id)}
                      slotProps={{ input: { 'aria-label': `Select ${file.filename}` } }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box
                      component="span"
                      onClick={() => void handlePreview(file)}
                      sx={FILENAME_SX}
                    >
                      {file.filename}
                    </Box>
                  </TableCell>
                  <TableCell>{file.ownerName ?? file.ownerEmail ?? '—'}</TableCell>
                  <TableCell>{formatBytes(BigInt(file.sizeBytes))}</TableCell>
                  <TableCell>{file.contentType}</TableCell>
                  <TableCell>{new Date(file.createdAt).toLocaleString()}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {actions(file)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            }}
          >
            {files.map((file) => (
              <Card
                key={file.id}
                variant="outlined"
                sx={{ display: 'flex', flexDirection: 'column' }}
              >
                <Box sx={{ p: 1.5, pb: 0, position: 'relative' }}>
                  <FileThumb file={file} size={140} full />
                  <Checkbox
                    checked={selected.has(file.id)}
                    onChange={() => toggleOne(file.id)}
                    slotProps={{ input: { 'aria-label': `Select ${file.filename}` } }}
                    sx={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                      bgcolor: 'background.paper',
                      borderRadius: 1,
                    }}
                  />
                </Box>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography
                    variant="subtitle1"
                    component="div"
                    onClick={() => void handlePreview(file)}
                    sx={{ fontWeight: 600, wordBreak: 'break-all', ...FILENAME_SX }}
                  >
                    {file.filename}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatBytes(BigInt(file.sizeBytes))} · {file.contentType}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {file.ownerName ?? file.ownerEmail ?? '—'} ·{' '}
                    {new Date(file.createdAt).toLocaleDateString()}
                  </Typography>
                </CardContent>
                <CardActions sx={{ justifyContent: 'flex-end' }}>
                  {actions(file)}
                </CardActions>
              </Card>
            ))}
          </Box>
        )}

        {!loading && files.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            {files.length} of {total} file(s)
          </Typography>
        )}

      {/*
        Hidden while the upload dialog is up: the dialog has its own drop zone,
        and a full-screen overlay at z-index modal+1 would paint over it.
      */}
      {dragging && !uploadOpen && (
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: (t) => t.zIndex.modal + 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 1,
            bgcolor: 'rgba(0, 0, 0, 0.55)',
            border: 4,
            borderStyle: 'dashed',
            borderColor: 'primary.main',
            color: '#FFFFFF',
            // The overlay must never swallow the drop event.
            pointerEvents: 'none',
          }}
        >
          <CloudUploadIcon sx={{ fontSize: 64 }} />
          <Typography variant="h5" component="p">Drop to upload</Typography>
        </Box>
      )}

      {uploadOpen && (
        <UploadDialog
          onClose={closeUpload}
          onUploaded={load}
          batch={dropped ?? undefined}
        />
      )}
      {renameTarget && (
        <RenameDialog
          fileId={renameTarget.id}
          currentName={renameTarget.filename}
          onClose={() => setRenameTarget(null)}
          onRenamed={load}
        />
      )}
      {previewLoading && (
        <PreviewLoadingDialog
          filename={previewLoading.filename}
          onClose={() => setPreviewLoading(null)}
        />
      )}
      {previewTarget && (
        <PreviewDialog
          file={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onSaved={load}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteTargets?.length)}
        title={deleteTargets && deleteTargets.length > 1 ? 'Delete files' : 'Delete file'}
        message={
          deleteTargets && deleteTargets.length > 1
            ? `${deleteTargets.length} files will be removed from storage and their public links will stop working.`
            : `“${deleteTargets?.[0]?.filename}” will be removed from storage and its public link will stop working.`
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTargets(null)}
      />
      <Toast
        message={toast?.message ?? ''}
        severity={toast?.severity}
        onClose={() => setToast(null)}
      />
    </AppShell>
    </Box>
  );
}
