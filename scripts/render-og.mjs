// Renders public/og.png, the image WhatsApp, Slack, iMessage and the rest show
// beside a link to the site. Run by `pnpm build:web`, because public/ is
// generated rather than committed (see .gitignore) — the same reason the legal
// pages are built there.
//
// Why an image at all when the mark is vectors: a link-preview crawler fetches
// the URL, reads the HTML, and downloads whatever `og:image` points at. It
// runs no JavaScript and lays out no SVG, so the card has to already exist as
// pixels at a fixed URL.
//
// The cut is the full forty-ray mark on the light theme's ground. No wordmark:
// every crawler renders `og:title` as text directly beside the image, so a
// second copy of the name inside the image is a thing to keep in sync for no
// gain — and rasterising type here would mean a font dependency the Vercel
// build does not have.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { markCoverage } from "./lib/mark.mjs";
import { encodePng } from "./lib/png.mjs";

// 1200x630 is the size that earns the large card rather than a thumbnail
// beside the text; below roughly 300x200 every crawler drops to the small
// treatment, and the 1.91:1 ratio is what they crop to when they crop.
const WIDTH = 1200;
const HEIGHT = 630;

// The full mark, as DheeMark draws it above 24px.
const RAYS = 40;
const STROKE = 10.05;

// Mirrors src/lib/theme.ts: light `bg` under light `accent`. Light rather than
// dark because the card is shown against a chat bubble, and every one of those
// is closer to paper than to ink.
const GROUND = [0xfd, 0xfa, 0xf4]; // light `bg`, oklch(0.985 0.008 85)
const COLOUR = [0xba, 0x72, 0x44]; // light `accent`, oklch(0.62 0.11 52)

// Just over half the height: big enough to read at the ~200px wide a phone
// actually shows the card at, with enough ground left that the burst sits in
// the card rather than filling it.
const MARK = 340;

// 4x4 a pixel. The strokes land about 8px wide here — two orders off the
// favicon's problem, where they were thinner than the pixel grid — so the
// edges need smoothing, not rescuing.
const SAMPLES = 4;

function render() {
  const mark = markCoverage({
    rays: RAYS,
    stroke: STROKE,
    diameter: MARK,
    cx: WIDTH / 2,
    cy: HEIGHT / 2,
    samples: SAMPLES,
  });

  // Ground first, opaque everywhere: the card is composited over whatever the
  // reader's chat background is, and an alpha hole would take that colour.
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    pixels[i * 4] = GROUND[0];
    pixels[i * 4 + 1] = GROUND[1];
    pixels[i * 4 + 2] = GROUND[2];
    pixels[i * 4 + 3] = 0xff;
  }

  // Only the mark's own box can be covered, and it is a fourteenth of the
  // canvas. Sampling the rest would be a million pixels of answered-in-advance.
  const { x0, y0, x1, y1 } = mark.bounds;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const a = mark.coverage(x, y);
      if (a === 0) continue;
      const o = (y * WIDTH + x) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[o + c] = Math.round(GROUND[c] + (COLOUR[c] - GROUND[c]) * a);
      }
    }
  }
  return pixels;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "og.png");
mkdirSync(dirname(out), { recursive: true });
const png = encodePng(render(), WIDTH, HEIGHT);
writeFileSync(out, png);

// Crawlers skip images they consider too big to be worth fetching, and
// WhatsApp is the strictest of them. Flat colour deflates to a fraction of the
// budget, so blowing it would mean something is wrong with the cut, not with
// the limit — worth failing the build over rather than shipping a blank card.
const kb = Math.round(png.length / 1024);
if (png.length > 300 * 1024) {
  console.error(`${out} is ${kb}KB — over the 300KB crawlers will fetch.`);
  process.exit(1);
}
console.log(`Wrote ${out} (${WIDTH}x${HEIGHT}, ${kb}KB)`);
