import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { IconButton } from './IconButton';

/**
 * Transient, overlay-positioned, auto-dismissing notification — the case Banner (0.1,
 * persistent + block-level) deliberately doesn't cover. Triggerable from anywhere via
 * a context provider mounted once in main.tsx, same shape as AdminTenantContext.
 */

export type ToastTone = 'error' | 'info' | 'success';

interface ToastRecord {
  id: number;
  message: string;
  tone: ToastTone;
  durationMs: number;
}

interface ToastValue {
  push: (message: string, tone?: ToastTone, durationMs?: number) => void;
}

const ToastContext = createContext<ToastValue | undefined>(undefined);

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4000;

// Same tone vocabulary + icons as Banner — one notification language, not two.
const tones: Record<ToastTone, { bg: string; border: string; fg: string; Icon: typeof Info }> = {
  error: { bg: 'var(--av2-danger-soft)', border: 'var(--av2-danger-border)', fg: 'var(--av2-danger)', Icon: AlertTriangle },
  info: { bg: 'var(--av2-info-soft)', border: 'var(--av2-info-border)', fg: 'var(--av2-info-text)', Icon: Info },
  success: { bg: 'var(--av2-accent-soft)', border: 'var(--av2-accent)', fg: 'var(--av2-accent-hover)', Icon: CheckCircle2 },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback<ToastValue['push']>((message, tone = 'info', durationMs = DEFAULT_DURATION) => {
    setToasts((t) => {
      const next = [...t, { id: nextId.current++, message, tone, durationMs }];
      // Cap the stack — drop the oldest rather than queue indefinitely.
      return next.slice(-MAX_VISIBLE);
    });
  }, []);

  const value = useMemo<ToastValue>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="av2-toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: () => void }) {
  const t = tones[toast.tone];
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Enter on next frame so the transition runs.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Guardrail 1b: the auto-dismiss timer lives entirely in an effect with cleanup —
  // never a state update fired from the render body.
  useEffect(() => {
    const id = setTimeout(() => setLeaving(true), toast.durationMs);
    return () => clearTimeout(id);
  }, [toast.durationMs]);

  // Once leaving, play the (quicker) exit, then actually remove.
  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(onDismiss, 140);
    return () => clearTimeout(id);
  }, [leaving, onDismiss]);

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--av2-space-2)',
        padding: 'var(--av2-space-2) var(--av2-space-3)',
        borderRadius: 'var(--av2-radius-sm)',
        background: t.bg,
        border: `1px solid ${t.border}`,
        color: t.fg,
        boxShadow: 'var(--av2-shadow-lg)',
        fontSize: 'var(--av2-text-sm)',
        lineHeight: 'var(--av2-leading-normal)',
        opacity: shown && !leaving ? 1 : 0,
        transform: shown && !leaving ? 'translateY(0)' : 'translateY(8px)',
        transition: `opacity ${leaving ? 'var(--av2-duration-fast)' : 'var(--av2-duration-base)'} var(--av2-ease-standard), transform ${leaving ? 'var(--av2-duration-fast)' : 'var(--av2-duration-base)'} var(--av2-ease-standard)`,
      }}
    >
      <t.Icon size={16} style={{ flex: 'none', marginTop: 1 }} />
      <span style={{ flex: 1 }}>{toast.message}</span>
      <IconButton
        aria-label="Dismiss"
        icon={<X size={14} />}
        onClick={() => setLeaving(true)}
        style={{ width: 24, height: 24, margin: -2, color: 'inherit' }}
      />
    </div>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
