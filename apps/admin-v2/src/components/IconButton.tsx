import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  /** Required — an icon-only control with no label is an accessibility gap; enforced by the type. */
  'aria-label': string;
  variant?: Variant;
  loading?: boolean;
}

// Same variant colour logic as Button, square hit target instead of auto width.
const base: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  flex: 'none',
  borderRadius: 'var(--av2-radius-sm)',
  border: '1px solid transparent',
  cursor: 'pointer',
  transition:
    'background var(--av2-duration-fast) var(--av2-ease-standard), border-color var(--av2-duration-fast) var(--av2-ease-standard), opacity var(--av2-duration-fast) var(--av2-ease-standard)',
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: { background: 'var(--av2-accent)', color: 'var(--av2-accent-fg)' },
  secondary: { background: 'var(--av2-surface)', color: 'var(--av2-text)', borderColor: 'var(--av2-border)' },
  ghost: { background: 'transparent', color: 'var(--av2-muted)' },
};

export function IconButton({
  icon,
  variant = 'ghost',
  loading = false,
  disabled,
  style,
  ...rest
}: IconButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...rest}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      style={{
        ...base,
        ...variants[variant],
        opacity: isDisabled ? 0.6 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {loading ? <Spinner size={16} /> : icon}
    </button>
  );
}
