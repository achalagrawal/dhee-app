// Writes public/index.html, the shell `expo export -p web` serves every route
// from, and public/manifest.webmanifest beside it. Expo reads the shell if it
// exists and falls back to its own copy if it does not (see
// `getTemplateIndexHtmlAsync` in @expo/cli), then fills in the placeholders and
// appends the bundle's <script> tags.
//
// The head here carries two things that both need to be on disk before any
// JavaScript runs, for the same reason — the web build is `output: "single"`
// and vercel.json rewrites every path to this one file:
//
//   - What a link-preview crawler says about a Dhee link. WhatsApp, Slack,
//     iMessage and Twitter run none of the JavaScript that would fill the page
//     in. Expo's stock shell carries a title and nothing else, which is why a
//     shared link used to render as bare blue text.
//   - What Added to the Home Screen produces. Without an apple-touch-icon iOS
//     screenshots the page and makes the icon out of that, and without
//     apple-mobile-web-app-capable Safari keeps its chrome.
//
// Not `app/+html.tsx`, the obvious-looking answer to either: that hook is only
// rendered by the static-output pipeline. In `single` mode Expo never calls it,
// and it exports with no effect at all.
//
// Generated rather than committed because public/ is (see .gitignore), and
// generated rather than hand-written because the URLs in it have to follow
// `EXPO_PUBLIC_SITE_URL` onto a preview deployment.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { previewTags, site, siteMeta } from "./lib/meta.mjs";

// The app's paper, light and dark: `bg` from src/lib/theme.ts. The status bar
// of a standalone window takes its colour from these, so it follows the system
// theme the way the app does.
const PAPER = "#fdfaf4";
const PAPER_DARK = "#16120e";

// Everything outside the <head> is Expo's stock shell, kept verbatim: the
// reset that stops <ScrollView> scrolling the body, and the #root the bundle
// mounts into. %LANG_ISO_CODE% and %WEB_TITLE% are Expo's placeholders, filled
// from app.json — leaving them in means the name lives in one place.
const shell = `<!DOCTYPE html>
<html lang="%LANG_ISO_CODE%">
  <head>
    <meta charset="utf-8" />
    <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
    <!--
      viewport-fit=cover lets env(safe-area-inset-*) resolve to real numbers,
      which is what react-native-safe-area-context reads on web. Without it a
      standalone window reports zero insets and the app draws under the notch.
      No user-scalable=no: pinch-zoom is an accessibility feature, and a
      standalone window does not rubber-band anyway.
    -->
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
    <title>%WEB_TITLE%</title>
    <meta name="description" content="${siteMeta.description}" />
${previewTags({
  type: "website",
  title: siteMeta.title,
  description: siteMeta.description,
  url: site,
})}
    <!--
      Added to the Home Screen, this is what makes Dhee open as an app rather
      than a page in a browser frame. iOS keys off apple-mobile-web-app-capable
      (17.4+ reads the manifest's display mode too, older versions do not), and
      it needs an apple-touch-icon of its own: with no PNG to find it screenshots
      the page and uses that as the icon. Every path here is absolute because
      the app is a single-page build — /threads and /s/<slug> are served the same
      index.html, and a relative icon href would resolve against those.
    -->
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icon-180.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="${siteMeta.name}" />
    <!-- \`default\` keeps content below the status bar; the theme-colors below
         keep the bar the same paper as the screen under it. The manifest can
         only carry one theme_color, which is why these live in the markup. -->
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${PAPER}" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${PAPER_DARK}" />
    <!-- The \`react-native-web\` recommended style reset: https://necolas.github.io/react-native-web/docs/setup/#root-element -->
    <style id="expo-reset">
      /* These styles make the body full-height */
      html,
      body {
        height: 100%;
      }
      /* These styles disable body scrolling if you are using <ScrollView> */
      body {
        overflow: hidden;
      }
      /* These styles make the root element full-height */
      #root {
        display: flex;
        height: 100%;
        flex: 1;
      }
      /* The paper the app is about to paint, so the launch is not a white
         flash first. The theme has a manual override; this only has the system
         setting to go on, and is replaced the moment React mounts. */
      html,
      body {
        background-color: ${PAPER};
      }
      @media (prefers-color-scheme: dark) {
        html,
        body {
          background-color: ${PAPER_DARK};
        }
      }
    </style>
  </head>

  <body>
    <!-- Use static rendering with Expo Router to support running without JavaScript. -->
    <noscript>
      You need to enable JavaScript to run this app.
    </noscript>
    <!-- The root element for your Expo app. -->
    <div id="root"></div>
  </body>
</html>
`;

// What Android reads to decide the app is installable, and what iOS 17.4+
// reads alongside the meta tags. Chrome's required set is name (or short_name),
// icons at 192 and 512, start_url, display, and prefer_related_applications
// absent or false — over HTTPS. Everything past that is how good the installed
// app looks rather than whether it installs at all.
//
// `id` is fixed separately from `start_url` on purpose: it is the app's
// identity to the launcher, so pinning it means a later change of landing page
// updates the installed app instead of registering a second one.
//
// Only one background_color is allowed, so a dark-mode launch flashes light
// paper before the app paints — the media-scoped theme-colors in the shell
// above are the part that can follow the system theme.
const manifest = {
  id: "/",
  name: siteMeta.name,
  short_name: siteMeta.name,
  description: siteMeta.description,
  lang: "en",
  dir: "ltr",
  start_url: "/",
  scope: "/",
  display: "standalone",
  // Chrome walks this in order and takes the first mode it supports, so a
  // browser without standalone lands on minimal-ui rather than falling all the
  // way back to a normal tab. `display` above stays for readers of the older
  // field.
  display_override: ["standalone", "minimal-ui"],
  orientation: "portrait",
  background_color: PAPER,
  theme_color: PAPER,
  // One entry per purpose, deliberately not one file marked `any maskable`.
  // See scripts/render-icons.mjs for why that shortcut costs one surface or
  // the other.
  icons: [
    ...[192, 512].map((size) => ({
      src: `/icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
    ...[192, 512].map((size) => ({
      src: `/icon-maskable-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "maskable",
    })),
  ],
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public");
mkdirSync(dir, { recursive: true });

for (const [name, contents] of [
  ["index.html", shell],
  ["manifest.webmanifest", `${JSON.stringify(manifest, null, 2)}\n`],
]) {
  writeFileSync(join(dir, name), contents);
  console.log(`Wrote ${join(dir, name)}`);
}
