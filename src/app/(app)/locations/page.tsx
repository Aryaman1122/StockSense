'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { IconPlus } from '@tabler/icons-react';
import { api, revalidateAll } from '@/lib/api';
import type { Location, Warehouse } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, td } from '@/components/ui/Table';

// No '/': short codes are joined into references like WH/IN/0001 (see ShortCode in app/schemas.py).
const shortCode = z.string().trim().min(1, 'Required').max(20).regex(/^[A-Za-z0-9_.-]+$/, 'Letters, digits, _ . - only');
const name = z.string().trim().min(1, 'Required').max(100);
const warehouseSchema = z.object({ name, short_code: shortCode, address: z.string().trim().max(500).optional() });
const locationSchema = z.object({ name, short_code: shortCode });

export default function LocationsPage() {
  const { isManager } = useAuth();
  const [selected, setSelected] = useState<number | null>(null);
  const [modal, setModal] = useState<'warehouse' | 'location' | null>(null);
  const { data: warehouses, error: whError } = useSWR<Warehouse[]>('/warehouses');
  const current = warehouses?.find((w) => w.id === selected) ?? warehouses?.[0];
  const { data: locations, error: locError } = useSWR<Location[]>(current ? `/locations?warehouse_id=${current.id}` : null);

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Warehouses</h2>
          {isManager && <Button variant="secondary" icon={<IconPlus size={16} />} onClick={() => setModal('warehouse')}>Add</Button>}
        </div>
        {whError && <p className="text-sm text-accent">{whError.message}</p>}
        <ul className="space-y-1">
          {warehouses?.map((w) => (
            <li key={w.id}>
              <button
                onClick={() => setSelected(w.id)}
                aria-current={current?.id === w.id}
                className={`w-full rounded-lg border px-4 py-3 text-left transition-colors
                  ${current?.id === w.id ? 'border-accent/50 bg-accent/5' : 'border-b1 bg-s0 hover:border-b3'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{w.name}</span>
                  <span className="font-mono text-xs text-t3">{w.short_code}</span>
                </div>
                {w.address && <div className="mt-0.5 text-xs text-t3">{w.address}</div>}
              </button>
            </li>
          ))}
          {warehouses?.length === 0 && <li className="text-sm text-t3">No warehouses yet.</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Locations {current && <span className="text-t3">· {current.name}</span>}</h2>
          {isManager && current && <Button variant="secondary" icon={<IconPlus size={16} />} onClick={() => setModal('location')}>Add</Button>}
        </div>
        <Table head={['Name', 'Short code']} loading={!!current && !locations} error={locError}
          empty={!current || locations?.length === 0} emptyText={current ? 'No locations in this warehouse.' : 'Create a warehouse first.'}>
          {locations?.map((l) => (
            <tr key={l.id}>
              <td className={td}>{l.name}</td>
              <td className={`${td} font-mono text-xs text-t2`}>{l.short_code}</td>
            </tr>
          ))}
        </Table>
      </section>

      <Modal open={modal === 'warehouse'} onClose={() => setModal(null)} title="New warehouse">
        <WarehouseForm onDone={(w) => { setModal(null); if (w) setSelected(w.id); }} />
      </Modal>
      <Modal open={modal === 'location'} onClose={() => setModal(null)} title={`New location in ${current?.name}`}>
        {current && <LocationForm warehouse={current} onDone={() => setModal(null)} />}
      </Modal>
    </div>
  );
}

function WarehouseForm({ onDone }: { onDone: (w?: Warehouse) => void }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(warehouseSchema) });
  const onSubmit = handleSubmit(async (v) => {
    try {
      const w = await api<Warehouse>('/warehouses', { method: 'POST', json: { ...v, address: v.address || null } });
      toast.success(`${w.name} created`);
      revalidateAll();
      onDone(w);
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Input label="Name" autoFocus {...register('name')} error={errors.name?.message} />
      <Input label="Short code" placeholder="WH" {...register('short_code')} error={errors.short_code?.message} />
      <Input label="Address (optional)" {...register('address')} error={errors.address?.message} />
      {errors.root && <p role="alert" className="text-sm text-accent">{errors.root.message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" loading={isSubmitting}>Create</Button>
      </div>
    </form>
  );
}

function LocationForm({ warehouse, onDone }: { warehouse: Warehouse; onDone: () => void }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(locationSchema) });
  const onSubmit = handleSubmit(async (v) => {
    try {
      const l = await api<Location>('/locations', { method: 'POST', json: { ...v, warehouse_id: warehouse.id } });
      toast.success(`${l.name} created`);
      revalidateAll();
      onDone();
    } catch (e) {
      setError('root', { message: (e as Error).message });
    }
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Input label="Name" autoFocus placeholder={`${warehouse.short_code}/Stock`} {...register('name')} error={errors.name?.message} />
      <Input label="Short code" placeholder="STOCK" {...register('short_code')} error={errors.short_code?.message} />
      {errors.root && <p role="alert" className="text-sm text-accent">{errors.root.message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={isSubmitting}>Create</Button>
      </div>
    </form>
  );
}
