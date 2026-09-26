'use client';

import { useEffect, useRef } from 'react';
import { IconX } from '@tabler/icons-react';

type Props = { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean };

/** Native <dialog>: focus trap, Esc to close and backdrop come from the browser. */
export function Modal({ open, onClose, title, children, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-xl border border-b2 bg-s1 p-0 text-t1 backdrop:bg-black/60`}
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="rounded p-1 text-t3 hover:bg-s3 hover:text-t1">
              <IconX size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
