import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { SWRProvider } from '@/components/SWRProvider';

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
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased text-surface-200 min-h-screen flex selection:bg-brand-500/30 selection:text-white`}>
        <SWRProvider>
          <Sidebar />
          <main className="flex-1 flex flex-col h-screen overflow-hidden pl-64">
            <div className="flex-1 overflow-y-auto p-8 relative">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-brand-500/6 via-brand-400/4 to-transparent" />
              {children}
            </div>
          </main>
        </SWRProvider>
      </body>
    </html>
  );
}
