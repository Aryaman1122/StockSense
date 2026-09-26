'use client';

import { useEffect, useState } from 'react';
import { Button } from './Button';

// ponytail: client-side paging. The API has `limit` but no offset/cursor; add server paging when lists outgrow ~500 rows.
export function usePaginated<T>(items: T[] | undefined, pageSize = 25) {
  const [page, setPage] = useState(0);
  const total = items?.length ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { if (page >= pages) setPage(0); }, [page, pages]);
  return { rows: items?.slice(page * pageSize, (page + 1) * pageSize) ?? [], page, pages, total, setPage, pageSize };
}

export function Pagination({ page, pages, total, setPage, pageSize }: ReturnType<typeof usePaginated<unknown>>) {
  if (total <= pageSize) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-t3">
      <span>{page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}</span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button variant="secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
