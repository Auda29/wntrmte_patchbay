import { Suspense } from 'react';
import { SessionsPageClient } from '@/components/SessionsPageClient';

function SessionsPageFallback() {
  return <div className="p-8 text-surface-400">Loading sessions...</div>;
}

export default function SessionsPage() {
  return (
    <Suspense fallback={<SessionsPageFallback />}>
      <SessionsPageClient />
    </Suspense>
  );
}
