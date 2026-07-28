// Reading environment variables off a Convex deployment, and the decision about
// which of them belong on a throwaway one.
//
// Two callers, same question. `scripts/preview-env.mjs` copies values onto a
// per-branch preview backend; `scripts/worktree-dev.mjs` copies them onto the
// isolated local backend a worktree provisions for itself. Neither inherits
// anything from production automatically, so both need the same filter.

import { spawnSync } from "node:child_process";

// What a deployment needs to work at all: a model, a signing secret, and enough
// SES to deliver a sign-in code. Callers decide how loudly to complain when one
// is absent — a preview without SES silently fails at sign-in, whereas a local
// backend just prints the code to its own logs instead.
export const MODEL_AND_AUTH = ["OPENROUTER_API_KEY", "BETTER_AUTH_SECRET"];
export const EMAIL = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AUTH_EMAIL_FROM",
];

// Copied when present, silent when absent: temporary AWS credentials, and the
// corpus endpoint which falls back to the hosted one.
export const OPTIONAL = ["AWS_SESSION_TOKEN", "MD_MCP_URL"];

export const COPY = [...MODEL_AND_AUTH, ...EMAIL, ...OPTIONAL];

// Deliberately withheld, with the reason, so this stays a decision rather than
// an oversight. Anything here is reported as skipped rather than silently
// dropped.
export const SKIP = new Map([
  ["SITE_URL", "points at one origin, so it is set per environment"],
  ["EXTRA_TRUSTED_ORIGINS", "set per environment alongside SITE_URL"],
  [
    "AUTH_GOOGLE_ID",
    "Google sign-in needs a redirect URI registered per deployment",
  ],
  [
    "AUTH_GOOGLE_SECRET",
    "Google sign-in needs a redirect URI registered per deployment",
  ],
]);

// `convex env list` quotes a value it couldn't write bare. The only form that
// spans lines is `NAME='…'` — it picks single quotes precisely when the value
// contains none — so a value opening with one is read to the line that closes
// it. Everything else is one line, and non-matching output (warnings, notices)
// falls through.
export function parseEnv(text) {
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

// A value that arrived quoted is still quoted here, because that is the form
// `convex env set` wants back and the form preview-env.mjs prints. Strip only
// when handing a value to something that isn't a shell.
export function unquote(value) {
  const quote = value[0];
  if ((quote === "'" || quote === '"') && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value;
}

// Reads a deployment's variables. `selector` is whatever `convex env list`
// takes to choose one (`["--prod"]`, `["--deployment", "dev"]`, or nothing for
// the deployment configured in cwd). Returns null when the CLI failed, having
// already let its stderr through.
export function readDeploymentEnv(selector = [], { cwd } = {}) {
  const { status, stdout, error } = spawnSync(
    "npx",
    ["convex", "env", "list", ...selector],
    { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"], cwd },
  );
  if (error) throw error;
  if (status !== 0) return null;
  return parseEnv(stdout);
}
