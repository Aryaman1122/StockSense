'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { IconArrowLeft } from '@tabler/icons-react';
import { NEEDS, TYPE_COLOR, TYPE_LABEL, fmtDate, fmtDateTime, fmtQty, forwardTargets, isOpen } from '@/lib/constants';
import type { Location, OperationDetail, Product } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { StateStepper } from '@/components/operations/StateStepper';
import { TransitionButton } from '@/components/operations/TransitionButton';
import { Table, td } from '@/components/ui/Table';
import { Tag } from '@/components/ui/Tag';

export default function OperationDetailPage({ params }: { params: { id: string } }) {
  const { isManager } = useAuth();
  const { data: op, error } = useSWR<OperationDetail>(`/operations/${params.id}`);
  const { data: locations } = useSWR<Location[]>('/locations');
  const { data: products } = useSWR<Product[]>('/products');

  if (error) return <p className="rounded-md bg-accent/10 px-4 py-3 text-sm text-accent">{error.message}</p>;
  if (!op) return <p className="py-20 text-center text-sm text-t3">Loading…</p>;

  const loc = (id: number | null) => (id == null ? '—' : locations?.find((l) => l.id === id)?.name ?? `#${id}`);
  const sku = (id: number) => products?.find((p) => p.id === id)?.sku ?? `#${id}`;
  // Staff can view adjustments but the API only lets managers move them.
  const canAct = isOpen(op.status) && (op.type !== 'adjustment' || isManager);
  const needs = NEEDS[op.type];

  return (
    <div className="space-y-5">
      <Link href="/operations" className="inline-flex items-center gap-1 text-sm text-t3 hover:text-t1">
        <IconArrowLeft size={16} /> Operations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-mono text-xl font-semibold">{op.reference}</h2>
          <p className={`text-sm ${TYPE_COLOR[op.type]}`}>{TYPE_LABEL[op.type]}</p>
        </div>
        {canAct && (
          <div className="flex flex-wrap gap-2">
            {forwardTargets(op.type, op.status).map((to, i) => (
              <TransitionButton key={to} op={op} to={to} variant={i === 0 ? 'primary' : 'secondary'}
                confirm={to === 'done' ? `Validate ${op.reference}? This posts stock movements and can't be undone.` : undefined} />
            ))}
            <TransitionButton op={op} to="canceled" variant="danger" confirm={`Cancel ${op.reference}? This can't be undone.`} />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-b1 bg-s0 p-4">
        <StateStepper status={op.status} visited={op.transitions.map((t) => t.to_status)} />
      </div>

      <dl className="grid gap-4 rounded-lg border border-b1 bg-s0 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {needs.source && <Field label={op.type === 'adjustment' ? 'Location' : 'From'}>{loc(op.source_location_id)}</Field>}
        {needs.dest && <Field label="To">{loc(op.dest_location_id)}</Field>}
        {needs.partner && <Field label={needs.partner}>{op.partner ?? '—'}</Field>}
        <Field label="Scheduled">{fmtDate(op.scheduled_date)}</Field>
        <Field label="Responsible">{op.responsible}</Field>
        <Field label="Created">{fmtDateTime(op.created_at)}</Field>
        {op.delivery_address && <Field label="Delivery address">{op.delivery_address}</Field>}
        {op.note && <Field label="Note">{op.note}</Field>}
      </dl>

      <section>
        <h3 className="mb-2 text-sm font-medium">Products</h3>
        <Table head={['SKU', 'Product', op.type === 'adjustment' ? 'Counted' : 'Quantity']} empty={op.lines.length === 0}>
          {op.lines.map((l) => (
            <tr key={l.product_id}>
              <td className={`${td} font-mono text-xs`}>{l.sku}</td>
              <td className={td}>{l.product_name}</td>
              <td className={`${td} tabular`}>{fmtQty(l.qty)} {l.uom}</td>
            </tr>
          ))}
        </Table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-medium">Status history</h3>
          <Table head={['When', 'Change', 'By']}>
            {op.transitions.map((t, i) => (
              <tr key={i}>
                <td className={`${td} text-t2`}>{fmtDateTime(t.at)}</td>
                <td className={td}>
                  {t.from_status ? <><Tag status={t.from_status} /> → </> : 'Created as '}<Tag status={t.to_status} />
                </td>
                <td className={`${td} text-t3`}>User #{t.actor_id}</td>
              </tr>
            ))}
          </Table>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-medium">Ledger entries</h3>
          <Table head={['Product', 'Location', 'Delta']} empty={op.ledger.length === 0}
            emptyText={op.status === 'done' ? 'No stock change (count matched).' : 'Posted when the operation is validated.'}>
            {op.ledger.map((e) => (
              <tr key={e.id}>
                <td className={`${td} font-mono text-xs`}>{sku(e.product_id)}</td>
                <td className={td}>{loc(e.location_id)}</td>
                <td className={`${td} tabular ${e.delta > 0 ? 'text-ok' : 'text-accent'}`}>{e.delta > 0 ? '+' : ''}{fmtQty(e.delta)}</td>
              </tr>
            ))}
          </Table>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-t3">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
