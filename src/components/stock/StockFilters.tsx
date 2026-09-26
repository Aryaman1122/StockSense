'use client';

import useSWR from 'swr';
import type { Location, Product, Warehouse } from '@/lib/types';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';

export type StockFilterValues = { q: string; warehouse_id: string; location_id: string; category: string };

export function StockFilters({ value, onChange }: { value: StockFilterValues; onChange: (v: StockFilterValues) => void }) {
  const { data: warehouses } = useSWR<Warehouse[]>('/warehouses');
  const { data: locations } = useSWR<Location[]>('/locations');
  const { data: products } = useSWR<Product[]>('/products');
  const categories = [...new Set(products?.map((p) => p.category))].sort();
  const set = (patch: Partial<StockFilterValues>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-wrap gap-3">
      <SearchInput onSearch={(q) => q !== value.q && set({ q })} placeholder="SKU or product…" />
      <Select aria-label="Warehouse" value={value.warehouse_id} className="w-48"
        onChange={(e) => set({ warehouse_id: e.target.value, location_id: '' })}>
        <option value="">All warehouses</option>
        {warehouses?.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </Select>
      <Select aria-label="Location" value={value.location_id} className="w-48" onChange={(e) => set({ location_id: e.target.value })}>
        <option value="">All locations</option>
        {locations?.filter((l) => !value.warehouse_id || l.warehouse_id === Number(value.warehouse_id))
          .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </Select>
      <Select aria-label="Category" value={value.category} className="w-44" onChange={(e) => set({ category: e.target.value })}>
        <option value="">All categories</option>
        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
    </div>
  );
}
