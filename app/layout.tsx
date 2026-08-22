import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LLMnesia Insights',
  description: 'Evidence, durable strategy memory, and coding-agent reviews for LLMnesia.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
