import { generateAccentRamp, hexToOklch, RAMP_STEPS } from '@badminton/ui-shared';

/**
 * Sub-slice 0.1 — Layer 1 of the token system: turn a tenant's `themeColor` into
 * the `--av2-accent-100..900` custom properties `styles.css`'s semantic tokens alias.
 *
 * Split into a pure part (`computeAccentRampVars`, unit-tested) and a thin DOM writer
 * (`applyAccentRampVars` / `clearAccentRampVars`, covered by the real-browser pass, not
 * vitest — matching the existing `vitest.config.ts` note).
 */

/** Exactly `#rrggbb`. `generateAccentRamp` only parses this shape. */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * OKLCH chroma below which a colour is treated as neutral (grey/black/white) and NOT
 * themed — `Tenant.themeColor`'s schema default is `#000000`, which would otherwise
 * generate a fully desaturated "accent" ramp. 0.02 sits well under real brand-colour
 * chroma, including deliberately muted corporate palettes, so it won't false-trigger.
 */
const MIN_CHROMA = 0.02;

/**
 * Pure. `themeColor` -> the 9 `--av2-accent-N` entries, or `{}` when the colour is
 * missing, malformed, or near-neutral. An empty map means "apply nothing" — the
 * Layer-2 `var(--av2-accent-N, <fixed>)` fallbacks then resolve exactly as pre-fetch.
 */
export function computeAccentRampVars(hex: string | null | undefined): Record<string, string> {
  if (!hex || !HEX_RE.test(hex)) return {};
  if (hexToOklch(hex).c < MIN_CHROMA) return {};

  const ramp = generateAccentRamp(hex);
  const vars: Record<string, string> = {};
  for (const step of RAMP_STEPS) {
    vars[`--av2-accent-${step}`] = ramp[step];
  }
  return vars;
}

/** Writes each entry onto `target` (default `:root`). No-op for an empty map. */
export function applyAccentRampVars(
  vars: Record<string, string>,
  target: HTMLElement = document.documentElement,
): void {
  for (const [name, value] of Object.entries(vars)) {
    target.style.setProperty(name, value);
  }
}

/**
 * Removes every `--av2-accent-N` from `target` so the Layer-2 fallbacks take over again.
 * Called on sign-out / tenant change — the login screen is deliberately fixed-brand, so a
 * previous tenant's accent must not linger on `:root`.
 */
export function clearAccentRampVars(target: HTMLElement = document.documentElement): void {
  for (const step of RAMP_STEPS) {
    target.style.removeProperty(`--av2-accent-${step}`);
  }
}
