// The Dhee mark, rasterised. The geometry belongs to
// src/components/ui/DheeMark.tsx, where it is measured off the source artwork
// (a 440x440 animated PNG) — these are the same numbers, kept here so the
// images this repo generates can be re-cut from them if the mark ever moves.
//
// Vectors everywhere else, pixels here, because both consumers need a raster:
// Expo's favicon step falls back to jimp without a global `sharp` and cannot
// read SVG, and a link-preview crawler will not run an SVG through a layout
// engine either.

const CENTRE = 220;
const R_IN = 102.6;
const R_OUT = 199.2;
const FIRST_ANGLE = 6.25;

/** Ray endpoints in mark units, evenly spaced from the artwork's ~6deg offset. */
function rays(count) {
  const step = 360 / count;
  return Array.from({ length: count }, (_, i) => {
    const a = ((FIRST_ANGLE + i * step) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return [
      CENTRE + R_IN * cos,
      CENTRE + R_IN * sin,
      CENTRE + R_OUT * cos,
      CENTRE + R_OUT * sin,
    ];
  });
}

/** Distance from a point to a segment — a round-capped stroke is every point within half its width. */
function distance(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * A supersampled coverage function for the mark, drawn `diameter` device
 * pixels cap to cap and centred on (cx, cy).
 *
 * `bounds` is the half-open pixel rectangle the mark can touch. Everything
 * outside it is ground, so a caller filling a large canvas can skip it rather
 * than sample a million pixels that were never going to be covered.
 */
export function markCoverage({
  rays: count,
  stroke,
  diameter,
  cx,
  cy,
  samples,
}) {
  const lines = rays(count);
  const half = stroke / 2;
  // The caps carry the mark out to R_OUT + half; that is what `diameter` spans.
  const scale = diameter / (2 * (R_OUT + half));

  return {
    bounds: {
      x0: Math.floor(cx - diameter / 2),
      y0: Math.floor(cy - diameter / 2),
      x1: Math.ceil(cx + diameter / 2),
      y1: Math.ceil(cy + diameter / 2),
    },
    /** Fraction of pixel (x, y) the mark covers, 0..1. */
    coverage(x, y) {
      let covered = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const ux = CENTRE + (x + (sx + 0.5) / samples - cx) / scale;
          const uy = CENTRE + (y + (sy + 0.5) / samples - cy) / scale;
          if (lines.some((line) => distance(ux, uy, line) <= half)) covered++;
        }
      }
      return covered / (samples * samples);
    },
  };
}
