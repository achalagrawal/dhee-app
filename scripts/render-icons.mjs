// Renders the Dhee mark into every raster the web build needs:
//
//   assets/favicon.png       the source Expo turns into dist/favicon.ico
//                            (16, 32 and 48px) during `expo export -p web`
//   public/icon-180.png      apple-touch-icon — the Home Screen icon iOS uses
//   public/icon-192.png      the web manifest's icons, for Android and for
//   public/icon-512.png      iOS 17.4+, which reads the manifest too
//
// Why a raster at all, when the mark is vectors everywhere else: Expo's
// favicon step runs the source through @expo/image-utils, which only reads SVG
// when a global `sharp` is installed and otherwise falls back to jimp. The
// Vercel build has no sharp, so an SVG source would fail there. A PNG is read
// by both — and Home Screen icons have to be PNG regardless.
//
// Why a script rather than hand-drawn files: the geometry belongs to
// src/components/ui/DheeMark.tsx, where it is measured off the source artwork.
// Keeping the cuts here means every icon can be re-cut from the same numbers —
// `pnpm icons` — if the mark or the accent ever moves. The card at
// scripts/render-og.mjs is cut from those numbers too.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { markCoverage } from "./lib/mark.mjs";
import { encodePng } from "./lib/png.mjs";

// The light theme's `accent` and `bg` (src/lib/theme.ts). Accent because it is
// dark enough to hold on a white tab strip and light enough to still show on a
// dark one, where the app's `accentStrong` goes muddy.
const ACCENT = [0xba, 0x72, 0x44]; // oklch(0.62 0.11 52)
const PAPER = [0xfd, 0xfa, 0xf4]; // oklch(0.985 0.008 85)

// 8x8 samples a pixel: at 16px the strokes are thinner than a pixel, so the
// edges are nearly all the image and coverage has to be graded finely.
const SAMPLES = 8;

// The favicon cut is deliberately not the full mark. Forty hairline rays
// resolve to less than half a pixel each at favicon sizes and grey out into a
// doughnut, which is the same reason DheeMark drops to every other ray below
// 24px. This goes further and thickens the stroke as well: at 16px the ring
// has to read as a burst, not a smudge. 512 is big enough that Expo's
// downsamples to 48/32/16 have something to work with, and 2% of margin keeps
// the outer caps off the edge without shrinking the mark where it can least
// afford it.
//
// `ground` null leaves the paper transparent, which is what a favicon wants: a
// tab strip is light or dark and the mark should sit on whichever.
const FAVICON = { rays: 20, stroke: 22, margin: 0.02, ground: null };

// The Home Screen cut is the mark as the app itself draws it — forty rays at
// the source stroke — because at 180px and up they resolve properly. The
// margin is what makes it read as an icon rather than a cropped graphic: iOS
// masks the corners to a squircle and Android's maskable spec reserves
// everything outside the central 80%, so the burst sits in the middle 64% and
// clears both. Opaque, because iOS composites any transparency against black.
const HOME_SCREEN = { rays: 40, stroke: 10.05, margin: 0.18, ground: PAPER };

function render({ size, rays, stroke, margin, ground }) {
  const mark = markCoverage({
    rays,
    stroke,
    diameter: size * (1 - 2 * margin),
    cx: size / 2,
    cy: size / 2,
    samples: SAMPLES,
  });

  // Ground first, across the whole canvas, so the margin outside the mark's
  // box is already right: paper at full alpha for an opaque cut, and accent at
  // zero alpha for a transparent one — RGB still accent there so a viewer that
  // ignores alpha does not fringe the caps against black.
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    pixels[o] = ground ? ground[0] : ACCENT[0];
    pixels[o + 1] = ground ? ground[1] : ACCENT[1];
    pixels[o + 2] = ground ? ground[2] : ACCENT[2];
    pixels[o + 3] = ground ? 0xff : 0;
  }

  // Only the mark's own box can be covered; sampling the margin would be
  // answered in advance.
  const { x0, y0, x1, y1 } = mark.bounds;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const a = mark.coverage(x, y);
      const o = (y * size + x) * 4;
      if (a === 0) continue;
      if (ground) {
        for (let c = 0; c < 3; c++) {
          pixels[o + c] = Math.round(ground[c] + (ACCENT[c] - ground[c]) * a);
        }
      } else {
        pixels[o + 3] = Math.round(255 * a);
      }
    }
  }
  return pixels;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const OUTPUTS = [
  { path: ["assets", "favicon.png"], size: 512, ...FAVICON },
  { path: ["public", "icon-180.png"], size: 180, ...HOME_SCREEN },
  { path: ["public", "icon-192.png"], size: 192, ...HOME_SCREEN },
  { path: ["public", "icon-512.png"], size: 512, ...HOME_SCREEN },
];

for (const { path, ...cut } of OUTPUTS) {
  const out = join(root, ...path);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(render(cut), cut.size, cut.size));
  console.log(`${path.join("/")} (${cut.size}x${cut.size}, ${cut.rays} rays)`);
}
