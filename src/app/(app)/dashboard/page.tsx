'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import FolderIcon from '@mui/icons-material/Folder';
import PeopleIcon from '@mui/icons-material/People';
import StorageIcon from '@mui/icons-material/Storage';
import DataUsageIcon from '@mui/icons-material/DataUsage';
import { AppShell } from '@/components/layout/AppShell';
import { FileThumb } from '@/components/files/FileThumb';
import { formatBytes } from '@/lib/uploads/filename';
import type { UploadedFile } from '@/components/files/types';

type Stats = {
  totalFiles: number;
  totalBytes: string;
  uploaders: number;
  connections: number;
  recent: UploadedFile[];
};

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
          {icon}
          <Typography variant="body2">{label}</Typography>
        </Box>
        <Typography variant="h4" component="div" sx={{ fontWeight: 700, mt: 1 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch('/api/admin/stats')
      .then((res) => (res.ok ? res.json() : null))
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }} gutterBottom>
        Dashboard
      </Typography>
      <Divider sx={{ mb: 3 }} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : !stats ? (
        <Typography color="text.secondary">Could not load the statistics.</Typography>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            }}
          >
            <StatCard label="Files" value={String(stats.totalFiles)} icon={<FolderIcon fontSize="small" />} />
            <StatCard
              label="Total size"
              value={formatBytes(BigInt(stats.totalBytes))}
              icon={<DataUsageIcon fontSize="small" />}
            />
            <StatCard label="Uploaders" value={String(stats.uploaders)} icon={<PeopleIcon fontSize="small" />} />
            <StatCard
              label="Active connections"
              value={String(stats.connections)}
              icon={<StorageIcon fontSize="small" />}
            />
          </Box>

          <Typography variant="h6" component="h2" sx={{ fontWeight: 600, mt: 4, mb: 1 }}>
            Recent uploads
          </Typography>
          {stats.recent.length === 0 ? (
            <Typography color="text.secondary">No uploads yet.</Typography>
          ) : (
            <List dense>
              {stats.recent.map((file) => (
                <ListItem key={file.id} divider sx={{ gap: 2 }}>
                  <FileThumb file={file} size={48} />
                  <ListItemText
                    primary={file.filename}
                    secondary={`${formatBytes(BigInt(file.sizeBytes))} · ${
                      file.ownerName ?? file.ownerEmail ?? 'unknown'
                    } · ${new Date(file.createdAt).toLocaleString()}`}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </>
      )}
    </AppShell>
  );
}
