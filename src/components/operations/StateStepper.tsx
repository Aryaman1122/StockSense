import { IconCheck, IconX } from '@tabler/icons-react';
import type { OpStatus } from '@/lib/types';

const STEPS: OpStatus[] = ['draft', 'waiting', 'ready', 'done'];

/** draft → waiting → ready → done. `visited` marks skipped steps (receipts may jump draft → ready). */
export function StateStepper({ status, visited }: { status: OpStatus; visited: OpStatus[] }) {
  const canceled = status === 'canceled';
  const current = canceled ? STEPS.indexOf(visited.filter((s) => s !== 'canceled').at(-1) ?? 'draft') : STEPS.indexOf(status);

  return (
    <ol className="flex items-center gap-1 overflow-x-auto text-xs sm:text-sm" aria-label="Operation status">
      {STEPS.map((s, i) => {
        const past = i < current || (i === current && s === 'done');
        const active = i === current && !canceled && s !== 'done';
        const skipped = past && !visited.includes(s);
        return (
          <li key={s} className="flex items-center gap-1" aria-current={active ? 'step' : undefined}>
            {i > 0 && <span className={`h-px w-4 sm:w-10 ${i <= current ? 'bg-b3' : 'bg-b1'}`} />}
            <span
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 capitalize
                ${active ? 'bg-accent/15 text-t1 ring-1 ring-accent/50' : past ? 'text-t2' : 'text-t4'}
                ${skipped ? 'line-through opacity-60' : ''}`}
            >
              {past && !skipped && <IconCheck size={14} className="text-ok" />}
              {s}
            </span>
          </li>
        );
      })}
      {canceled && (
        <li className="ml-2 flex items-center gap-1 rounded-full bg-s3 px-3 py-1 text-t2">
          <IconX size={14} className="text-accent" /> canceled
        </li>
      )}
    </ol>
  );
}
