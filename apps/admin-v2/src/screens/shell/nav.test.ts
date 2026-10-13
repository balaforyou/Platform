import { describe, it, expect } from 'vitest';
import { NAV_DESTINATIONS, OVERFLOW_DESTINATIONS, filterByEntitlement, filterByRole } from './nav';

const keys = (ds: { key: string }[]) => ds.map((d) => d.key);

describe('filterByRole (S1, UI-only)', () => {
  it('owner sees everything', () => {
    expect(keys(filterByRole(NAV_DESTINATIONS, 'owner'))).toEqual(keys(NAV_DESTINATIONS));
  });

  it('manager does not see the owner-only entries, and keeps the daily tasks', () => {
    const k = keys(filterByRole(NAV_DESTINATIONS, 'manager'));
    expect(k).not.toContain('communications');
    expect(k).not.toContain('branch-settings');
    expect(k).not.toContain('court-groups');
    for (const daily of ['dashboard', 'ledger', 'inventory', 'walk-in', 'members', 'guests']) {
      expect(k).toContain(daily);
    }
  });

  it('role "none" is not filtered (today\'s behaviour is preserved)', () => {
    expect(keys(filterByRole(NAV_DESTINATIONS, 'none'))).toEqual(keys(NAV_DESTINATIONS));
  });

  it('composes with the entitlement filter in either order', () => {
    const noMembers = { GUEST_BOOKING: 'ACTIVE', MEMBER_MANAGEMENT: 'NO_ROW' } as never;
    const a = keys(filterByRole(filterByEntitlement(NAV_DESTINATIONS, noMembers), 'manager'));
    const b = keys(filterByEntitlement(filterByRole(NAV_DESTINATIONS, 'manager'), noMembers));
    expect(a).toEqual(b);
    expect(a).not.toContain('members');
    expect(a).toContain('walk-in');
  });

  it('walk-in is a mobile bottom-nav entry; owner tools are behind Apps (overflow)', () => {
    expect(NAV_DESTINATIONS.find((d) => d.key === 'walk-in')?.mobileDirect).toBe(true);
    const overflow = keys(OVERFLOW_DESTINATIONS);
    expect(overflow).toContain('communications');
    expect(overflow).toContain('branch-settings');
  });

  it('no destination offers "All" branches in S1 (nothing is faked)', () => {
    expect(NAV_DESTINATIONS.some((d) => d.supportsAllBranches)).toBe(false);
  });
});
