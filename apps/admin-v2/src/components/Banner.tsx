import type { ReactNode } from 'react';
import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

type Tone = 'error' | 'info' | 'success';

const tones: Record<Tone, { bg: string; border: string; fg: string; Icon: typeof Info }> = {
  error: { bg: 'var(--av2-danger-soft)', border: 'var(--av2-danger-border)', fg: 'var(--av2-danger)', Icon: AlertTriangle },
  info: { bg: 'var(--av2-info-soft)', border: 'var(--av2-info-border)', fg: 'var(--av2-info-text)', Icon: Info },
  success: { bg: 'var(--av2-accent-soft)', border: 'var(--av2-accent)', fg: 'var(--av2-accent-hover)', Icon: CheckCircle2 },
};

/**
 * Block-level status message. Matches the guest PWA's CourtBooking.tsx error-banner
 * precedent (icon + text, tinted surface) — see apps/guest-member-pwa/CLAUDE.md.
 */
export function Banner({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const t = tones[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 'var(--av2-radius-sm)',
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.fg,
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <t.Icon size={16} style={{ flex: 'none', marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

/** Inline field-adjacent error text. */
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--av2-danger)' }}>
      {children}
    </p>
  );
}
