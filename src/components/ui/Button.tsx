import { forwardRef } from 'react';

const VARIANTS = {
  primary: 'bg-accent text-white hover:bg-accent-soft',
  secondary: 'bg-s3 text-t1 border border-b2 hover:bg-s4',
  ghost: 'text-t2 hover:bg-s3 hover:text-t1',
  danger: 'bg-transparent text-accent border border-accent/40 hover:bg-accent/10',
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  loading?: boolean;
  icon?: React.ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', loading, icon, className = '', children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors
        disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-info
        ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  );
});
