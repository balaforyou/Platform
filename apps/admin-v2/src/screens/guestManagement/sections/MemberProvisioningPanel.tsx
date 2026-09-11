import { useState } from 'react';
import { Check, CircleAlert, Search, UserPlus } from 'lucide-react';
import { Banner, Button, Card, useToast } from '../../../components';
import { friendlyError } from '../../../lib/errorMessage';
import { useGuestLookup, usePromoteToMember } from '../queries';
import type { GuestLookupResult } from '../types';

type LookupState = 'idle' | 'found' | 'not-found';

const fieldStyle: React.CSSProperties = {
  padding: 'var(--av2-space-2) var(--av2-space-3)',
  fontSize: 'var(--av2-text-base)',
  borderRadius: 'var(--av2-radius-sm)',
  border: '1px solid var(--av2-border)',
  background: 'var(--av2-surface)',
  color: 'var(--av2-text)',
};

function tryAnother(color: string): React.CSSProperties {
  return {
    marginLeft: 'auto',
    appearance: 'none',
    border: 'none',
    background: 'none',
    color,
    fontSize: 'var(--av2-text-xs)',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  };
}

/**
 * F-228 Step 6 — promote a guest/member account to MEMBER by email. Same three-state
 * (idle/found/not-found) lookup shape as ReservationsPanel's walk-in flow, adapted: this looks
 * up by email (not phone, since the target accounts are Google-first signups that may have no
 * phone attached yet — F-228 Step 1) and its terminal action is promotion, not booking, so there
 * is no "create on not-found" sub-flow — an account that doesn't exist here isn't created, it's
 * just reported as not found.
 *
 * Tenant-level, not branch-scoped (userType promotion has no branchId) — unlike the other two
 * Guest Management tabs, this panel doesn't take a branchId prop.
 */
export function MemberProvisioningPanel() {
  const toast = useToast();
  const lookup = useGuestLookup();
  const promote = usePromoteToMember();

  const [email, setEmail] = useState('');
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  const [foundUser, setFoundUser] = useState<GuestLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setLookupState('idle');
    setFoundUser(null);
    setLookupError(null);
    setPromoteError(null);
  };

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const runLookup = async () => {
    setLookupError(null);
    setPromoteError(null);
    try {
      const out = await lookup.mutateAsync({ email: email.trim() });
      if (out.status === 'found') {
        setFoundUser(out.user);
        setLookupState('found');
      } else {
        setLookupState('not-found');
      }
    } catch (err) {
      setLookupError(friendlyError(err, 'Couldn’t look up that email. Try again.'));
    }
  };

  const runPromote = async () => {
    if (!foundUser) return;
    setPromoteError(null);
    try {
      const updated = await promote.mutateAsync({ userId: foundUser.id });
      setFoundUser(updated);
      toast.push('Account promoted to Member.', 'success');
    } catch (err) {
      setPromoteError(friendlyError(err, 'Couldn’t promote this account. Try again.'));
    }
  };

  const alreadyMember = foundUser?.userType === 'MEMBER' || foundUser?.userType === 'STAFF';

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-5)' }}>
      <div>
        <h3 style={{ margin: '0 0 2px', fontSize: 'var(--av2-text-base)', fontWeight: 700 }}>Promote to Member</h3>
        <p style={{ margin: 0, fontSize: 'var(--av2-text-xs)', color: 'var(--av2-muted)' }}>
          Find a guest account by email and promote it to Member.
        </p>
      </div>

      {lookupState === 'idle' && (
        <div style={{ display: 'flex', gap: 'var(--av2-space-2)' }}>
          <input
            placeholder="guest@example.com"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...fieldStyle, flex: 1 }}
          />
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Search size={16} />}
            disabled={!isValidEmail || lookup.isPending}
            loading={lookup.isPending}
            onClick={runLookup}
          >
            Search
          </Button>
        </div>
      )}

      {lookupState === 'found' && foundUser && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--av2-space-2)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--av2-space-2)',
              padding: '10px 12px',
              borderRadius: 'var(--av2-radius-sm)',
              background: 'var(--av2-accent-soft)',
              border: '1px solid var(--av2-accent)',
              color: 'var(--av2-accent-hover)',
              fontSize: 'var(--av2-text-sm)',
            }}
          >
            <Check size={16} style={{ flex: 'none' }} />
            <span>
              <strong>{email}</strong>
              {foundUser.name ? ` — ${foundUser.name}` : ''}
              {' — '}
              {foundUser.phone ? `${foundUser.phone}, ` : 'no phone on file, '}
              currently {foundUser.userType === 'GUEST' ? 'a Guest' : foundUser.userType === 'STAFF' ? 'Staff' : 'a Member'}
            </span>
            <button type="button" onClick={reset} style={tryAnother('var(--av2-accent-hover)')}>
              try another
            </button>
          </div>

          {alreadyMember ? (
            <Banner tone="info">This account is already {foundUser.userType === 'STAFF' ? 'Staff' : 'a Member'} — nothing to promote.</Banner>
          ) : (
            <Button
              variant="primary"
              style={{ alignSelf: 'flex-start' }}
              leadingIcon={<UserPlus size={16} />}
              disabled={promote.isPending}
              loading={promote.isPending}
              onClick={runPromote}
            >
              Promote to Member
            </Button>
          )}
          {promoteError && <Banner tone="error">{promoteError}</Banner>}
        </div>
      )}

      {lookupState === 'not-found' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--av2-space-2)',
            padding: '10px 12px',
            borderRadius: 'var(--av2-radius-sm)',
            background: 'var(--av2-info-soft)',
            border: '1px solid var(--av2-info-border)',
            color: 'var(--av2-info-text)',
            fontSize: 'var(--av2-text-sm)',
          }}
        >
          <CircleAlert size={16} style={{ flex: 'none' }} />
          <span>
            <strong>{email}</strong> — no account found
          </span>
          <button type="button" onClick={reset} style={tryAnother('var(--av2-info-text)')}>
            try another
          </button>
        </div>
      )}

      {lookupError && <Banner tone="error">{lookupError}</Banner>}
    </Card>
  );
}
