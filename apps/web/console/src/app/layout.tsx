import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'FishEye | Research workspace', template: '%s | FishEye' },
  description:
    'A synthetic research workspace for context-aware insider-risk triage.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
