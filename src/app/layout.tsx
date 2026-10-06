import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { ThemeRegistry } from '@/components/ThemeRegistry';

const ibmPlex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-ibm-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'S3 Explorer',
  description: 'Public file sharing on S3-compatible storage',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ibmPlex.variable} suppressHydrationWarning>
      <body>
        {/*
          Writes the stored colour scheme before paint, so dark mode never flashes.
          `attribute="data"` is required: the theme uses
          `cssVariables: { colorSchemeSelector: 'data' }`, which styles
          `[data-dark]`. The default attribute is `data-mui-color-scheme`, which no
          rule matches — the page would paint light until React hydrated.
        */}
        <InitColorSchemeScript defaultMode="system" attribute="data" />
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
