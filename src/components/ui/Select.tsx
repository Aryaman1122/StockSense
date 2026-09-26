import { forwardRef, useId } from 'react';
import { fieldClass } from './Input';

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string };

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, error, className = '', id, children, ...rest }, ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={className}>
      {label && <label htmlFor={selectId} className="mb-1.5 block text-xs font-medium text-t2">{label}</label>}
      <select ref={ref} id={selectId} aria-invalid={!!error} className={fieldClass} {...rest}>
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-accent">{error}</p>}
    </div>
  );
});
