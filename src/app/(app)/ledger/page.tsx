'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { qs } from '@/lib/api';
import { OP_STATUSES, OP_TYPES, TYPE_COLOR, TYPE_LABEL, fmtDate, fmtDateTime, fmtQty } from '@/lib/constants';
import type { LedgerEntry, Location, Move, Product } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { Pagination, usePaginated } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Table, td } from '@/components/ui/Table';
import { Tag } from '@/components/ui/Tag';

export default function LedgerPage() {
  const { isManager } = useAuth();
  const [tab, setTab] = useState<'moves' | 'ledger'>('moves');
  return (
    <div className="space-y-4">
      {isManager && (
        <div role="tablist" className="inline-flex gap-1 rounded-lg border border-b1 bg-s0 p-1">
          {([['moves', 'Moves'], ['ledger', 'Raw ledger']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === k ? 'bg-s3 text-t1' : 'text-t3 hover:text-t1'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === 'moves' || !isManager ? <Moves /> : <RawLedger />}
    </div>
  );
}

/** One row per operation line (GET /moves, every role). */
function Moves() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const onSearch = useCallback((v: string) => setQ(v), []);
  const { data, error } = useSWR<Move[]>(qs('/moves', { q, type, status, limit: 2000 }));
  const page = usePaginated(data, 50);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <SearchInput onSearch={onSearch} placeholder="Reference, partner, SKU…" />
        <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className="w-44">
          <option value="">All types</option>
          {OP_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">Any status</option>
          {OP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <Table head={['Date', 'Reference', 'Product', 'From', 'To', 'Quantity', 'Status']}
        loading={!data} error={error} empty={data?.length === 0} emptyText="No moves yet.">
        {page.rows.map((m, i) => {
          const sign = m.type === 'receive' ? '+' : m.type === 'delivery' ? '−' : '';
          return (
            <tr key={`${m.operation_id}-${m.product_id}-${i}`}>
              <td className={`${td} text-t2`}>{fmtDate(m.scheduled_date)}</td>
              <td className={`${td} font-mono text-xs`}>
                <Link href={`/operations/${m.operation_id}`} className="hover:underline">{m.reference}</Link>
              </td>
              <td className={td}>{m.product_name} <span className="font-mono text-xs text-t3">{m.sku}</span></td>
              <td className={`${td} text-t2`}>{m.from_location ?? '—'}</td>
              <td className={`${td} text-t2`}>{m.to_location ?? '—'}</td>
              <td className={`${td} text-right ${TYPE_COLOR[m.type]}`}>
                {m.type === 'adjustment' ? 'Counted ' : sign}{fmtQty(m.qty)} {m.uom}
              </td>
              <td className={td}><Tag status={m.status} /></td>
            </tr>
          );
        })}
      </Table>
      <Pagination {...page} />
    </>
  );
}

/** Immutable signed deltas (GET /ledger, managers only). */
function RawLedger() {
  const [productId, setProductId] = useState('');
  const [locationId, setLocationId] = useState('');
  const { data: products } = useSWR<Product[]>('/products');
  const { data: locations } = useSWR<Location[]>('/locations');
  const { data, error } = useSWR<LedgerEntry[]>(qs('/ledger', { product_id: productId, location_id: locationId, limit: 2000 }));
  const page = usePaginated(data, 50);
  const product = (id: number) => products?.find((p) => p.id === id);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Select aria-label="Product" value={productId} onChange={(e) => setProductId(e.target.value)} className="w-56">
          <option value="">All products</option>
          {products?.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
        </Select>
        <Select aria-label="Location" value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-48">
          <option value="">All locations</option>
          {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </div>
      <Table head={['#', 'When', 'Operation', 'Product', 'Location', 'Delta', 'Actor']}
        loading={!data} error={error} empty={data?.length === 0} emptyText="The ledger is empty.">
        {page.rows.map((e) => (
          <tr key={e.id}>
            <td className={`${td} text-t3`}>{e.id}</td>
            <td className={`${td} text-t2`}>{fmtDateTime(e.created_at)}</td>
            <td className={td}><Link href={`/operations/${e.operation_id}`} className="hover:underline">#{e.operation_id}</Link></td>
            <td className={td}>{product(e.product_id)?.name ?? `#${e.product_id}`}</td>
            <td className={`${td} text-t2`}>{locations?.find((l) => l.id === e.location_id)?.name ?? `#${e.location_id}`}</td>
            <td className={`${td} text-right ${e.delta > 0 ? 'text-ok' : 'text-accent'}`}>
              {e.delta > 0 ? '+' : ''}{fmtQty(e.delta)} {product(e.product_id)?.uom}
            </td>
            <td className={`${td} text-t3`}>User #{e.actor_id}</td>
          </tr>
        ))}
      </Table>
      <Pagination {...page} />
    </>
  );
}
