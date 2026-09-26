import useSWR from 'swr';
import { Table, td } from '@/components/ui/Table';
import { Pagination, usePaginated } from '@/components/ui/Pagination';
import { fmtMoney, fmtQty } from '@/lib/constants';
import type { Quant, Warehouse } from '@/lib/types';

export function QuantTable({ quants, error }: { quants?: Quant[]; error?: Error }) {
  const { data: warehouses } = useSWR<Warehouse[]>('/warehouses');
  const page = usePaginated(quants, 50);
  const totalValue = quants?.reduce((sum, q) => sum + q.qty * q.unit_cost, 0) ?? 0;

  return (
    <>
      <Table
        head={['SKU', 'Product', 'Category', 'Location', 'Warehouse', 'On hand', 'Free to use', 'Value']}
        loading={!quants}
        error={error}
        empty={quants?.length === 0}
        emptyText="No stock matches these filters."
      >
        {page.rows.map((q) => (
          <tr key={`${q.product_id}-${q.location_id}`} className={q.qty === 0 ? 'bg-accent/5' : undefined}>
            <td className={`${td} font-mono text-xs`}>{q.sku}</td>
            <td className={td}>{q.product_name}</td>
            <td className={`${td} text-t2`}>{q.category}</td>
            <td className={td}>{q.location_name}</td>
            <td className={`${td} text-t2`}>{warehouses?.find((w) => w.id === q.warehouse_id)?.name ?? '—'}</td>
            <td className={`${td} text-right ${q.qty === 0 ? 'text-accent' : ''}`}>{fmtQty(q.qty)} {q.uom}</td>
            <td className={`${td} text-right ${q.free_qty < 0 ? 'text-accent' : 'text-t2'}`}
              title={q.free_qty < 0 ? 'Open deliveries/transfers need more than is on hand' : undefined}>
              {fmtQty(q.free_qty)}{q.free_qty < 0 && ' · over-promised'}
            </td>
            <td className={`${td} text-right text-t2`}>{fmtMoney(q.qty * q.unit_cost)}</td>
          </tr>
        ))}
      </Table>
      <div className="mt-3 flex items-start justify-between gap-4">
        <p className="text-xs text-t3">Total value: <span className="tabular text-t1">{fmtMoney(totalValue)}</span></p>
        <div className="flex-1"><Pagination {...page} /></div>
      </div>
    </>
  );
}
