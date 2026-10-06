'use client';

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { theme } from '@/theme';

/**
 * Collects MUI's server-rendered styles into <head> and applies the theme.
 * `defaultMode: 'system'` matches InitColorSchemeScript in the root layout.
 */
export function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme} defaultMode="system">
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
