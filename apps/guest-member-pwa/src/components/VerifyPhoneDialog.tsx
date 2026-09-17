import { useEffect, useState } from 'react';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { requestOtp, attachPhone } from '../lib/auth';
import ConfirmDialog from './ui/ConfirmDialog';

interface VerifyPhoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  onVerified: () => void;
}

// F-235 Slice C: the phone-re-verify gate at Reserve, for a walk-in-created guest (F-229) whose
// phone was typed in by an admin and never proven live. ConfirmDialog.tsx's own doc comment
// already named this exact use case as an anticipated consumer -- built on it, not a new shell.
// The request/verify two-step state machine mirrors CompleteSignupScreen.tsx's existing pattern
// (same requestOtp/attachPhone calls) rather than reinventing it; unlike that screen, the phone
// itself is read-only here -- the guest is re-proving a number already on file, not entering a
// new one.
export default function VerifyPhoneDialog({ open, onOpenChange, phone, onVerified }: VerifyPhoneDialogProps) {
  const { accessToken, mergeUser } = useAuth();
  const { tenant } = useTenant();

  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the two-step state whenever the dialog closes, so a later reopen doesn't resume
  // mid-flow from a previous, unrelated attempt.
  useEffect(() => {
    if (!open) {
      setOtpSent(false);
      setCode('');
      setLoading(false);
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    setError(null);
    if (!otpSent) {
      try {
        setLoading(true);
        if (!tenant) throw new Error('Tenant context is required to request OTP');
        await requestOtp(phone, tenant.id);
        setOtpSent(true);
      } catch (err: any) {
        setError(err.message || 'Failed to send verification code. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      // attachPhone merges { phone, isPhoneVerified } onto the AuthContext user itself --
      // attach-phone never re-signs a JWT, so without this the guest would pass the real
      // server-side check but the client-side gate would still see stale state.
      await attachPhone(phone, code, accessToken, mergeUser);
      onOpenChange(false);
      onVerified();
    } catch (err: any) {
      setError(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Verify your phone"
      confirmLabel={otpSent ? 'Verify & Continue' : 'Send code'}
      confirmDisabled={otpSent && code.trim().length < 4}
      onConfirm={handleConfirm}
      loading={loading}
      error={error}
      body={
        <div className="flex flex-col gap-3">
          <p style={{ fontSize: '13px', lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
            {/* `phone` is the JWT's own claim, already E.164 (+91...) -- not re-prefixed here. */}
            {otpSent
              ? `Enter the code we sent by SMS to ${phone}.`
              : `We need to confirm ${phone} is really yours before this booking. This only takes a moment.`}
          </p>
          {otpSent && (
            <input
              type="text"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter 4 or 6 digit OTP"
              className="w-full text-center font-bold text-xl tracking-widest outline-none transition-colors border"
              style={{
                minHeight: '54px',
                borderRadius: '14px',
                background: 'var(--color-neutral-100)',
                borderColor: 'var(--color-neutral-300)',
                color: 'var(--color-text)',
              }}
            />
          )}
        </div>
      }
    />
  );
}
