import React from 'react';
import LoadingState from './LoadingState';
import './Button.css';

export interface ButtonProps {
  variant: 'primary' | 'secondary' | 'destructive';
  size?: 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  id?: string;
}

// F-235 Phase 0: the app's first shared button component -- today's `primaryBtn` in
// LoginScreen.tsx is a locally-defined one-off (see claude/guestPWA2/05-*.md §3 for the full
// spec this implements: exact colors, states, sizes).
export default function Button({
  variant,
  size = 'md',
  loading = false,
  disabled = false,
  children,
  onClick,
  type = 'button',
  id,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      data-variant={variant}
      data-size={size}
      className="gpwa-btn"
    >
      {loading ? <LoadingState variant="inline" /> : children}
    </button>
  );
}
