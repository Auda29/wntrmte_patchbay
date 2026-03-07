import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Patchbay Dashboard',
  description: 'Control plane for AI-assisted development',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased text-surface-200 bg-surface-1000 min-h-screen flex selection:bg-brand-500/30 selection:text-white`}>
        <Sidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden pl-64">
          <div className="flex-1 overflow-y-auto p-8 relative">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
