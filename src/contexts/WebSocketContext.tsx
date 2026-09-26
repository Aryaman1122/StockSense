'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { revalidateAll } from '@/lib/api';
import { connectWS } from '@/lib/ws';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext({ connected: false });

/** Live updates: any operation created/transitioned by anyone revalidates every open view. */
export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) return;
    return connectWS((e) => {
      revalidateAll();
      if (e.type === 'operation.transitioned' && e.newState === 'done') toast.success(`Operation #${e.operationId} validated`);
    }, setConnected);
  }, [user]);

  return <WebSocketContext.Provider value={{ connected }}>{children}</WebSocketContext.Provider>;
}

export const useLive = () => useContext(WebSocketContext);
