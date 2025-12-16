import './globals.css';
import { Space_Grotesk } from 'next/font/google';
import React from 'react';

const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk' });

export const metadata = {
  title: 'UpgradePath - PC Upgrade Optimizer',
  description: 'Find your bottleneck and best value upgrade path.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={grotesk.variable}>
      <body className="bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors">
        {children}
      </body>
    </html>
  );
}
