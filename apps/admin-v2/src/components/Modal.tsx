import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

// Styling lives in styles.css (`.av2-modal-*`) — NOT an inline <style>. A per-instance
// <style> that re-renders restarts every CSS animation on match, which strands Radix's
// exit-animation wait and the modal never unmounts on close.

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required — the aria-labelledby target. No titleless modals. */
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Action row (buttons); the component doesn't assume a Confirm/Cancel shape. */
  footer?: ReactNode;
}

const MAX_WIDTH: Record<NonNullable<ModalProps['size']>, number> = { sm: 360, md: 480, lg: 640 };

/**
 * Accessible modal — Radix `Dialog` primitives (focus trap, Escape, focus return, ARIA)
 * composed with admin-v2's own token CSS. No Radix default styling ships. The repo had
 * no accessible-modal precedent; `CancelBookingModal` (guest-pwa) has none of the four.
 */
export function Modal({ open, onOpenChange, title, children, size = 'md', footer }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="av2-modal-overlay" />
        {/* Radix traps focus + locks scroll + renders the overlay, and deliberately omits
            aria-modal (SR-compat reasons). We set it explicitly for the spec's semantics. */}
        <Dialog.Content
          className="av2-modal-content"
          style={{ maxWidth: MAX_WIDTH[size] }}
          aria-modal
          aria-describedby={undefined}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 'var(--av2-space-4)',
              marginBottom: 'var(--av2-space-3)',
            }}
          >
            <Dialog.Title style={{ margin: 0, fontSize: 'var(--av2-text-lg)', fontWeight: 700, color: 'var(--av2-text)' }}>
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <IconButton aria-label="Close" icon={<X size={16} />} style={{ margin: -4 }} />
            </Dialog.Close>
          </div>

          <div style={{ fontSize: 'var(--av2-text-base)', color: 'var(--av2-text)', lineHeight: 'var(--av2-leading-normal)' }}>
            {children}
          </div>

          {footer && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--av2-space-2)',
                marginTop: 'var(--av2-space-5)',
              }}
            >
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
