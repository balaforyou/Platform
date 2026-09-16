import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, MapPin, Clock } from 'lucide-react';
import { apiRequest, useAuth, useTenant } from '@badminton/ui-shared';
import LoadingState from './ui/LoadingState';
import './VenueSwitcherSheet.css';

export interface Branch {
  id: string;
  name: string;
  address?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
}

interface VenueSwitcherSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedBranchId: string | null;
  onSelect: (branch: Branch) => void;
}

// F-235 Slice A: real branch list, ported from BranchSelect.tsx (orphaned since Phase 0's route
// collapse) -- same fetch, same real fields, same #branch-card-<id> id for Playwright. Bottom-
// sheet shell cloned from AccountSheet.tsx, per the handover's explicit instruction (not
// ConfirmDialog -- this is browse/select, not confirm-then-commit).
export default function VenueSwitcherSheet({ open, onOpenChange, selectedBranchId, onSelect }: VenueSwitcherSheetProps) {
  const { tenant } = useTenant();
  const { accessToken } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !tenant) return;
    setLoading(true);
    apiRequest<Branch[]>(`/tenant/tenants/${tenant.id}/branches`, { token: accessToken })
      .then((res) => setBranches(res || []))
      .catch(() => setBranches([]))
      .finally(() => setLoading(false));
  }, [open, tenant, accessToken]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="gpwa-venue-sheet__overlay" />
        <Dialog.Content className="gpwa-venue-sheet__content">
          <div className="gpwa-venue-sheet__header">
            <Dialog.Title className="gpwa-venue-sheet__title">Choose a venue</Dialog.Title>
            <Dialog.Close asChild>
              <button className="gpwa-venue-sheet__close" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="gpwa-venue-sheet__body">
            {loading ? (
              <LoadingState variant="compact" label="Loading venues…" />
            ) : branches.length === 0 ? (
              <p style={{ fontFamily: 'var(--font-body-organic)', fontSize: '13px', color: 'var(--color-neutral-600)', textAlign: 'center', padding: '24px 0' }}>
                No venues available right now.
              </p>
            ) : (
              branches.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  id={`branch-card-${branch.id}`}
                  className="gpwa-venue-sheet__branch-card"
                  data-active={branch.id === selectedBranchId}
                  onClick={() => onSelect(branch)}
                >
                  <span className="gpwa-venue-sheet__branch-name">{branch.name}</span>
                  {branch.address && (
                    <span className="gpwa-venue-sheet__branch-meta">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {branch.address}
                    </span>
                  )}
                  {branch.workingHoursStart && branch.workingHoursEnd && (
                    <span className="gpwa-venue-sheet__branch-meta">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      Open {branch.workingHoursStart} – {branch.workingHoursEnd}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
