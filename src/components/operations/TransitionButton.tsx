'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError, revalidateAll } from '@/lib/api';
import { TRANSITION_LABEL } from '@/lib/constants';
import type { Operation, OpStatus } from '@/lib/types';
import { Button } from '@/components/ui/Button';

type Props = { op: Operation; to: OpStatus; variant?: 'primary' | 'secondary' | 'danger'; confirm?: string };

/**
 * POST /operations/{id}/transition with {from, to}.
 * The Idempotency-Key is fixed per (operation, from, to), so a retry after a timeout replays
 * the first result instead of moving the operation twice. A fresh key is only minted once that intent succeeds.
 */
export function TransitionButton({ op, to, variant = 'primary', confirm }: Props) {
  const [busy, setBusy] = useState(false);
  const keys = useRef(new Map<string, string>());

  const run = async () => {
    if (confirm && !window.confirm(confirm)) return;
    const intent = `${op.id}:${op.status}:${to}`;
    if (!keys.current.has(intent)) keys.current.set(intent, crypto.randomUUID());
    setBusy(true);
    try {
      const updated = await api<Operation>(`/operations/${op.id}/transition`, {
        method: 'POST',
        json: { from: op.status, to },
        headers: { 'Idempotency-Key': keys.current.get(intent)! },
      });
      keys.current.delete(intent);
      toast.success(`${updated.reference} → ${updated.status}`);
    } catch (e) {
      // stale_state: someone else moved it first. Either way, show the server's current state.
      if (e instanceof ApiError && e.status !== 0) keys.current.delete(intent);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      revalidateAll();
    }
  };

  return <Button variant={variant} loading={busy} onClick={run}>{TRANSITION_LABEL[to]}</Button>;
}
