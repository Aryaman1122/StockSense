import Link from 'next/link';
import { IconAlertTriangle, IconArrowDownRight, IconArrowUpRight, IconArrowsExchange, IconBox, IconBoxOff } from '@tabler/icons-react';
import type { Dashboard, OpCounts, OpType } from '@/lib/types';

function Stat({ label, value, icon, tone = 'text-t1', href }: {
  label: string; value: number; icon: React.ReactNode; tone?: string; href?: string;
}) {
  const body = (
    <div className="rounded-lg border border-b1 bg-s0 p-4 transition-colors hover:border-b3">
      <div className="flex items-center justify-between text-xs text-t3">{label}{icon}</div>
      <div className={`mt-2 text-2xl font-semibold tabular ${tone}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function KPICards({ data }: { data: Dashboard }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Products in stock" value={data.products_in_stock} icon={<IconBox size={16} />} href="/stock" />
      <Stat label="Low stock" value={data.low_stock} icon={<IconAlertTriangle size={16} />} tone={data.low_stock ? 'text-warn' : undefined} />
      <Stat label="Out of stock" value={data.out_of_stock} icon={<IconBoxOff size={16} />} tone={data.out_of_stock ? 'text-accent' : undefined} />
      <Stat
        label="Late operations"
        value={data.receipts.late + data.deliveries.late + data.transfers.late}
        icon={<IconAlertTriangle size={16} />}
        tone={data.receipts.late + data.deliveries.late + data.transfers.late ? 'text-accent' : undefined}
        href="/operations"
      />
    </div>
  );
}

const CARDS: { key: 'receipts' | 'deliveries' | 'transfers'; type: OpType; title: string; readyLabel: string; icon: React.ReactNode }[] = [
  { key: 'receipts', type: 'receive', title: 'Receipts', readyLabel: 'to receive', icon: <IconArrowDownRight size={18} className="text-ok" /> },
  { key: 'deliveries', type: 'delivery', title: 'Deliveries', readyLabel: 'to deliver', icon: <IconArrowUpRight size={18} className="text-accent" /> },
  { key: 'transfers', type: 'transfer', title: 'Internal transfers', readyLabel: 'to move', icon: <IconArrowsExchange size={18} className="text-info" /> },
];

/** "Quick action" cards: one per operation type, each count links to the filtered list. */
export function OperationCards({ data }: { data: Dashboard }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {CARDS.map(({ key, type, title, readyLabel, icon }) => {
        const c: OpCounts = data[key];
        const link = (status?: string) => `/operations?type=${type}${status ? `&status=${status}` : ''}`;
        return (
          <div key={key} className="rounded-lg border border-b1 bg-s0 p-4">
            <div className="mb-3 flex items-center gap-2 font-medium">{icon}{title}</div>
            <Link href={link('ready')} className="block rounded-md bg-s2 px-3 py-2 hover:bg-s3">
              <span className="text-xl font-semibold tabular">{c.ready}</span>{' '}
              <span className="text-sm text-t2">{readyLabel}</span>
            </Link>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <Link href={link('waiting')} className="hover:text-t1"><dt className="text-t3">Waiting</dt><dd className="tabular text-t2">{c.waiting}</dd></Link>
              <div><dt className="text-t3">Late</dt><dd className={`tabular ${c.late ? 'text-accent' : 'text-t2'}`}>{c.late}</dd></div>
              <div><dt className="text-t3">Upcoming</dt><dd className="tabular text-t2">{c.upcoming}</dd></div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}
