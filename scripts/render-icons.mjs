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
// Keeping the constants here in one place means every icon can be re-cut from
// the same numbers — `pnpm icons` — if the mark or the accent ever moves.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Measured off the artwork; see DheeMark.tsx for where these come from.
const CENTRE = 220;
const R_IN = 102.6;
const R_OUT = 199.2;
const FIRST_ANGLE = 6.25;

// The light theme's `accent` and `bg` (src/lib/theme.ts). Accent because it is
// dark enough to hold on a white tab strip and light enough to still show on a
// dark one, where the app's `accentStrong` goes muddy.
const ACCENT = [0xba, 0x72, 0x44]; // oklch(0.62 0.11 52)
const PAPER = [0xfd, 0xfa, 0xf4]; // oklch(0.985 0.008 85)

// 8x8 samples a pixel: at 16px the strokes are thinner than a pixel, so the
// edges are nearly all the image and coverage has to be graded finely.
const SAMPLES = 8;

function rayLines(count) {
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
 * Rasterise one cut of the mark.
 *
 * `background` null leaves the paper transparent, which is what a favicon
 * wants — a tab strip is light or dark and the mark should sit on whichever.
 * A Home Screen icon is the opposite case: iOS composites any transparency
 * against black and then masks the corners itself, so those are rendered
 * opaque, on the app's own paper.
 */
function render({ size, rays, stroke, margin, background }) {
  const lines = rayLines(rays);
  const half = stroke / 2;
  // The caps carry the mark out to R_OUT + half; fit that inside the margin.
  const scale = (size * (1 - 2 * margin)) / (2 * (R_OUT + half));
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const ux = CENTRE + (x + (sx + 0.5) / SAMPLES - size / 2) / scale;
          const uy = CENTRE + (y + (sy + 0.5) / SAMPLES - size / 2) / scale;
          if (lines.some((line) => distance(ux, uy, line) <= half)) covered++;
        }
      }
      const alpha = covered / (SAMPLES * SAMPLES);
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[o + c] = background
          ? Math.round(ACCENT[c] * alpha + background[c] * (1 - alpha))
          : ACCENT[c];
      }
      pixels[o + 3] = background ? 255 : Math.round(255 * alpha);
    }
  }
  return { pixels, size };
}

// A minimal PNG writer: one uncompressed-filter IDAT of 8-bit RGBA. Deflate
// and CRC come from node, so this needs no dependency of its own.
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png({ pixels, size }) {
  const stride = size * 4;
  const raw = Buffer.alloc(size * (stride + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// The favicon cut is deliberately not the full mark. Forty hairline rays
// resolve to less than half a pixel each at favicon sizes and grey out into a
// doughnut, which is the same reason DheeMark drops to every other ray below
// 24px. This goes further and thickens the stroke as well: at 16px the ring
// has to read as a burst, not a smudge. 512 is big enough that Expo's
// downsamples to 48/32/16 have something to work with, and 2% of margin keeps
// the outer caps off the edge without shrinking the mark where it can least
// afford it.
const FAVICON = { rays: 20, stroke: 22, margin: 0.02, background: null };

// The Home Screen cut is the mark as the app itself draws it — forty rays at
// the source stroke — because at 180px and up they resolve properly. The
// margin is what makes it read as an icon rather than a cropped graphic: iOS
// masks the corners to a squircle and Android's maskable spec reserves
// everything outside the central 80%, so the burst sits in the middle 64% and
// clears both.
const HOME_SCREEN = {
  rays: 40,
  stroke: 10.05,
  margin: 0.18,
  background: PAPER,
};

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
  writeFileSync(out, png(render(cut)));
  console.log(`${path.join("/")} (${cut.size}x${cut.size}, ${cut.rays} rays)`);
}
