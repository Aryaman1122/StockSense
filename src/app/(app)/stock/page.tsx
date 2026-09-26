'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { qs } from '@/lib/api';
import type { Quant } from '@/lib/types';
import { QuantTable } from '@/components/stock/QuantTable';
import { StockFilters, type StockFilterValues } from '@/components/stock/StockFilters';

export default function StockPage() {
  const [filters, setFilters] = useState<StockFilterValues>({ q: '', warehouse_id: '', location_id: '', category: '' });
  const { data, error } = useSWR<Quant[]>(qs('/quants', filters));

  return (
    <div className="space-y-4">
      <StockFilters value={filters} onChange={setFilters} />
      <QuantTable quants={data} error={error} />
    </div>
  );
}
