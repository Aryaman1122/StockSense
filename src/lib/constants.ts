import type { OpStatus, OpType } from './types';

export const OP_TYPES: OpType[] = ['receive', 'transfer', 'delivery', 'adjustment'];
export const OP_STATUSES: OpStatus[] = ['draft', 'waiting', 'ready', 'done', 'canceled'];

export const TYPE_LABEL: Record<OpType, string> = {
  receive: 'Receipt', transfer: 'Internal Transfer', delivery: 'Delivery', adjustment: 'Adjustment',
};

export const TYPE_COLOR: Record<OpType, string> = {
  receive: 'text-ok', delivery: 'text-accent', transfer: 'text-info', adjustment: 'text-violet',
};

export const STATUS_STYLE: Record<OpStatus, string> = {
  draft: 'bg-s4 text-t2',
  waiting: 'bg-warn/15 text-warn',
  ready: 'bg-info/15 text-info',
  done: 'bg-ok/15 text-ok',
  canceled: 'bg-s3 text-t3 line-through',
};

// Mirrors can_transition() in the backend's app/inventory.py.
const NEXT: Partial<Record<OpStatus, OpStatus>> = { draft: 'waiting', waiting: 'ready', ready: 'done' };

export const isOpen = (s: OpStatus) => s in NEXT;

/** Forward targets from `status` (cancel excluded). Receipts may skip 'waiting'. */
export function forwardTargets(type: OpType, status: OpStatus): OpStatus[] {
  const next = NEXT[status];
  if (!next) return [];
  return type === 'receive' && status === 'draft' ? ['ready', 'waiting'] : [next];
}

export const TRANSITION_LABEL: Record<OpStatus, string> = {
  draft: 'Draft', waiting: 'Mark as Waiting', ready: 'Mark as Ready', done: 'Validate', canceled: 'Cancel',
};

/** Which fields an operation type needs. The backend takes the warehouse from source (dest for receipts). */
export const NEEDS: Record<OpType, { source: boolean; dest: boolean; partner: string | null }> = {
  receive: { source: false, dest: true, partner: 'Supplier' },
  delivery: { source: true, dest: false, partner: 'Customer' },
  transfer: { source: true, dest: true, partner: null },
  adjustment: { source: true, dest: false, partner: null },
};

const qtyFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });
const moneyFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtQty = (n: number) => qtyFmt.format(n);
export const fmtMoney = (n: number) => moneyFmt.format(n);
export const fmtDate = (s: string) => new Date(s.length === 10 ? s + 'T00:00' : s).toLocaleDateString();
export const fmtDateTime = (s: string) => new Date(s).toLocaleString();
export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
