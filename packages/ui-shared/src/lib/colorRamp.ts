/**
 * F-190 Slice 0: generates a 9-step OKLCH tonal ramp (100-900) from one arbitrary hex,
 * matching the shape of the Organic design system's hand-authored ramps in
 * `wireframe/Badminton Court Booking PWA/ds.css`.
 *
 * The curve below was not designed here — it was reverse-engineered from ds.css's real
 * neutral, accent, and accent-2 ramps (no theme.json shipped with exact parameters) and
 * verified by reconstructing the real --color-accent ramp from its own base (#c67139): every
 * one of the 9 steps reproduces to within 1/255 per channel.
 */

/** Steps 100->900. Fixed and shared across every ramp in ds.css (confirmed to ~0.002 across
 * its neutral/accent/accent-2 ramps) - this is what makes "the same step of any role match
 * the others in visual value" (ds.css's own comment) true. */
const RAMP_LIGHTNESS = [0.9698, 0.9302, 0.8696, 0.7802, 0.6802, 0.5796, 0.4791, 0.3801, 0.2896] as const;

/** Steps 100->900, as a fraction of the input color's own OKLCH chroma. Extracted from
 * ds.css's real --color-accent-* ramp (the one role this ramp shape was built to replicate). */
const RAMP_CHROMA_RATIO = [0.132, 0.314, 0.615, 0.963, 1.004, 0.958, 0.842, 0.651, 0.418] as const;

export const RAMP_STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type RampStep = (typeof RAMP_STEPS)[number];
export type ColorRamp = Record<RampStep, string>;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055;
}

/**
 * sRGB hex -> OKLCH. Exported so callers can inspect a colour's chroma (e.g. admin-v2's
 * accent-ramp guard skips near-neutral tenant brand colours — chroma < 0.02 — that would
 * otherwise generate a fully grey "accent" ramp).
 */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.sqrt(a * a + b2 * b2);
  let h = (Math.atan2(b2, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l: L, c, h };
}

function oklchToLinearSrgb(l: number, c: number, h: number): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const ll = l_ ** 3;
  const mm = m_ ** 3;
  const ss = s_ ** 3;

  const r = 4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss;
  const g = -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss;
  const b3 = -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss;

  return [r, g, b3];
}

const IN_GAMUT_EPS = 1e-4;
function inGamut([r, g, b]: [number, number, number]): boolean {
  return (
    r >= -IN_GAMUT_EPS && r <= 1 + IN_GAMUT_EPS &&
    g >= -IN_GAMUT_EPS && g <= 1 + IN_GAMUT_EPS &&
    b >= -IN_GAMUT_EPS && b <= 1 + IN_GAMUT_EPS
  );
}

/** OKLCH -> sRGB hex, reducing chroma via bisection until in-gamut. An arbitrary input hue/
 * chroma pair (unlike ds.css's own hand-picked, already-gamut-safe accent) can land outside
 * sRGB at these lightness/chroma combinations, so this clamp is required for correctness on
 * arbitrary tenant colors, not just a defensive extra. */
function oklchToHex(l: number, c: number, h: number): string {
  let candidate = oklchToLinearSrgb(l, c, h);
  if (!inGamut(candidate)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const attempt = oklchToLinearSrgb(l, mid, h);
      if (inGamut(attempt)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    candidate = oklchToLinearSrgb(l, lo, h);
  }

  const [r, g, b] = candidate.map((v) => Math.round(Math.max(0, Math.min(1, linearToSrgb(v))) * 255));
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Generates a 9-step (100-900) OKLCH tonal ramp from one arbitrary hex, matching ds.css's
 * ramp shape: a fixed shared lightness scale, chroma scaled off the input's own chroma via
 * ds.css's real accent-ramp ratio curve, and hue held constant. */
export function generateAccentRamp(hex: string): ColorRamp {
  const { c: baseChroma, h } = hexToOklch(hex);
  const ramp = {} as ColorRamp;
  RAMP_STEPS.forEach((step, i) => {
    ramp[step] = oklchToHex(RAMP_LIGHTNESS[i], baseChroma * RAMP_CHROMA_RATIO[i], h);
  });
  return ramp;
}
