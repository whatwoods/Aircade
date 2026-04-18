import type { Metadata } from 'next';
import { getCurrentUser } from '@/features/auth';
import { countPendingWorks } from '@/features/works';
import { Footer, Navbar } from '@/components/brand';
import { harmony, inter, lxgw, mono } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Aircade · 群友造的街机厅',
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const pendingCount = user?.role === 'admin' ? await countPendingWorks() : 0;

  const navUser = user
    ? {
        username: user.username,
        nickname: user.nickname,
        role: user.role,
      }
    : null;

  return (
    <html
      lang="zh-CN"
      className={`${inter.variable} ${harmony.variable} ${lxgw.variable} ${mono.variable}`}
    >
      <body className="min-h-screen bg-[var(--ac-bg)] font-sans text-[var(--ac-fg)] antialiased">
        <Navbar user={navUser} pendingCount={pendingCount} />
        <div className="min-h-[calc(100vh-64px)]">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
