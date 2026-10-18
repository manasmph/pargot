import { Public_Sans } from 'next/font/google';
import localFont from 'next/font/local';
import { headers } from 'next/headers';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AuthProvider } from '@/components/app/auth-provider';
import { PargotLogo } from '@/components/app/pargot-logo';
import { ThemeProvider } from '@/components/app/theme-provider';
import { ThemeToggle } from '@/components/app/theme-toggle';
import { UserMenu } from '@/components/app/user-menu';
import { AUTH_ENABLED } from '@/lib/auth-config';
import { cn } from '@/lib/shadcn/utils';
import { getAppConfig, getStyles } from '@/lib/utils';
import '@/styles/globals.css';

const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
});

const commitMono = localFont({
  display: 'swap',
  variable: '--font-commit-mono',
  src: [
    {
      path: '../fonts/CommitMono-400-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/CommitMono-700-Regular.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../fonts/CommitMono-400-Italic.otf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../fonts/CommitMono-700-Italic.otf',
      weight: '700',
      style: 'italic',
    },
  ],
});

interface RootLayoutProps {
  children: React.ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const hdrs = await headers();
  const appConfig = await getAppConfig(hdrs);
  const styles = getStyles(appConfig);
  const { pageTitle, pageDescription } = appConfig;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        publicSans.variable,
        commitMono.variable,
        'scroll-smooth font-sans antialiased'
      )}
    >
      <head>
        {styles && <style>{styles}</style>}
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
      </head>
      <body className="overflow-x-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <header className="fixed top-0 left-0 z-50 flex w-full flex-row items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
              <PargotLogo />
              {AUTH_ENABLED && <UserMenu />}
            </header>

            {children}
            {/* Theme toggle. On touch devices we always show it; on desktop it
                slides up on hover so it doesn't crowd the centred CTA. */}
            <div className="group fixed bottom-0 left-1/2 z-50 mb-2 -translate-x-1/2">
              <ThemeToggle className="transition-transform delay-150 duration-300 md:translate-y-20 md:group-hover:translate-y-0" />
            </div>
          </AuthProvider>
        </ThemeProvider>

        {/* Vercel Analytics — page views, referrers, custom events.
            Vercel Speed Insights — Core Web Vitals (LCP, FID/INP, CLS).
            Both are no-ops in development and only ship when deployed on Vercel.
            Activate them at vercel.com → project → Analytics / Speed Insights tab. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
