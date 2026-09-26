'use client';

import { useEffect, useState } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { fieldClass } from './Input';

/** Search box that reports its value after the user stops typing. */
export function SearchInput({ onSearch, placeholder = 'Search…', delay = 300 }: {
  onSearch: (q: string) => void; placeholder?: string; delay?: number;
}) {
  const [value, setValue] = useState('');
  useEffect(() => {
    const t = setTimeout(() => onSearch(value.trim()), delay);
    return () => clearTimeout(t);
  }, [value, delay, onSearch]);

  return (
    <div className="relative w-full sm:w-64">
      <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={`${fieldClass} pl-9`}
      />
    </div>
  );
}
