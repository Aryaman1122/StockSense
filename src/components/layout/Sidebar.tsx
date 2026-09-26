'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconArrowsExchange, IconBox, IconBuildingWarehouse, IconHistory, IconLayoutDashboard, IconPackages, IconSettings,
} from '@tabler/icons-react';

export const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { href: '/operations', label: 'Operations', icon: IconArrowsExchange },
  { href: '/stock', label: 'Stock', icon: IconPackages },
  { href: '/ledger', label: 'Move History', icon: IconHistory },
  { href: '/products', label: 'Products', icon: IconBox },
  { href: '/locations', label: 'Locations', icon: IconBuildingWarehouse },
  { href: '/settings', label: 'Settings', icon: IconSettings },
];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 w-56 border-r border-b1 bg-s0 transition-transform lg:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="flex h-14 items-center gap-2 border-b border-b1 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/favicon.svg" alt="" className="h-6 w-6" />
        <span className="font-semibold tracking-tight">StockFlow</span>
      </div>
      <nav className="space-y-0.5 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors
                ${active ? 'bg-accent/10 text-t1' : 'text-t2 hover:bg-s2 hover:text-t1'}`}
            >
              <Icon size={18} className={active ? 'text-accent' : ''} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
