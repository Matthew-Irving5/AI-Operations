import type { Metadata } from 'next';
import { headers } from 'next/headers';
import '@fontsource-variable/mona-sans/wght.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@ai-operations/ui/tokens.css';
import '@ai-operations/ui/components.css';
import './globals.css';
import { themeBootstrapScript } from '@ai-operations/ui';

export const metadata: Metadata = {
  title: 'AI Operations',
  description: 'Private operations control plane',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en-GB" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} nonce={nonce} />
      </head>
      <body>{children}</body>
    </html>
  );
}
