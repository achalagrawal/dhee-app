// Renders docs/legal/*.md into standalone HTML in public/, which
// `expo export -p web` copies verbatim into dist/.
//
// The reason these are static files rather than expo-router screens: the web
// build is `output: "single"` (app.json), so every route returns the same
// empty index.html and the text only exists after JS runs. Google's OAuth
// verification fetches the privacy policy URL and reads the response — an app
// shell is not a privacy policy to a crawler, however well it renders in a
// browser. An app-store review and a person with JS disabled have the same
// problem. So the published policy is HTML on the first byte, and the markdown
// in docs/legal stays the single source it is generated from.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { previewTags, site } from "./lib/meta.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const PAGES = [
  {
    slug: "privacy",
    src: "docs/legal/privacy.md",
    title: "Privacy Policy",
    description:
      "How Dhee collects, uses, stores, and deletes your personal data.",
  },
  {
    slug: "terms",
    src: "docs/legal/terms.md",
    title: "Terms of Use",
    description: "The terms you agree to when you use Dhee.",
  },
  {
    slug: "safety",
    src: "docs/legal/safety.md",
    title: "Safety & limitations",
    description:
      "What Dhee cannot do, and where to get help in a crisis. Dhee is not a medical or crisis service.",
  },
];

// Everything between these markers is repo-facing — drafting status, links to
// files that only exist in git — and is dropped from the published page. The
// markers live in the markdown so the omission is visible where the text is
// edited, rather than being a silent rule buried in this script.
const INTERNAL =
  /<!--\s*internal:start\s*-->[\s\S]*?<!--\s*internal:end\s*-->/g;

// Paths the site actually serves. A relative link to a sibling markdown file
// reads fine on GitHub and 404s once published, so each one is rewritten here
// and anything unmapped is a build failure rather than a dead link in a legal
// document.
const LINK_MAP = {
  "./privacy.md": "/privacy",
  "./terms.md": "/terms",
  "./safety.md": "/safety",
};

const slugify = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .toLowerCase()
    .replace(/&[a-z]+;/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

function render({ slug, src, title, description }) {
  const markdown = readFileSync(join(root, src), "utf8").replace(INTERNAL, "");

  let body = marked.parse(markdown, { gfm: true, async: false });

  // marked stopped emitting heading ids, and the documents link to their own
  // sections. Added here so the anchors in the source markdown resolve.
  const ids = new Set();
  body = body.replace(/<h([1-6])>(.*?)<\/h\1>/g, (_m, level, inner) => {
    const id = slugify(inner);
    ids.add(id);
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });

  body = body.replace(/href="([^"]+)"/g, (m, href) => {
    if (href.startsWith("#") || /^(https?:|mailto:|\/)/.test(href)) return m;
    const mapped = LINK_MAP[href];
    if (!mapped) throw new Error(`${src}: unmapped relative link "${href}"`);
    return `href="${mapped}"`;
  });

  // A legal document that links to its own missing section is the kind of
  // thing nobody notices until someone is looking for their deletion rights.
  for (const [, anchor] of body.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(anchor)) throw new Error(`${src}: dead anchor "#${anchor}"`);
  }

  const others = PAGES.filter((p) => p.slug !== slug);
  return template({ slug, title, description, body, others });
}

// These pages get shared as links too — a privacy policy pasted into a review
// thread, a safety page sent to someone who needs it — and each is served as
// its own HTML rather than through the app shell, so the tags build-shell.mjs
// writes do not reach them. Per-page title and description, one shared card.
const template = ({
  slug,
  title,
  description,
  body,
  others,
}) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — Dhee</title>
    <meta name="description" content="${description}" />
${previewTags({
  type: "article",
  title: `${title} — Dhee`,
  description,
  url: `${site}/${slug}`,
})}
    <style>
      /* Tokens mirror src/lib/theme.ts (light + dark, default accent). No
         webfont: a network request the page does not need is a request that
         can fail in front of a reviewer. */
      :root {
        --bg: #fdfaf4; --surface: #ffffff; --border: #e2ddd5;
        --text: #302720; --text-soft: #60564e; --accent: #9f5021;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #16120e; --surface: #201b16; --border: #39312b;
          --text: #ece7df; --text-soft: #aaa39b; --accent: #e7b280;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0; background: var(--bg); color: var(--text);
        font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          "Helvetica Neue", Arial, sans-serif;
        -webkit-text-size-adjust: 100%;
      }
      .page { max-width: 44rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
      nav { display: flex; gap: 1.25rem; margin-bottom: 2.5rem; font-size: .9rem; }
      h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 1.5rem; }
      h2 { font-size: 1.3rem; margin: 2.5rem 0 .75rem; }
      h3 { font-size: 1.05rem; margin: 2rem 0 .5rem; }
      p, li { color: var(--text-soft); }
      strong { color: var(--text); }
      a { color: var(--accent); }
      hr { border: 0; border-top: 1px solid var(--border); margin: 2.5rem 0; }
      ul, ol { padding-left: 1.25rem; }
      li { margin: .35rem 0; }
      blockquote {
        margin: 1.5rem 0; padding: .75rem 1.25rem;
        border-left: 3px solid var(--border); background: var(--surface);
      }
      /* Wide tables scroll inside their own box rather than pushing the page
         sideways on a phone. */
      .table-wrap { overflow-x: auto; margin: 1.5rem 0; }
      /* min-width so a narrow screen scrolls the table rather than squeezing
         three columns into one word per line. */
      table {
        border-collapse: collapse; width: 100%; min-width: 34rem;
        font-size: .9rem;
      }
      th, td {
        border: 1px solid var(--border); padding: .6rem .75rem;
        text-align: left; vertical-align: top;
      }
      th { background: var(--surface); color: var(--text); }
      footer {
        margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--border);
        font-size: .875rem; color: var(--text-soft);
      }
    </style>
  </head>
  <body>
    <main class="page">
      <nav>
        <a href="/">Dhee</a>
        ${others.map((p) => `<a href="/${p.slug}">${p.title}</a>`).join("\n        ")}
      </nav>
      ${body.trim()}
      <footer>Dhee — <a href="mailto:privacy@dhee.app">privacy@dhee.app</a></footer>
    </main>
  </body>
</html>
`;

mkdirSync(join(root, "public"), { recursive: true });
for (const page of PAGES) {
  const html = render(page).replace(
    /<table>/g,
    '<div class="table-wrap"><table>',
  );
  writeFileSync(
    join(root, "public", `${page.slug}.html`),
    html.replace(/<\/table>/g, "</table></div>"),
    "utf8",
  );
  console.log(`public/${page.slug}.html`);
}
