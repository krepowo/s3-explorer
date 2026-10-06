'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

export function RenameDialog({
  fileId,
  currentName,
  onClose,
  onRenamed,
}: {
  fileId: string;
  currentName: string;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [filename, setFilename] = useState(currentName);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/uploads/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Rename failed');
        return;
      }
      onRenamed();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Rename file</DialogTitle>
      <form onSubmit={handleSubmit} noValidate>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            label="Filename"
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            fullWidth
            required
            autoFocus
            helperText="The public link changes; the old one stops working."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={16} color="inherit" /> : 'Rename'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
