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
// Keeping the constants here in one place means the favicon can be re-cut from
// the same numbers — `pnpm favicon` — if the mark or the accent ever moves.
//
// The cut is deliberately not the full mark. Forty hairline rays resolve to
// less than half a pixel each at favicon sizes and grey out into a doughnut,
// which is the same reason DheeMark drops to every other ray below 24px. This
// goes further and thickens the stroke as well: at 16px the ring has to read
// as a burst, not a smudge. Colour is the light theme's `accent` — dark enough
// to hold on a white tab strip, light enough to still show on a dark one,
// where the app's `accentStrong` goes muddy.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Measured off the artwork; see DheeMark.tsx for where these come from.
const CENTRE = 220;
const R_IN = 102.6;
const R_OUT = 199.2;
const FIRST_ANGLE = 6.25;

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

function rays() {
  const step = 360 / RAYS;
  return Array.from({ length: RAYS }, (_, i) => {
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

function render() {
  const lines = rays();
  const half = STROKE / 2;
  // The caps carry the mark out to R_OUT + half; fit that inside the margin.
  const scale = (SIZE * (1 - 2 * MARGIN)) / (2 * (R_OUT + half));
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const ux = CENTRE + (x + (sx + 0.5) / SAMPLES - SIZE / 2) / scale;
          const uy = CENTRE + (y + (sy + 0.5) / SAMPLES - SIZE / 2) / scale;
          if (lines.some((line) => distance(ux, uy, line) <= half)) covered++;
        }
      }
      const o = (y * SIZE + x) * 4;
      pixels[o] = COLOUR[0];
      pixels[o + 1] = COLOUR[1];
      pixels[o + 2] = COLOUR[2];
      pixels[o + 3] = Math.round((255 * covered) / (SAMPLES * SAMPLES));
    }
  }
  return pixels;
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

function png(pixels) {
  const stride = SIZE * 4;
  const raw = Buffer.alloc(SIZE * (stride + 1));
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "assets", "favicon.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png(render()));
console.log(`Wrote ${out} (${SIZE}x${SIZE}, ${RAYS} rays)`);
