import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAdminAuth } from '../../auth/AdminAuthContext';
import { useBranches } from '../guestManagement/queries';
import type { Branch } from '../guestManagement/types';
import {
  initialBranch,
  readRememberedBranch,
  resolveDate,
  safeTimeZone,
  writeRememberedBranch,
} from '../../lib/branchDate';

/**
 * S1: the ONE branch and date every branch-scoped screen reads (replaces seven screens' own
 * `useState('')` branch state). Role scoping comes from `useBranches()` (owners get every
 * branch, a manager only theirs), so the allowed list is already correct here.
 *
 * - `branchId` is always a CONCRETE branch id (or '' while loading / when the user has none).
 *   "All" is a selection, never a branch id: a screen that cannot show several branches keeps
 *   the last concrete one. No screen supports "All" in S1 (a real roll-up is S2's Today), so the
 *   switcher never offers it yet.
 * - `date` is a calendar date (`YYYY-MM-DD`). With no explicit pick it is "today" in the
 *   selected branch's OWN time zone, not the browser's or UTC.
 * - The last concrete branch is remembered per user in localStorage (every access wrapped in
 *   try/catch; the app is correct without it).
 */
interface BranchDateValue {
  branches: Branch[];
  loading: boolean;
  error: unknown;
  /** 'all' | a branch id | '' (nothing yet). */
  selection: string;
  /** Concrete branch id, or ''. */
  branchId: string;
  branch: Branch | undefined;
  timeZone: string;
  date: string;
  /** Branch-local today (the floor for date pickers). */
  today: string;
  setSelection: (selection: string) => void;
  setDate: (date: string | null) => void;
}

const BranchDateContext = createContext<BranchDateValue | null>(null);

export function BranchDateProvider({ children }: { children: ReactNode }) {
  const { user } = useAdminAuth();
  const query = useBranches();
  const branches = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [query.data],
  );

  const [selection, setSelectionState] = useState('');
  const [lastBranch, setLastBranch] = useState('');
  const [explicitDate, setExplicitDate] = useState<string | null>(null);

  // Pick the initial branch once the (role-scoped) list is known, and re-validate if it changes
  // (a remembered or selected branch the user can no longer see falls back).
  useEffect(() => {
    if (branches.length === 0) return;
    const stillValid = selection === 'all' || branches.some((b) => b.id === selection);
    if (selection && stillValid) return;
    const first = initialBranch(readRememberedBranch(user?.userId), branches);
    setSelectionState(first);
    setLastBranch(first);
  }, [branches, selection, user?.userId]);

  const setSelection = useCallback(
    (next: string) => {
      setSelectionState(next);
      if (next && next !== 'all') {
        setLastBranch(next);
        writeRememberedBranch(user?.userId, next);
      }
    },
    [user?.userId],
  );

  const branchId = selection === 'all' ? lastBranch : selection;
  const branch = branches.find((b) => b.id === branchId);
  const timeZone = safeTimeZone(branch?.timezone);
  const now = new Date();
  const today = resolveDate(null, branchId, branches, now);
  const date = resolveDate(explicitDate, branchId, branches, now);

  const value: BranchDateValue = {
    branches,
    loading: query.isLoading,
    error: query.error,
    selection,
    branchId,
    branch,
    timeZone,
    date,
    today,
    setSelection,
    setDate: setExplicitDate,
  };
  return <BranchDateContext.Provider value={value}>{children}</BranchDateContext.Provider>;
}

export function useBranchDate(): BranchDateValue {
  const ctx = useContext(BranchDateContext);
  if (!ctx) throw new Error('useBranchDate must be used inside <BranchDateProvider> (the AppShell mounts it)');
  return ctx;
}
