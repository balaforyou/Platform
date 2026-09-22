import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Sun, Moon, Monitor, LogOut, X } from 'lucide-react';
import { useAuth } from '@badminton/ui-shared';
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from '../../lib/theme';
import Avatar from './Avatar';
import './AccountSheet.css';

export interface AccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ThemeChoice = Theme | 'system';

// F-235 Phase 0: theme toggle placement decision (claude/guestPWA2/05-*.md §2.3) -- a 3-way
// Light/Dark/System segmented control inside this sheet, opened from the Home header's avatar
// circle, rather than a header toggle like admin-v2's (guest-pwa has bottom-nav chrome, not
// header chrome). Also carries the logout button, moved here from Layout()'s current header.
export default function AccountSheet({ open, onOpenChange }: AccountSheetProps) {
  const { user, logout } = useAuth();
  const [choice, setChoice] = useState<ThemeChoice>(() => getStoredTheme() ?? 'system');

  const handleChoice = (next: ThemeChoice) => {
    setChoice(next);
    const stored = next === 'system' ? null : next;
    setStoredTheme(stored);
    applyTheme(stored);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="gpwa-account-sheet__overlay" />
        <Dialog.Content className="gpwa-account-sheet__content">
          <div className="gpwa-account-sheet__header">
            <Dialog.Title className="gpwa-account-sheet__title">Account</Dialog.Title>
            <Dialog.Close asChild>
              <button className="gpwa-account-sheet__close" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* F-248: two real bugs, same root cause, same file -- the avatar never existed at
              all, and this name line read `user.name` (F-229's admin-typed walk-in field),
              never `user.displayName` (F-219/this fix's real Google field). A Google-signed-in
              guest saw their email here today, not their real name. */}
          <div className="gpwa-account-sheet__user" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Avatar src={user?.photoUrl} name={user?.displayName || user?.name || user?.email || 'Guest'} size={44} />
            <div>
              <p className="gpwa-account-sheet__user-name">{user?.displayName || user?.name || user?.email || 'Guest'}</p>
              {user?.email && <p className="gpwa-account-sheet__user-email">{user.email}</p>}
            </div>
          </div>

          {/* F-235 Slice E: real content, moved here from MainDashboard's "Profile Details" card --
              the real mockup's Home/Dashboard artboard has no place for this in its bookings-list
              body, but does have this exact header avatar as its own account-menu entry point
              (confirmed against the canvas: a 42px circular avatar badge opening an account
              surface), so this is the real, already-built landing spot for it. */}
          <div className="gpwa-account-sheet__section-label">Profile</div>
          <div className="gpwa-account-sheet__profile">
            <div className="gpwa-account-sheet__profile-row">
              <span>Phone</span>
              <span className="gpwa-account-sheet__profile-value">{user?.phone || 'Phone not available'}</span>
            </div>
            <div className="gpwa-account-sheet__profile-row">
              <span>Account type</span>
              <span className="gpwa-account-sheet__profile-value gpwa-account-sheet__profile-value--accent">
                {/* F-278: this used to read user?.roles?.[0] -- roles is the admin-role array
                    (owner/branch_manager:*), always empty for a consumer-facing guest/member, so
                    it silently fell back to the literal string 'member' for every ordinary user
                    regardless of their real type. userType ('GUEST' | 'MEMBER') is the real
                    consumer-facing field -- already read in five places in main.tsx for the same
                    gating purpose. Title-cased for display, matching this screen's existing
                    natural-case values (the name/phone rows above are never all-caps). */}
                {user?.userType === 'MEMBER' ? 'Member' : 'Guest'}
              </span>
            </div>
          </div>

          <div className="gpwa-account-sheet__section-label">Appearance</div>
          <div className="gpwa-account-sheet__segmented" role="radiogroup" aria-label="Theme">
            {(
              [
                { value: 'light' as const, label: 'Light', Icon: Sun },
                { value: 'dark' as const, label: 'Dark', Icon: Moon },
                { value: 'system' as const, label: 'System', Icon: Monitor },
              ]
            ).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={choice === value}
                data-active={choice === value}
                className="gpwa-account-sheet__segment"
                onClick={() => handleChoice(value)}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <button type="button" id="logout-btn" onClick={() => logout()} className="gpwa-account-sheet__logout">
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
