'use client';

import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { AppShell } from '@/components/layout/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Toast } from '@/components/Toast';
import { ConnectionDialog } from '@/components/connections/ConnectionDialog';
import type { Connection } from '@/components/connections/types';

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; connection: Connection | null }>({
    open: false,
    connection: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/connections');
      if (!res.ok) {
        setError('Failed to load connections.');
        return;
      }
      setConnections(await res.json());
    } catch {
      setError('Network error while loading connections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  async function confirmDelete() {
    const connection = deleteTarget;
    setDeleteTarget(null);
    if (!connection) return;

    const res = await fetch(`/api/admin/connections/${connection.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to delete connection.');
      return;
    }
    void load();
  }

  async function makePrimary(connection: Connection) {
    const res = await fetch(`/api/admin/connections/${connection.id}/primary`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Could not set the primary connection.');
      return;
    }
    setToast(`${connection.label} is now the primary connection.`);
    void load();
  }

  return (
    <AppShell>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Connections
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialog({ open: true, connection: null })}
        >
          Add connection
        </Button>
      </Box>
      <Divider sx={{ mb: 2 }} />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Label</TableCell>
              <TableCell>Provider</TableCell>
              <TableCell>Bucket</TableCell>
              <TableCell>Endpoint</TableCell>
              <TableCell>Access key</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {connections.map((c) => (
              <TableRow key={c.id} hover>
                <TableCell>{c.label}</TableCell>
                <TableCell>
                  <Chip label={c.provider.toUpperCase()} size="small" variant="outlined" />
                </TableCell>
                <TableCell>{c.bucket}</TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {c.endpoint}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {c.accessKeyMasked}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5}>
                    <Chip
                      label={c.isActive ? 'Active' : 'Inactive'}
                      size="small"
                      color={c.isActive ? 'success' : 'error'}
                      variant="outlined"
                    />
                    {c.isPrimary && <Chip label="Primary" size="small" color="primary" variant="outlined" />}
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={c.isPrimary ? 'Already the primary connection' : 'Make primary'}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={c.isPrimary}
                        onClick={() => void makePrimary(c)}
                        aria-label={`Make ${c.label} primary`}
                      >
                        {c.isPrimary ? <StarIcon fontSize="small" color="primary" /> : <StarBorderIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => setDialog({ open: true, connection: c })}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" onClick={() => setDeleteTarget(c)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {connections.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  No connections yet. Add one to start uploading.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {dialog.open && (
        <ConnectionDialog
          connection={dialog.connection}
          onClose={() => setDialog({ open: false, connection: null })}
          onSaved={load}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete connection"
        message={`“${deleteTarget?.label}” will be removed. Connections still assigned to a user cannot be deleted.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
