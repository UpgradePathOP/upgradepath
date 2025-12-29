import './globals.css';
import { Manrope, Sora } from 'next/font/google';
import type { Metadata } from 'next';
import React from 'react';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = {
  title: 'UpgradePath - PC Upgrade Optimizer',
  description: 'Find your bottleneck and best value upgrade path.',
  icons: {
    icon: '/branding/upgradepath-logo.png'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${manrope.variable} dark`}>
      <body className="bg-[#f6f7f8] text-slate-900 dark:bg-background dark:text-slate-50 transition-colors font-manrope">
        {children}
      </body>
    </html>
  );
}
