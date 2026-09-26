'use client';

import { Suspense, useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { IconPlus } from '@tabler/icons-react';
import { qs } from '@/lib/api';
import { OP_STATUSES, OP_TYPES, TYPE_LABEL } from '@/lib/constants';
import type { Operation, OpType, Warehouse } from '@/lib/types';
import { OperationForm } from '@/components/operations/OperationForm';
import { OperationTable } from '@/components/operations/OperationTable';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';

function Operations() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const type = params.get('type') ?? '';
  const status = params.get('status') ?? '';
  const warehouseId = params.get('warehouse_id') ?? '';
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  // Filters live in the URL so dashboard cards can deep-link and the back button works.
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    router.replace(`${pathname}?${next}`);
  };
  const onSearch = useCallback((v: string) => setQ(v), []);

  const { data: warehouses } = useSWR<Warehouse[]>('/warehouses');
  const { data, error } = useSWR<Operation[]>(
    qs('/operations', { type, status, warehouse_id: warehouseId, q, limit: 500 }),
  );

  const tabs: [string, string][] = [['', 'All'], ...OP_TYPES.map((t) => [t, TYPE_LABEL[t]] as [string, string])];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg border border-b1 bg-s0 p-1">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={type === value}
              onClick={() => setParam('type', value)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${type === value ? 'bg-s3 text-t1' : 'text-t3 hover:text-t1'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button icon={<IconPlus size={16} />} onClick={() => setCreating(true)}>New operation</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <SearchInput onSearch={onSearch} placeholder="Reference, partner, SKU…" />
        <Select aria-label="Status" value={status} onChange={(e) => setParam('status', e.target.value)} className="w-40">
          <option value="">Any status</option>
          {OP_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
        </Select>
        <Select aria-label="Warehouse" value={warehouseId} onChange={(e) => setParam('warehouse_id', e.target.value)} className="w-48">
          <option value="">All warehouses</option>
          {warehouses?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </div>

      <OperationTable ops={data} error={error} />

      <Modal open={creating} onClose={() => setCreating(false)} title="New operation" wide>
        <OperationForm defaultType={(type || 'receive') as OpType} onDone={() => setCreating(false)} />
      </Modal>
    </div>
  );
}

export default function OperationsPage() {
  return <Suspense><Operations /></Suspense>;
}
