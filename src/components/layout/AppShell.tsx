'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NAV_ITEMS } from './navigation';
import { useRole } from './RoleContext';

const DRAWER_WIDTH = 260;

const LOGO_SVG = (
  <Box
    component="svg"
    viewBox="0 0 32 32"
    sx={{ width: 28, height: 28, mr: 1.25, flexShrink: 0 }}
    aria-hidden
  >
    <path
      d="M16 2 L30 10 L30 22 L16 30 L2 22 L2 10 Z"
      fill="#0072E5"
      opacity="0.9"
    />
    <path d="M16 2 L30 10 L16 18 L2 10 Z" fill="#3399FF" />
    <path d="M16 18 L30 10 L30 22 L16 30 Z" fill="#0059B2" />
  </Box>
);

/**
 * Permanent drawer on desktop, temporary on narrow screens.
 * Both drawers always rendered + toggled with CSS for SSR/hydration match.
 *
 * The role comes from context, so the menu is always the one for the signed-in
 * user — pages never pass it in.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useRole();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const items = NAV_ITEMS[role];
  // Uploaders have no dashboard, so "home" is whatever their first page is.
  const home = NAV_ITEMS[role][0].href;
  const active = items.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  async function handleLogout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
    router.refresh();
  }

  const drawerContent = (
    <>
      <Toolbar sx={{ px: 2, gap: 0 }}>
        <Box
          component={Link}
          href={home}
          onClick={() => setMobileOpen(false)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            textDecoration: 'none',
            color: 'inherit',
            borderRadius: 1,
          }}
        >
          {LOGO_SVG}
          <Typography
            variant="h6"
            component="span"
            noWrap
            sx={{ fontWeight: 700, letterSpacing: '-0.5px' }}
          >
            S3 Explorer
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <Box sx={{ px: 1, py: 1 }}>
        <List disablePadding>
          {items.map(({ label, href, icon: Icon }) => (
            <ListItem key={href} disablePadding>
              <ListItemButton
                component={Link}
                href={href}
                selected={href === active?.href}
                onClick={() => setMobileOpen(false)}
              >
                <ListItemIcon sx={{ minWidth: 38 }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={label}
                  slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 500 } } }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
      {/* mt:auto pushes the log out action to the bottom of the drawer. */}
      <Box sx={{ mt: 'auto', px: 1, pb: 1 }}>
        <Divider sx={{ mb: 1 }} />
        <ListItemButton onClick={() => void handleLogout()} disabled={loggingOut}>
          <ListItemIcon sx={{ minWidth: 38 }}>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={loggingOut ? 'Signing out…' : 'Log out'}
            slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 500 } } }}
          />
        </ListItemButton>
      </Box>
    </>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          // Clipped drawer: the bar starts where the sidebar ends, so neither
          // covers the other.
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          zIndex: (t) => t.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            sx={{ mr: 1, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography
            variant="h6"
            component="div"
            noWrap
            sx={{ flexGrow: 1, fontWeight: 600, fontSize: 15 }}
          >
            {active?.label ?? 'S3 Explorer'}
          </Typography>
          <ThemeToggle />
        </Toolbar>
      </AppBar>

      {/*
        The permanent Drawer's paper is `position: fixed`, so it reserves no
        space on its own. Giving the nav wrapper the same width keeps the main
        content from sliding underneath the sidebar.
      */}
      <Box
        component="nav"
        aria-label="Main navigation"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minHeight: '100vh',
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
