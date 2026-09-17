import { useEffect, useState } from 'react';
import { useAuth, useTenant } from '@badminton/ui-shared';
import { requestOtp, attachPhone } from '../lib/auth';
import ConfirmDialog from './ui/ConfirmDialog';

interface VerifyPhoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Empty/absent for a phone-absent guest (F-235 Slice D) -- renders an editable entry field
   * instead of the read-only re-verify display. */
  phone: string;
  onVerified: () => void;
}

// F-235 Slice C: the phone-re-verify gate at Reserve, for a walk-in-created guest (F-229) whose
// phone was typed in by an admin and never proven live. ConfirmDialog.tsx's own doc comment
// already named this exact use case as an anticipated consumer -- built on it, not a new shell.
// The request/verify two-step state machine mirrors CompleteSignupScreen.tsx's now-deleted
// pattern (same requestOtp/attachPhone calls) rather than reinventing it.
//
// F-235 Slice D: extended to a second mode. `attach-phone` (services/identity-auth/src/index.ts)
// already branches server-side on whether the caller has an existing phone (re-verify) or none
// (brand-new) -- both converge on the same prisma.user.update, so no backend change was needed,
// only a frontend entry point for the phone-absent case that CompleteSignupScreen.tsx used to
// cover before this slice deleted it.
export default function VerifyPhoneDialog({ open, onOpenChange, phone, onVerified }: VerifyPhoneDialogProps) {
  const { accessToken, mergeUser } = useAuth();
  const { tenant } = useTenant();

  const isEntryMode = !phone;

  const [phoneInput, setPhoneInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePhone = phone || phoneInput;

  // Reset all state whenever the dialog closes, so a later reopen doesn't resume mid-flow from
  // a previous, unrelated attempt.
  useEffect(() => {
    if (!open) {
      setPhoneInput('');
      setOtpSent(false);
      setCode('');
      setLoading(false);
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    setError(null);
    if (!otpSent) {
      if (isEntryMode && phoneInput.trim().length < 10) {
        setError('Please enter a valid mobile number.');
        return;
      }
      try {
        setLoading(true);
        if (!tenant) throw new Error('Tenant context is required to request OTP');
        await requestOtp(effectivePhone, tenant.id);
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
      await attachPhone(effectivePhone, code, accessToken, mergeUser);
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
      title={isEntryMode ? 'Add your phone number' : 'Verify your phone'}
      confirmLabel={otpSent ? 'Verify & Continue' : 'Send code'}
      confirmDisabled={
        otpSent ? code.trim().length < 4 : isEntryMode && phoneInput.trim().length < 10
      }
      onConfirm={handleConfirm}
      loading={loading}
      error={error}
      body={
        <div className="flex flex-col gap-3">
          <p style={{ fontSize: '13px', lineHeight: 1.55, color: 'var(--color-neutral-700)' }}>
            {otpSent ? (
              // `effectivePhone` is E.164 in re-verify mode (the JWT's own claim, already
              // prefixed); in entry mode it's the raw digits just typed below.
              `Enter the code we sent by SMS to ${isEntryMode ? `+91 ${effectivePhone}` : effectivePhone}.`
            ) : isEntryMode ? (
              'We use your phone number for booking confirmations and court check-in.'
            ) : (
              `We need to confirm ${phone} is really yours before this booking. This only takes a moment.`
            )}
          </p>
          {!otpSent && isEntryMode && (
            <div
              className="flex items-center gap-2.5 px-4"
              style={{ border: '1px solid var(--color-neutral-300)', background: 'var(--color-neutral-100)', borderRadius: '14px', minHeight: '52px' }}
            >
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-neutral-700)' }}>+91</span>
              <span style={{ width: '1px', height: '22px', background: 'var(--color-neutral-300)' }} />
              <input
                type="tel"
                autoFocus
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="99999 99999"
                className="flex-1 bg-transparent border-none outline-none"
                style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)' }}
              />
            </div>
          )}
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
