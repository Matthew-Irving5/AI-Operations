import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'AI Operations',
  description: 'Private operations control plane',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
