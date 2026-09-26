'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { api, qs, revalidateAll } from '@/lib/api';
import { fmtMoney, fmtQty } from '@/lib/constants';
import type { Location, Product } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination, usePaginated } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Table, td } from '@/components/ui/Table';

export default function ProductsPage() {
  const { isManager } = useAuth();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const onSearch = useCallback((v: string) => setQ(v), []);
  const { data, error } = useSWR<Product[]>(qs('/products', { q }));
  const page = usePaginated(data, 50);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput onSearch={onSearch} placeholder="SKU or name…" />
        {isManager && <Button icon={<IconPlus size={16} />} onClick={() => setEditing('new')}>New product</Button>}
      </div>
      <Table head={['SKU', 'Name', 'Category', 'UoM', 'Min qty', 'Unit cost', ...(isManager ? [''] : [])]}
        loading={!data} error={error} empty={data?.length === 0} emptyText="No products.">
        {page.rows.map((p) => (
          <tr key={p.id}>
            <td className={`${td} font-mono text-xs`}>{p.sku}</td>
            <td className={td}>{p.name}</td>
            <td className={`${td} text-t2`}>{p.category}</td>
            <td className={`${td} text-t2`}>{p.uom}</td>
            <td className={`${td} text-right`}>{fmtQty(p.min_qty)}</td>
            <td className={`${td} text-right`}>{fmtMoney(p.unit_cost)}</td>
            {isManager && (
              <td className={`${td} w-10`}>
                <Button variant="ghost" aria-label={`Edit ${p.sku}`} className="px-2" onClick={() => setEditing(p)}>
                  <IconPencil size={16} />
                </Button>
              </td>
            )}
          </tr>
        ))}
      </Table>
      <Pagination {...page} />
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New product' : 'Edit product'}>
        {editing && <ProductForm product={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}

const num = z.coerce.number<string | number>().min(0, 'Must be ≥ 0');
// Mirrors ProductIn / ProductPatch in the backend's app/schemas.py.
const schema = z.object({
  sku: z.string().trim().min(1, 'Required').max(50),
  name: z.string().trim().min(1, 'Required').max(100),
  category: z.string().trim().min(1, 'Required').max(100),
  uom: z.string().trim().min(1, 'Required').max(20),
  min_qty: num,
  unit_cost: num,
  initial_qty: num.optional(),
  initial_location_id: z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().int().optional()),
}).refine((v) => !v.initial_qty || v.initial_location_id, { path: ['initial_location_id'], message: 'Required with initial stock' });

function ProductForm({ product, onDone }: { product: Product | null; onDone: () => void }) {
  const { data: locations } = useSWR<Location[]>(product ? null : '/locations');
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: product
      ? { ...product }
      : { sku: '', name: '', category: '', uom: 'Units', min_qty: 0, unit_cost: 0, initial_qty: 0, initial_location_id: '' },
  });

  const onSubmit = handleSubmit(async ({ initial_qty, initial_location_id, ...fields }) => {
    try {
      if (product) {
        await api(`/products/${product.id}`, { method: 'PATCH', json: fields });
        toast.success(`${fields.sku} updated`);
      } else {
        await api('/products', { method: 'POST', json: { ...fields, initial_qty, initial_location_id } });
        toast.success(`${fields.sku} created`);
      }
      revalidateAll();
      onDone();
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="SKU" {...register('sku')} error={errors.sku?.message} />
        <Input label="Name" {...register('name')} error={errors.name?.message} />
        <Input label="Category" {...register('category')} error={errors.category?.message} />
        <Input label="Unit of measure" {...register('uom')} error={errors.uom?.message} />
        <Input label="Minimum qty (reorder alert)" type="number" step="0.001" min={0} {...register('min_qty')} error={errors.min_qty?.message} />
        <Input label="Unit cost" type="number" step="0.01" min={0} {...register('unit_cost')} error={errors.unit_cost?.message} />
        {!product && (
          <>
            <Input label="Initial stock (optional)" type="number" step="0.001" min={0} {...register('initial_qty')} error={errors.initial_qty?.message} />
            <Select label="Initial stock location" {...register('initial_location_id')} error={errors.initial_location_id?.message}>
              <option value="">—</option>
              {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </>
        )}
      </div>
      {errors.root && <p role="alert" className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{errors.root.message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={isSubmitting}>{product ? 'Save' : 'Create'}</Button>
      </div>
    </form>
  );
}
