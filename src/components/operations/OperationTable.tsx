'use client';

import { useRouter } from 'next/navigation';
import { Table, rowLink, td } from '@/components/ui/Table';
import { Tag } from '@/components/ui/Tag';
import { Pagination, usePaginated } from '@/components/ui/Pagination';
import { TYPE_COLOR, TYPE_LABEL, fmtDate, fmtQty, isOpen, today } from '@/lib/constants';
import type { Operation } from '@/lib/types';

function productSummary(op: Operation) {
  const [first, ...rest] = op.lines;
  if (!first) return '—';
  const head = `${first.product_name} × ${fmtQty(first.qty)}`;
  return rest.length ? `${head} +${rest.length} more` : head;
}

export function OperationTable({ ops, error }: { ops?: Operation[]; error?: Error }) {
  const router = useRouter();
  const page = usePaginated(ops);
  const now = today();

  return (
    <>
      <Table
        head={['Reference', 'Type', 'Partner', 'Products', 'Scheduled', 'Responsible', 'Status']}
        loading={!ops}
        error={error}
        empty={ops?.length === 0}
        emptyText="No operations match these filters."
      >
        {page.rows.map((op) => {
          const late = isOpen(op.status) && op.scheduled_date < now;
          return (
            <tr key={op.id} className={rowLink} onClick={() => router.push(`/operations/${op.id}`)}>
              <td className={`${td} font-mono text-xs`}>
                <a href={`/operations/${op.id}`} onClick={(e) => { e.preventDefault(); router.push(`/operations/${op.id}`); }} className="hover:underline">
                  {op.reference}
                </a>
              </td>
              <td className={`${td} ${TYPE_COLOR[op.type]}`}>{TYPE_LABEL[op.type]}</td>
              <td className={`${td} text-t2`}>{op.partner ?? '—'}</td>
              <td className={`${td} max-w-xs truncate`}>{productSummary(op)}</td>
              <td className={`${td} ${late ? 'text-accent' : 'text-t2'}`}>{fmtDate(op.scheduled_date)}{late && ' · late'}</td>
              <td className={`${td} text-t2`}>{op.responsible}</td>
              <td className={td}><Tag status={op.status} /></td>
            </tr>
          );
        })}
      </Table>
      <Pagination {...page} />
    </>
  );
}
