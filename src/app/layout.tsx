import type { Metadata } from 'next';
import { inter, harmony, lxgw } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Aircade',
    template: '%s · Aircade',
  },
  description: '群友造的街机厅——AI 时代的小作品展示站。',
  openGraph: {
    title: 'Aircade',
    description: '群友造的街机厅',
    siteName: 'Aircade',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aircade',
    description: '群友造的街机厅',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      className={`${inter.variable} ${harmony.variable} ${lxgw.variable}`}
    >
      <body className="min-h-screen bg-brand-milk font-sans text-brand-coffee antialiased">
        {children}
      </body>
    </html>
  );
}
