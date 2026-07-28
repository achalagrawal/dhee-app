// Renders the Dhee mark into assets/favicon.png, the source Expo turns into
// dist/favicon.ico (16, 32 and 48px) during `expo export -p web`.
//
// Why a raster at all, when the mark is vectors everywhere else: Expo's
// favicon step runs the source through @expo/image-utils, which only reads SVG
// when a global `sharp` is installed and otherwise falls back to jimp. The
// Vercel build has no sharp, so an SVG source would fail there. A PNG is read
// by both.
//
// Why a script rather than a hand-drawn file: the geometry belongs to
// src/components/ui/DheeMark.tsx, where it is measured off the source artwork.
// Keeping the cut here means the favicon can be re-cut — `pnpm favicon` — if
// the mark or the accent ever moves. The card at scripts/render-og.mjs is cut
// from the same numbers.
//
// The cut is deliberately not the full mark. Forty hairline rays resolve to
// less than half a pixel each at favicon sizes and grey out into a doughnut,
// which is the same reason DheeMark drops to every other ray below 24px. This
// goes further and thickens the stroke as well: at 16px the ring has to read
// as a burst, not a smudge. Colour is the light theme's `accent` — dark enough
// to hold on a white tab strip, light enough to still show on a dark one,
// where the app's `accentStrong` goes muddy.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { markCoverage } from "./lib/mark.mjs";
import { encodePng } from "./lib/png.mjs";

// The favicon cut.
const RAYS = 20;
const STROKE = 22;
const COLOUR = [0xba, 0x72, 0x44]; // light `accent`, oklch(0.62 0.11 52)

// Big enough that Expo's downsamples to 48/32/16 have something to work with,
// and a size the file is worth opening at. 2% of margin keeps the outer caps
// off the edge without shrinking the mark where it can least afford it.
const SIZE = 512;
const MARGIN = 0.02;

// 8x8 samples a pixel: at 16px the strokes are thinner than a pixel, so the
// edges are nearly all the image and coverage has to be graded finely.
const SAMPLES = 8;

function render() {
  const mark = markCoverage({
    rays: RAYS,
    stroke: STROKE,
    diameter: SIZE * (1 - 2 * MARGIN),
    cx: SIZE / 2,
    cy: SIZE / 2,
    samples: SAMPLES,
  });
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = (y * SIZE + x) * 4;
      pixels[o] = COLOUR[0];
      pixels[o + 1] = COLOUR[1];
      pixels[o + 2] = COLOUR[2];
      pixels[o + 3] = Math.round(255 * mark.coverage(x, y));
    }
  }
  return pixels;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "assets", "favicon.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePng(render(), SIZE, SIZE));
console.log(`Wrote ${out} (${SIZE}x${SIZE}, ${RAYS} rays)`);
