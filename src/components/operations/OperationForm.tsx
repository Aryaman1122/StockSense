'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { api, revalidateAll } from '@/lib/api';
import { NEEDS, OP_TYPES, TYPE_LABEL, today } from '@/lib/constants';
import type { Location, Operation, OpType, Product, Warehouse } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

const optionalId = z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().int().positive().optional());
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

// Mirrors OperationIn in the backend's app/schemas.py, plus the per-type location rules.
const schema = z.object({
  type: z.enum(['receive', 'transfer', 'delivery', 'adjustment']),
  source_location_id: optionalId,
  dest_location_id: optionalId,
  scheduled_date: z.string().optional().transform((v) => v || undefined),
  partner: text(200),
  delivery_address: text(500),
  note: text(500),
  lines: z.array(z.object({
    product_id: z.coerce.number<string | number>().int().positive('Pick a product'),
    qty: z.coerce.number<string | number>().min(0, 'Must be ≥ 0').max(99_999_999_999),
  })).min(1, 'Add at least one product').max(200),
}).superRefine((v, ctx) => {
  const needs = NEEDS[v.type];
  if (needs.source && !v.source_location_id) ctx.addIssue({ code: 'custom', path: ['source_location_id'], message: 'Required' });
  if (needs.dest && !v.dest_location_id) ctx.addIssue({ code: 'custom', path: ['dest_location_id'], message: 'Required' });
  if (v.type === 'transfer' && v.source_location_id === v.dest_location_id)
    ctx.addIssue({ code: 'custom', path: ['dest_location_id'], message: 'Must differ from source' });
  v.lines.forEach((l, i) => {
    if (v.type !== 'adjustment' && l.qty === 0) ctx.addIssue({ code: 'custom', path: ['lines', i, 'qty'], message: 'Must be > 0' });
    if (v.lines.findIndex((o) => o.product_id === l.product_id) !== i)
      ctx.addIssue({ code: 'custom', path: ['lines', i, 'product_id'], message: 'Already listed' });
  });
});

export function OperationForm({ defaultType = 'receive', onDone }: { defaultType?: OpType; onDone: () => void }) {
  const { isManager } = useAuth();
  const router = useRouter();
  const { data: products } = useSWR<Product[]>('/products');
  const { data: locations } = useSWR<Location[]>('/locations');
  const { data: warehouses } = useSWR<Warehouse[]>('/warehouses');
  // One key per form instance: a double-submit or network retry replays instead of creating twice.
  const idempotencyKey = useRef(crypto.randomUUID());

  const types = OP_TYPES.filter((t) => t !== 'adjustment' || isManager);
  const { register, control, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      type: types.includes(defaultType) ? defaultType : 'receive',
      scheduled_date: today(),
      lines: [{ product_id: '', qty: '' }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const type = watch('type');
  const needs = NEEDS[type];

  const onSubmit = handleSubmit(async (v) => {
    const body = {
      ...v,
      source_location_id: needs.source ? v.source_location_id : undefined,
      dest_location_id: needs.dest ? v.dest_location_id : undefined,
      partner: needs.partner ? v.partner : undefined,
      delivery_address: type === 'delivery' ? v.delivery_address : undefined,
    };
    try {
      const op = await api<Operation>('/operations', {
        method: 'POST', json: body, headers: { 'Idempotency-Key': idempotencyKey.current },
      });
      toast.success(`${op.reference} created`);
      revalidateAll();
      onDone();
      router.push(`/operations/${op.id}`);
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });

  const whName = (id: number) => warehouses?.find((w) => w.id === id)?.short_code ?? '';
  const locationOptions = (
    <>
      <option value="">Select location…</option>
      {locations?.map((l) => <option key={l.id} value={l.id}>{l.name} ({whName(l.warehouse_id)})</option>)}
    </>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Type" {...register('type')}>
          {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </Select>
        <Input label="Scheduled date" type="date" {...register('scheduled_date')} />
        {needs.source && (
          <Select label={type === 'adjustment' ? 'Location counted' : 'Source location'} {...register('source_location_id')} error={errors.source_location_id?.message}>
            {locationOptions}
          </Select>
        )}
        {needs.dest && (
          <Select label="Destination location" {...register('dest_location_id')} error={errors.dest_location_id?.message}>
            {locationOptions}
          </Select>
        )}
        {needs.partner && <Input label={needs.partner} {...register('partner')} error={errors.partner?.message} />}
        {type === 'delivery' && <Input label="Delivery address" {...register('delivery_address')} error={errors.delivery_address?.message} />}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-t2">
          Products {type === 'adjustment' && <span className="text-t3">— enter the physically counted quantity</span>}
        </legend>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.id} className="flex items-start gap-2">
              <Select aria-label="Product" className="flex-1" {...register(`lines.${i}.product_id`)} error={errors.lines?.[i]?.product_id?.message}>
                <option value="">Select product…</option>
                {products?.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name} ({p.uom})</option>)}
              </Select>
              <Input aria-label="Quantity" type="number" step="0.001" min={0} placeholder="Qty" className="w-28"
                {...register(`lines.${i}.qty`)} error={errors.lines?.[i]?.qty?.message} />
              <Button variant="ghost" aria-label="Remove line" disabled={fields.length === 1} onClick={() => remove(i)} className="px-2.5">
                <IconTrash size={16} />
              </Button>
            </div>
          ))}
        </div>
        {errors.lines?.root && <p className="mt-1 text-xs text-accent">{errors.lines.root.message}</p>}
        <Button variant="ghost" icon={<IconPlus size={16} />} className="mt-2" onClick={() => append({ product_id: '', qty: '' })}>
          Add product
        </Button>
      </fieldset>

      <Input label="Note" {...register('note')} error={errors.note?.message} />

      {errors.root && <p role="alert" className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{errors.root.message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={isSubmitting}>Create draft</Button>
      </div>
    </form>
  );
}
