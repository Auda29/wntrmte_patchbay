'use client';

import { SWRConfig } from 'swr';
import React from 'react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig 
      value={{ 
        fetcher,
        refreshInterval: 2000,
        keepPreviousData: true,
        revalidateOnFocus: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
