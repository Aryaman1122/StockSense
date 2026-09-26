'use client';

import { usePathname, useRouter } from 'next/navigation';
import { IconLogout, IconMenu2 } from '@tabler/icons-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLive } from '@/contexts/WebSocketContext';
import { NAV } from './Sidebar';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { connected } = useLive();
  const router = useRouter();
  const pathname = usePathname();
  const title = NAV.find((n) => pathname.startsWith(n.href))?.label ?? '';

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-b1 bg-bg/90 px-4 backdrop-blur sm:px-6">
      <button onClick={onMenu} aria-label="Open menu" className="rounded p-1.5 text-t2 hover:bg-s3 lg:hidden">
        <IconMenu2 size={20} />
      </button>
      <h1 className="text-sm font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-xs text-t3" title={connected ? 'Live updates on' : 'Reconnecting…'}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-ok' : 'bg-t4'}`} />
          <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
        </span>
        <span className="hidden text-t2 sm:inline">
          {user?.login_id} <span className="rounded bg-s3 px-1.5 py-0.5 text-xs capitalize text-t3">{user?.role}</span>
        </span>
        <button
          onClick={async () => { await logout(); router.replace('/login'); }}
          aria-label="Log out"
          className="rounded p-1.5 text-t2 hover:bg-s3 hover:text-t1"
        >
          <IconLogout size={18} />
        </button>
      </div>
    </header>
  );
}
