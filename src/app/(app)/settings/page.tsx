'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { AppShell } from '@/components/layout/AppShell';

function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<{ kind: 'error' | 'success'; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (next !== confirm) {
      setStatus({ kind: 'error', msg: 'New passwords do not match' });
      return;
    }
    if (next.length < 8) {
      setStatus({ kind: 'error', msg: 'Password must be at least 8 characters' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: 'error', msg: data.error ?? 'Failed' });
      } else {
        setStatus({ kind: 'success', msg: 'Password changed successfully' });
        setCurrent(''); setNext(''); setConfirm('');
      }
    } catch {
      setStatus({ kind: 'error', msg: 'Network error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card sx={{ maxWidth: 480 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }} gutterBottom>
          Change Password
        </Typography>
        {status && (
          <Alert severity={status.kind} sx={{ mb: 2 }}>
            {status.msg}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            label="Current password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            fullWidth
            autoComplete="current-password"
          />
          <TextField
            label="New password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            fullWidth
            autoComplete="new-password"
            helperText="Minimum 8 characters"
          />
          <TextField
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            fullWidth
            autoComplete="new-password"
          />
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ alignSelf: 'flex-start' }}
          >
            {loading ? 'Saving…' : 'Change password'}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
        Settings
      </Typography>
      <Divider sx={{ mb: 3 }} />
      <ChangePasswordForm />
    </AppShell>
  );
}
