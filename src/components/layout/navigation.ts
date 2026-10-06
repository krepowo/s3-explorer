import type SvgIcon from '@mui/material/SvgIcon';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderIcon from '@mui/icons-material/Folder';
import HistoryIcon from '@mui/icons-material/History';
import PeopleIcon from '@mui/icons-material/People';
import SettingsIcon from '@mui/icons-material/Settings';
import StorageIcon from '@mui/icons-material/Storage';

export type AppRole = 'admin' | 'uploader';

export type NavItem = {
  label: string;
  href: string;
  icon: typeof SvgIcon;
};

/** Uploaders have no dashboard: they land on /files. */
export const NAV_ITEMS: Record<AppRole, NavItem[]> = {
  admin: [
    { label: 'Dashboard', href: '/dashboard', icon: DashboardIcon },
    { label: 'Files', href: '/files', icon: FolderIcon },
    { label: 'Users', href: '/admin/users', icon: PeopleIcon },
    { label: 'Connections', href: '/admin/connections', icon: StorageIcon },
    { label: 'Audit', href: '/admin/audit', icon: HistoryIcon },
    { label: 'Settings', href: '/settings', icon: SettingsIcon },
  ],
  uploader: [
    { label: 'Files', href: '/files', icon: FolderIcon },
    { label: 'Settings', href: '/settings', icon: SettingsIcon },
  ],
};
