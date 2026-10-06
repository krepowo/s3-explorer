'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { AppShell } from '@/components/layout/AppShell';

type AuditLog = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (actorId) params.set('actorId', actorId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    try {
      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
    } finally {
      setLoading(false);
    }
  }, [action, actorId, from, to]);

  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  return (
    <AppShell>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
        Audit log
      </Typography>
      <Divider sx={{ mb: 2 }} />

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          label="Action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          size="small"
          placeholder="e.g. auth.login"
        />
        <TextField
          label="Actor ID"
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
          size="small"
        />
        <TextField
          label="From"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="To"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button variant="contained" onClick={load} disabled={loading}>
          {loading ? <CircularProgress size={16} color="inherit" /> : 'Filter'}
        </Button>
      </Box>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Time</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>Actor</TableCell>
            <TableCell>Target</TableCell>
            <TableCell>IP</TableCell>
            <TableCell>Metadata</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id} hover>
              <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
              <TableCell>
                <Chip label={log.action} size="small" color="primary" variant="outlined" />
              </TableCell>
              <TableCell>{log.actorEmail ?? log.actorId ?? '—'}</TableCell>
              <TableCell>{log.targetType && log.targetId ? `${log.targetType}:${log.targetId.slice(0, 8)}` : '—'}</TableCell>
              <TableCell>{log.ip ?? '—'}</TableCell>
              <TableCell>{log.metadata ? JSON.stringify(log.metadata).slice(0, 80) : '—'}</TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                No audit entries match the filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </AppShell>
  );
}
