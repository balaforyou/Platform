import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  branchDayBounds,
  branchLocalDate,
  initialBranch,
  isCalendarDate,
  perBranchDates,
  readRememberedBranch,
  resolveDate,
  switcherModel,
  writeRememberedBranch,
} from './branchDate';

const KOLKATA = 'Asia/Kolkata'; // UTC+5:30, no DST (JBC)
const UTC = 'UTC'; // courtowner1

describe('branchLocalDate - the F-335/F-336/F-339 class', () => {
  it('between 18:30 and 24:00 UTC a Kolkata branch is already on the NEXT day', () => {
    const instant = new Date('2026-10-12T20:00:00Z');
    expect(branchLocalDate(instant, UTC)).toBe('2026-10-12');
    expect(branchLocalDate(instant, KOLKATA)).toBe('2026-10-13');
  });
  it('a zone west of UTC is on the PREVIOUS day shortly after UTC midnight', () => {
    expect(branchLocalDate(new Date('2026-10-13T03:00:00Z'), 'America/Los_Angeles')).toBe('2026-10-12');
  });
  it('a bad or missing zone falls back to UTC instead of throwing', () => {
    expect(branchLocalDate(new Date('2026-10-12T20:00:00Z'), 'Not/AZone')).toBe('2026-10-12');
    expect(branchLocalDate(new Date('2026-10-12T20:00:00Z'), undefined)).toBe('2026-10-12');
  });
});

describe('branchDayBounds - one calendar date, each branch in its own zone ("All" rule)', () => {
  it('Kolkata day 2026-10-12 starts at 2026-10-11T18:30Z; UTC day starts at 2026-10-12T00:00Z', () => {
    const k = branchDayBounds('2026-10-12', KOLKATA);
    const u = branchDayBounds('2026-10-12', UTC);
    expect(k.start.toISOString()).toBe('2026-10-11T18:30:00.000Z');
    expect(k.end.toISOString()).toBe('2026-10-12T18:30:00.000Z');
    expect(u.start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(u.end.toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });
  it('is DST-correct (a 23-hour spring-forward day in New York)', () => {
    const ny = branchDayBounds('2026-03-08', 'America/New_York');
    expect((ny.end.getTime() - ny.start.getTime()) / 3600000).toBe(23);
  });
});

describe('"All" with branches in different zones', () => {
  const branches = [
    { id: 'jbc', timezone: KOLKATA },
    { id: 'co1', timezone: UTC },
  ];
  it('an explicit date is the SAME calendar date for both but a different UTC interval each', () => {
    const r = perBranchDates('2026-10-12', branches, new Date('2026-10-12T20:00:00Z'));
    expect(r.jbc.date).toBe('2026-10-12');
    expect(r.co1.date).toBe('2026-10-12');
    expect(r.jbc.start.getTime()).not.toBe(r.co1.start.getTime());
    expect(r.jbc.start.toISOString()).toBe('2026-10-11T18:30:00.000Z');
  });
  it('with no explicit date each branch uses ITS OWN today (they differ at 20:00Z)', () => {
    const r = perBranchDates(null, branches, new Date('2026-10-12T20:00:00Z'));
    expect(r.jbc.date).toBe('2026-10-13');
    expect(r.co1.date).toBe('2026-10-12');
  });
  it('resolveDate: explicit wins; otherwise the selected branch\'s today', () => {
    const now = new Date('2026-10-12T20:00:00Z');
    expect(resolveDate('2026-11-01', 'jbc', branches, now)).toBe('2026-11-01');
    expect(resolveDate(null, 'jbc', branches, now)).toBe('2026-10-13');
    expect(resolveDate(null, 'co1', branches, now)).toBe('2026-10-12');
    expect(resolveDate('garbage', 'co1', branches, now)).toBe('2026-10-12');
  });
});

describe('isCalendarDate', () => {
  it('accepts real dates only', () => {
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('26-1-1')).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
  });
});

describe('remembered branch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('initialBranch re-validates: a remembered branch the user can no longer see falls back', () => {
    const allowed = [{ id: 'a' }, { id: 'b' }];
    expect(initialBranch('b', allowed)).toBe('b');
    expect(initialBranch('gone', allowed)).toBe('a');
    expect(initialBranch(null, allowed)).toBe('a');
    expect(initialBranch(null, [])).toBe('');
  });

  it('a throwing localStorage never breaks reads or writes', () => {
    const boom = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('window', { localStorage: { getItem: boom, setItem: boom } });
    expect(readRememberedBranch('u1')).toBeNull();
    expect(() => writeRememberedBranch('u1', 'b')).not.toThrow();
  });

  it('round-trips when storage works, per user', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    });
    writeRememberedBranch('u1', 'b');
    expect(readRememberedBranch('u1')).toBe('b');
    expect(readRememberedBranch('u2')).toBeNull();
  });
});

describe('switcherModel', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Branch ${i}` }));
  it('hidden for a single branch (a one-branch manager) and for none', () => {
    expect(switcherModel(mk(1), false).kind).toBe('hidden');
    expect(switcherModel(mk(1), true).kind).toBe('hidden');
    expect(switcherModel(mk(0), false).kind).toBe('hidden');
  });
  it('segmented up to 4 branches, dropdown beyond', () => {
    expect(switcherModel(mk(2), false).kind).toBe('segmented');
    expect(switcherModel(mk(4), false).kind).toBe('segmented');
    expect(switcherModel(mk(5), false).kind).toBe('dropdown');
  });
  it('"All" is offered only when the screen supports it, first, and only with 2+ branches', () => {
    expect(switcherModel(mk(2), false).options.map((o) => o.id)).toEqual(['b0', 'b1']);
    expect(switcherModel(mk(2), true).options.map((o) => o.id)).toEqual(['all', 'b0', 'b1']);
  });
});
