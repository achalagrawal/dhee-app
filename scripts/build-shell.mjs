// Writes public/index.html, the shell `expo export -p web` serves every route
// from. Expo reads this file if it exists and falls back to its own copy if it
// does not (see `getTemplateIndexHtmlAsync` in @expo/cli), then fills in the
// placeholders and appends the bundle's <script> tags.
//
// The reason to override it: the web build is `output: "single"` and
// vercel.json rewrites every path to this one file, so a link-preview crawler
// — WhatsApp, Slack, iMessage, Twitter — gets the shell and runs none of the
// JavaScript that would fill it in. Whatever it is going to say about a Dhee
// link has to be in this file already. Expo's stock shell carries a title and
// nothing else, which is why a shared link used to render as bare blue text.
//
// Not `app/+html.tsx`, the obvious-looking answer: that hook is only rendered
// by the static-output pipeline. In `single` mode Expo never calls it.
//
// Generated rather than committed because public/ is (see .gitignore), and
// generated rather than hand-written because the URLs in it have to follow
// `EXPO_PUBLIC_SITE_URL` onto a preview deployment.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { previewTags, site, siteMeta } from "./lib/meta.mjs";

// Everything outside the <head> is Expo's stock shell, kept verbatim: the
// reset that stops <ScrollView> scrolling the body, and the #root the bundle
// mounts into. %LANG_ISO_CODE% and %WEB_TITLE% are Expo's placeholders, filled
// from app.json — leaving them in means the name lives in one place.
const shell = `<!DOCTYPE html>
<html lang="%LANG_ISO_CODE%">
  <head>
    <meta charset="utf-8" />
    <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
    <title>%WEB_TITLE%</title>
    <meta name="description" content="${siteMeta.description}" />
    <meta name="theme-color" content="#fdfaf4" />
${previewTags({
  type: "website",
  title: siteMeta.title,
  description: siteMeta.description,
  url: site,
})}
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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "index.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, shell);
console.log(`Wrote ${out}`);
