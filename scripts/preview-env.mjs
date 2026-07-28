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
// production grows a variable that this list has not been taught about. That
// decision lives in scripts/lib/convex-env.mjs, shared with the worktree
// backends in scripts/worktree-dev.mjs.
//
// It writes secrets to stdout. That is the point — but pipe it to the
// clipboard, not into a file in the repo.

import {
  COPY,
  EMAIL,
  MODEL_AND_AUTH,
  SKIP,
  readDeploymentEnv,
} from "./lib/convex-env.mjs";

// A preview is reachable by anyone with the PR link and has no logs the tester
// can read, so its sign-in email has to actually send. SES is required here in
// a way it isn't on a local backend.
const REQUIRED = [...MODEL_AND_AUTH, ...EMAIL];

const source = process.argv.slice(2);
const found = readDeploymentEnv(source.length > 0 ? source : ["--prod"]);
if (found === null) process.exit(1);

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
  note("or SKIP in scripts/lib/convex-env.mjs.");
}

if (copied.length === 0) process.exit(1);
