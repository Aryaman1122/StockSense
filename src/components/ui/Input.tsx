import { forwardRef, useId } from 'react';

export const fieldClass =
  'w-full rounded-md border border-b2 bg-s1 px-3 py-2 text-sm text-t1 placeholder:text-t3 ' +
  'focus:border-info focus:outline-none disabled:opacity-60';

type Props = React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string };

export const Input = forwardRef<HTMLInputElement, Props>(function Input({ label, error, className = '', id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-t2">{label}</label>}
      <input ref={ref} id={inputId} aria-invalid={!!error} className={fieldClass} {...rest} />
      {error && <p className="mt-1 text-xs text-accent">{error}</p>}
    </div>
  );
});
