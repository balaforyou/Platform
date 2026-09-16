import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle } from 'lucide-react';
import Button from './Button';
import './ConfirmDialog.css';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  error?: string | null;
}

// F-235 Phase 0: backs every confirm-then-acknowledge instance from the design brief's 0.4
// (check-in confirm, T&C acceptance, the phone-verify step's confirm) on the already-present,
// previously-unused @radix-ui/react-dialog dependency. Same visual result as
// CancelBookingModal.tsx's existing bespoke Go-Back/Confirm-Cancel + inline-error pattern,
// generalized into a reusable component -- that modal itself is not touched this slice (a
// future screen slice migrates it onto this component).
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Go Back',
  destructive = false,
  onConfirm,
  loading = false,
  error = null,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="gpwa-confirm__overlay" />
        <Dialog.Content className="gpwa-confirm__content">
          <Dialog.Title className="gpwa-confirm__title">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="gpwa-confirm__body">{body}</div>
          </Dialog.Description>

          {error && (
            <div className="gpwa-confirm__error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="gpwa-confirm__actions">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
