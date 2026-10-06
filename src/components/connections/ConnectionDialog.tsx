'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Connection } from './types';

export const PROVIDERS = ['r2', 's3', 'b2', 'minio', 'other'] as const;

export type ConnectionForm = {
  label: string;
  provider: string;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  bucket: string;
  publicBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
  isActive: boolean;
};

const EMPTY: ConnectionForm = {
  label: '',
  provider: 'r2',
  endpoint: '',
  region: 'auto',
  forcePathStyle: false,
  bucket: '',
  publicBaseUrl: '',
  accessKeyId: '',
  secretAccessKey: '',
  isActive: true,
};

function fromConnection(c: Connection): ConnectionForm {
  return {
    label: c.label,
    provider: c.provider,
    endpoint: c.endpoint,
    region: c.region,
    forcePathStyle: c.forcePathStyle,
    bucket: c.bucket,
    publicBaseUrl: c.publicBaseUrl,
    accessKeyId: '',
    secretAccessKey: '',
    isActive: c.isActive,
  };
}

export function ConnectionDialog({
  connection,
  onClose,
  onSaved,
}: {
  connection: Connection | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = connection !== null;
  const [form, setForm] = useState<ConnectionForm>(connection ? fromConnection(connection) : EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Credentials are required when creating, optional when editing (blank = keep stored).
  const credentialsComplete = Boolean(form.accessKeyId && form.secretAccessKey);
  const canTest = editing ? true : credentialsComplete;

  function set<K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTestResult(null);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = editing && !credentialsComplete
        ? await fetch(`/api/admin/connections/${connection.id}/test`, { method: 'POST' })
        : await fetch('/api/admin/connections/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          });
      const data = await res.json();
      setTestResult(
        data.ok
          ? { ok: true, message: 'Connection succeeded — bucket is reachable.' }
          : { ok: false, message: data.error || 'Connection failed.' },
      );
    } catch {
      setTestResult({ ok: false, message: 'Network error while testing.' });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    // On edit, drop blank credentials so the stored ones survive.
    const payload: Record<string, unknown> = { ...form };
    if (editing && !credentialsComplete) {
      delete payload.accessKeyId;
      delete payload.secretAccessKey;
    }

    try {
      const res = await fetch(
        editing ? `/api/admin/connections/${connection.id}` : '/api/admin/connections',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Failed to save');
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? 'Edit connection' : 'Add connection'}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Label"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            required
            fullWidth
            autoFocus
          />

          <Stack direction="row" spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Provider</InputLabel>
              <Select
                value={form.provider}
                label="Provider"
                onChange={(e) => set('provider', e.target.value)}
              >
                {PROVIDERS.map((p) => (
                  <MenuItem key={p} value={p}>{p.toUpperCase()}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Region"
              value={form.region}
              onChange={(e) => set('region', e.target.value)}
              required
              fullWidth
              helperText="R2 uses “auto”"
            />
          </Stack>

          <TextField
            label="Endpoint"
            value={form.endpoint}
            onChange={(e) => set('endpoint', e.target.value)}
            required
            fullWidth
            placeholder="https://<account>.r2.cloudflarestorage.com"
          />

          <Stack direction="row" spacing={2}>
            <TextField
              label="Bucket"
              value={form.bucket}
              onChange={(e) => set('bucket', e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Public base URL"
              value={form.publicBaseUrl}
              onChange={(e) => set('publicBaseUrl', e.target.value)}
              required
              fullWidth
              placeholder="https://cdn.example.com"
              helperText="No trailing slash"
            />
          </Stack>

          <Typography variant="subtitle2" component="h3" sx={{ mt: 1 }}>
            Credentials
          </Typography>
          {editing && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
              Leave blank to keep the stored keys ({connection.accessKeyMasked}).
            </Typography>
          )}
          <Stack direction="row" spacing={2}>
            <TextField
              label="Access key ID"
              value={form.accessKeyId}
              onChange={(e) => set('accessKeyId', e.target.value)}
              fullWidth
              autoComplete="off"
            />
            <TextField
              label="Secret access key"
              type="password"
              value={form.secretAccessKey}
              onChange={(e) => set('secretAccessKey', e.target.value)}
              fullWidth
              autoComplete="new-password"
            />
          </Stack>

          <FormControlLabel
            control={
              <Switch
                checked={form.forcePathStyle}
                onChange={(e) => set('forcePathStyle', e.target.checked)}
              />
            }
            label="Force path style (required by MinIO and some providers)"
          />
          <FormControlLabel
            control={
              <Switch checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            }
            label="Active"
          />

          {testResult && (
            <Alert severity={testResult.ok ? 'success' : 'error'}>{testResult.message}</Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={handleTest}
            disabled={testing || !canTest}
            startIcon={testing ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Test connection
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={16} color="inherit" /> : editing ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
