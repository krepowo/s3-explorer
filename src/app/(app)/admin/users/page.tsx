'use client';

import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import LockResetIcon from '@mui/icons-material/LockReset';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import { AppShell } from '@/components/layout/AppShell';

type User = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'uploader';
  isActive: boolean;
  uploadLimitBytes: string | null;
  assignedConnectionId: string | null;
  publicToken: string | null;
  createdAt: string;
};

// ─── Create dialog ─────────────────────────────────────────────────────────────

function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'uploader'>('uploader');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function reset() {
    setEmail(''); setName(''); setPassword(''); setRole('uploader'); setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password, role }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      reset();
      onCreated();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Create user</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
          <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
          <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth helperText="Min 8 characters" />
          <FormControl fullWidth>
            <InputLabel>Role</InputLabel>
            <Select value={role} label="Role" onChange={(e) => setRole(e.target.value as 'admin' | 'uploader')}>
              <MenuItem value="uploader">Uploader</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={16} color="inherit" /> : 'Create'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// ─── Edit dialog ──────────────────────────────────────────────────────────────

function EditUserDialog({
  user,
  onClose,
  onUpdated,
}: {
  user: User;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [limitGB, setLimitGB] = useState(
    user.uploadLimitBytes ? (Number(user.uploadLimitBytes) / 1e9).toFixed(1) : '',
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const uploadLimitBytes = limitGB
      ? Math.round(parseFloat(limitGB) * 1e9)
      : null;
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, isActive, uploadLimitBytes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      onUpdated();
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Edit user</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
          <FormControl fullWidth>
            <InputLabel>Role</InputLabel>
            <Select value={role} label="Role" onChange={(e) => setRole(e.target.value as 'admin' | 'uploader')}>
              <MenuItem value="uploader">Uploader</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2">Active</Typography>
            <Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          </Box>
          <TextField
            label="Upload limit (GB)"
            type="number"
            value={limitGB}
            onChange={(e) => setLimitGB(e.target.value)}
            fullWidth
            helperText="Leave empty for default 2 GB"
            slotProps={{ htmlInput: { min: 0.1, step: 0.1 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={16} color="inherit" /> : 'Save'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// ─── Reset password dialog ────────────────────────────────────────────────────

function ResetPasswordDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      setDone(true);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Reset password</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {done ? (
            <Alert severity="success">Password reset successfully.</Alert>
          ) : (
            <TextField
              label="New password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              helperText="Min 8 characters"
              autoFocus
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{done ? 'Close' : 'Cancel'}</Button>
          {!done && (
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={16} color="inherit" /> : 'Reset'}
            </Button>
          )}
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// ─── Rotate token dialog ──────────────────────────────────────────────────────

/**
 * Rotating is destructive: every link the uploader has shared stops working,
 * because the objects move to a new prefix. The dialog says so and requires the
 * uploader's email to be typed before it will run.
 */
function RotateTokenDialog({
  user,
  onClose,
  onRotated,
}: {
  user: User;
  onClose: () => void;
  onRotated: () => void;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ moved: number; failed: number } | null>(null);

  const matches = confirmation.trim().toLowerCase() === user.email.toLowerCase();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/rotate-token`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Rotation failed');
        return;
      }
      setResult({ moved: data.moved, failed: data.failed });
      onRotated();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Rotate public token</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {result ? (
            <Alert severity={result.failed > 0 ? 'warning' : 'success'}>
              Token rotated. {result.moved} file(s) moved.
              {result.failed > 0 && ` ${result.failed} file(s) could not be moved.`}
            </Alert>
          ) : (
            <>
              <Alert severity="warning">
                Every public link for <strong>{user.name}</strong> stops working. Their files are
                moved to a new namespace, which can take a while for large libraries.
              </Alert>
              <TextField
                label="Type the email to confirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={user.email}
                fullWidth
                autoFocus
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
          {!result && (
            <Button type="submit" variant="contained" color="warning" disabled={!matches || loading}>
              {loading ? <CircularProgress size={16} color="inherit" /> : 'Rotate token'}
            </Button>
          )}
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<string | null>(null);
  const [rotateUser, setRotateUser] = useState<User | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps

  function copyToken(token: string) {
    void navigator.clipboard.writeText(token);
  }

  return (
    <AppShell>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, flexGrow: 1 }}>
          Users
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          Create user
        </Button>
      </Box>
      <Divider sx={{ mb: 2 }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Limit</TableCell>
              <TableCell>Public token</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} hover>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Chip
                    label={u.role}
                    size="small"
                    color={u.role === 'admin' ? 'primary' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={u.isActive ? 'Active' : 'Inactive'}
                    size="small"
                    color={u.isActive ? 'success' : 'error'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  {u.uploadLimitBytes
                    ? `${(Number(u.uploadLimitBytes) / 1e9).toFixed(1)} GB`
                    : '2 GB (default)'}
                </TableCell>
                <TableCell>
                  {u.publicToken ? (
                    <Tooltip title="Copy token">
                      <IconButton size="small" onClick={() => copyToken(u.publicToken!)}>
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Typography variant="caption" color="text.disabled">—</Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => setEditUser(u)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Reset password">
                    <IconButton size="small" onClick={() => setResetUser(u.id)}>
                      <LockResetIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Rotate public token">
                    <IconButton size="small" onClick={() => setRotateUser(u)}>
                      <RotateRightIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  No users yet. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={load}
      />
      {editUser && (
        <EditUserDialog
          user={editUser}
          onClose={() => setEditUser(null)}
          onUpdated={load}
        />
      )}
      {resetUser && (
        <ResetPasswordDialog
          userId={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}
      {rotateUser && (
        <RotateTokenDialog
          user={rotateUser}
          onClose={() => setRotateUser(null)}
          onRotated={load}
        />
      )}
    </AppShell>
  );
}
