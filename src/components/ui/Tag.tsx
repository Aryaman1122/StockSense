import { STATUS_STYLE } from '@/lib/constants';
import type { OpStatus } from '@/lib/types';

export function Tag({ status }: { status: OpStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}
