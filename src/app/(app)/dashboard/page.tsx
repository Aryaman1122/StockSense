'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { qs } from '@/lib/api';
import type { Dashboard, Warehouse } from '@/lib/types';
import { KPICards, OperationCards } from '@/components/dashboard/KPICards';
import { MovementChart } from '@/components/dashboard/MovementChart';
import { StockAlerts } from '@/components/dashboard/StockAlerts';
import { Select } from '@/components/ui/Select';

export default function DashboardPage() {
  const [warehouseId, setWarehouseId] = useState('');
  const { data: warehouses } = useSWR<Warehouse[]>('/warehouses');
  const { data, error } = useSWR<Dashboard>(qs('/dashboard', { warehouse_id: warehouseId }));

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Select aria-label="Warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-56">
          <option value="">All warehouses</option>
          {warehouses?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </div>
      {error && <p className="rounded-md bg-accent/10 px-4 py-3 text-sm text-accent">{error.message}</p>}
      {data ? (
        <>
          <KPICards data={data} />
          <OperationCards data={data} />
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2"><MovementChart warehouseId={warehouseId} /></div>
            <StockAlerts alerts={data.alerts} />
          </div>
        </>
      ) : !error && <p className="py-20 text-center text-sm text-t3">Loading…</p>}
    </div>
  );
}
