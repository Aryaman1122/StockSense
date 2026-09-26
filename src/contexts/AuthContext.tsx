'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { mutate } from 'swr';
import { api, API_URL } from '@/lib/api';
import type { User } from '@/lib/types';

type AuthState = {
  user: User | null;
  loading: boolean;
  isManager: boolean;
  login: (login_id: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/health`).catch(() => {}); // wake the database (Neon cold start) before the user acts
    api<User>('/auth/me')
      .then(setUser, () => setUser(null))
      .finally(() => setLoading(false));
    const expired = () => setUser(null);
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, []);

  const login = useCallback(async (login_id: string, password: string) => {
    const u = await api<User>('/auth/login', { method: 'POST', json: { login_id, password } });
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    mutate(() => true, undefined, { revalidate: false }); // drop every cached response
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isManager: user?.role === 'manager', login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
