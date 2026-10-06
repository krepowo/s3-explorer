'use client';

import { createTheme } from '@mui/material/styles';

/**
 * Colours modelled after mui.com's own site:
 *   Primary blue  : #0072E5 (their CTA / link colour)
 *   Dark bg       : #0A1929 (their dark page background)
 *   Dark paper    : #132F4C (their dark surface/card colour)
 *   Dark sidebar  : #0A2744
 *   Light bg      : #F9F9FE (near-white, very slight blue tint)
 *   Light paper   : #FFFFFF
 *   Neutral text  : #1C2025 (dark mode text uses #E5EAF2)
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'data' },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#0072E5',
          light: '#42A5F5',
          dark: '#0059B2',
          contrastText: '#fff',
        },
        secondary: {
          main: '#9C27B0',
          contrastText: '#fff',
        },
        background: {
          default: '#F9F9FE',
          paper: '#FFFFFF',
        },
        text: {
          primary: '#1C2025',
          secondary: '#434D5B',
        },
        divider: 'rgba(0,0,0,0.08)',
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#3399FF',
          light: '#66B2FF',
          dark: '#0072E5',
          // White on #3399FF is only 2.94:1, which fails WCAG AA. Dark ink on the
          // same blue reaches ~6.4:1, so filled buttons stay readable.
          contrastText: '#06131F',
        },
        secondary: {
          main: '#CE93D8',
        },
        background: {
          default: '#090E10',
          paper: '#0A1929',
        },
        text: {
          primary: '#E5EAF2',
          secondary: '#ADC2D9',
        },
        divider: 'rgba(255,255,255,0.08)',
      },
    },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily:
      '"IBM Plex Sans", var(--font-ibm-plex), Helvetica, Arial, sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 700 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          color: '#1C2025',
          boxShadow: 'none',
          '*:where([data-dark]) &': {
            backgroundColor: '#0A1929',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            color: '#E5EAF2',
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid rgba(0,0,0,0.06)',
          '*:where([data-dark]) &': {
            backgroundColor: '#0A2744',
            borderRight: '1px solid rgba(255,255,255,0.08)',
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '2px 8px',
          width: 'calc(100% - 16px)',
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 114, 229, 0.08)',
            color: '#0059B2',
            '& .MuiListItemIcon-root': { color: '#0059B2' },
            '&:hover': { backgroundColor: 'rgba(0, 114, 229, 0.14)' },
          },
          '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' },
          '*:where([data-dark]) &.Mui-selected': {
            backgroundColor: 'rgba(51, 153, 255, 0.15)',
            color: '#66B2FF',
          },
          '*:where([data-dark]) &.Mui-selected .MuiListItemIcon-root': {
            color: '#66B2FF',
          },
          '*:where([data-dark]) &.Mui-selected:hover': {
            backgroundColor: 'rgba(51, 153, 255, 0.22)',
          },
          '*:where([data-dark]) &:hover': {
            backgroundColor: 'rgba(255,255,255,0.06)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
});
