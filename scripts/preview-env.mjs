// Prints the environment variables a preview backend needs, in .env format, for
// pasting into Convex → Project Settings → Default Environment Variables.
//
//   node scripts/preview-env.mjs            # read from production
//   node scripts/preview-env.mjs --prod | pbcopy
//   node scripts/preview-env.mjs --deployment dev
//
// Default env vars are copied into each newly created deployment, which is the
// only way a per-branch preview backend gets credentials at all — nothing is
// inherited from production at deploy time. See docs/deployment.md.
//
// This is a filter, not a dump. `convex env list` already prints .env format;
// what this adds is the decision about which of those values belong on a
// throwaway backend that anyone with the PR link can reach, and a warning when
// production grows a variable that this list has not been taught about.
//
// It writes secrets to stdout. That is the point — but pipe it to the
// clipboard, not into a file in the repo.

import { spawnSync } from "node:child_process";

// What a preview backend needs to work at all: a model, a signing secret, and
// enough SES to deliver a sign-in code. Missing any of these is worth saying
// out loud, because the preview will look healthy and then fail at sign-in.
const REQUIRED = [
  "OPENROUTER_API_KEY",
  "BETTER_AUTH_SECRET",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AUTH_EMAIL_FROM",
];

// Copied when present, silent when absent: temporary AWS credentials, and the
// corpus endpoint which falls back to the hosted one.
const OPTIONAL = ["AWS_SESSION_TOKEN", "MD_MCP_URL"];

const COPY = [...REQUIRED, ...OPTIONAL];

// Deliberately withheld, with the reason, so this stays a decision rather than
// an oversight. Anything here is reported as skipped rather than silently
// dropped.
const SKIP = new Map([
  ["SITE_URL", "set per preview by scripts/vercel-build.mjs"],
  ["EXTRA_TRUSTED_ORIGINS", "set per preview by scripts/vercel-build.mjs"],
  [
    "AUTH_GOOGLE_ID",
    "Google sign-in can't work on a preview — the redirect URI is per-branch",
  ],
  [
    "AUTH_GOOGLE_SECRET",
    "Google sign-in can't work on a preview — the redirect URI is per-branch",
  ],
]);

const source = process.argv.slice(2);
const { status, stdout, error } = spawnSync(
  "npx",
  ["convex", "env", "list", ...(source.length > 0 ? source : ["--prod"])],
  { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] },
);
if (error) throw error;
if (status !== 0) process.exit(status ?? 1);

// `convex env list` quotes a value it couldn't write bare. The only form that
// spans lines is `NAME='…'` — it picks single quotes precisely when the value
// contains none — so a value opening with one is read to the line that closes
// it. Everything else is one line, and non-matching output (warnings, notices)
// falls through.
function parseEnv(text) {
  const entries = new Map();
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(lines[i]);
    if (!match) continue;
    const [, name] = match;
    let value = match[2];
    if (value.startsWith("'") && !(value.length > 1 && value.endsWith("'"))) {
      while (++i < lines.length) {
        value += `\n${lines[i]}`;
        if (lines[i].endsWith("'")) break;
      }
    }
    entries.set(name, value);
  }
  return entries;
}

const found = parseEnv(stdout);
const note = (line) => process.stderr.write(`${line}\n`);

const copied = COPY.filter((name) => found.has(name));
for (const name of copied) console.log(`${name}=${found.get(name)}`);

const missing = REQUIRED.filter((name) => !found.has(name));
if (missing.length > 0) {
  note("");
  note(`Missing on the source deployment: ${missing.join(", ")}`);
  note("A preview without these looks healthy and then fails at sign-in or on");
  note("the first message. Set them there first, or paste them in by hand.");
}

// The point of this branch: someone adds a secret to production months from now
// and never thinks about previews. Say so rather than quietly omitting it.
const unknown = [...found.keys()].filter(
  (name) => !COPY.includes(name) && !SKIP.has(name),
);
if (unknown.length > 0) {
  note("");
  note(`Unrecognised on the source deployment: ${unknown.join(", ")}`);
  note("Decide whether each belongs on a preview backend, then add it to COPY");
  note("or SKIP in scripts/preview-env.mjs.");
}

if (copied.length === 0) process.exit(1);
