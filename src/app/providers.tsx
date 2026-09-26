'use client';

import { SWRConfig } from 'swr';
import { Toaster } from 'sonner';
import { ApiError, fetcher } from '@/lib/api';
import { AuthProvider } from '@/contexts/AuthContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        // Don't hammer the API on auth/permission errors; those won't fix themselves.
        shouldRetryOnError: (e) => !(e instanceof ApiError && [401, 403, 404].includes(e.status)),
      }}
    >
      <AuthProvider>
        <WebSocketProvider>{children}</WebSocketProvider>
      </AuthProvider>
      <Toaster theme="dark" position="bottom-right" richColors />
    </SWRConfig>
  );
}
