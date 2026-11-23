import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { THEME_COLORS, THEME_INIT_SCRIPT, ThemeProvider } from '../lib/theme-context';

export const metadata: Metadata = {
  title: 'Luxembourg Personal Tax Workspace',
  description: 'Evidence-linked, joint-household Luxembourg tax return preparation workspace.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-[#f6f7f9] text-zinc-950 antialiased selection:bg-zinc-900 selection:text-white dark:bg-[#0e1014] dark:text-zinc-100 dark:selection:bg-sky-500/30 dark:selection:text-white">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
