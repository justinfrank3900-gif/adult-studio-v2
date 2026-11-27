import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Studio',
  description: 'Private.',
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
      </body>
    </html>
  );
}
