'use client';

import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useColorScheme } from '@mui/material/styles';

/** Cycles between light and dark. The first visit follows the system preference. */
export function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  const resolved = mode === 'system' ? (systemMode ?? 'light') : (mode ?? 'light');
  const next = resolved === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} mode`;

  return (
    <Tooltip title={label}>
      <IconButton color="inherit" aria-label={label} onClick={() => setMode(next)}>
        {resolved === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
}
