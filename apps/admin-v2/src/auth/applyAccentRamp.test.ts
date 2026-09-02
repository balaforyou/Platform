import { describe, expect, it } from 'vitest';
import { RAMP_STEPS } from '@badminton/ui-shared';
import { computeAccentRampVars } from './applyAccentRamp';

const STEP_KEYS = RAMP_STEPS.map((s) => `--av2-accent-${s}`);

describe('computeAccentRampVars', () => {
  it('produces all 9 --av2-accent-N entries for a real brand colour', () => {
    const vars = computeAccentRampVars('#166534'); // JBC's real themeColor
    expect(Object.keys(vars).sort()).toEqual([...STEP_KEYS].sort());
    for (const v of Object.values(vars)) {
      expect(v).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('is genuinely tenant-driven — two different hexes differ at every step', () => {
    const jbc = computeAccentRampVars('#166534');
    const other = computeAccentRampVars('#3b5bdb'); // a synthetic blue
    for (const key of STEP_KEYS) {
      expect(jbc[key]).not.toBe(other[key]);
    }
  });

  describe('guard — returns {} rather than a grey ramp', () => {
    it('rejects pure black (schema default #000000)', () => {
      expect(computeAccentRampVars('#000000')).toEqual({});
    });

    it('rejects pure white and a near-neutral grey', () => {
      expect(computeAccentRampVars('#ffffff')).toEqual({});
      expect(computeAccentRampVars('#7a7a7a')).toEqual({});
    });

    it('rejects malformed input', () => {
      expect(computeAccentRampVars('not-a-color')).toEqual({});
      expect(computeAccentRampVars('#abc')).toEqual({}); // shorthand hex, unsupported
      expect(computeAccentRampVars('166534')).toEqual({}); // missing #
    });

    it('rejects missing input', () => {
      expect(computeAccentRampVars(null)).toEqual({});
      expect(computeAccentRampVars(undefined)).toEqual({});
      expect(computeAccentRampVars('')).toEqual({});
    });
  });
});
