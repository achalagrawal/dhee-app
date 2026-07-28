// Runs the app in whichever checkout you're standing in.
//
//   pnpm dev              # pick the backend automatically
//   pnpm dev --shared     # force: reuse the main checkout's backend
//   pnpm dev --isolated   # force: this worktree gets a backend of its own
//
// Several sessions run at once, each in its own worktree. Two things have to be
// true for that to work: they must not fight over a port, and they must not
// both push a different branch's schema into one database.
//
// The port is claimed once per worktree and recorded in the main checkout, so
// it survives restarts. The backend is chosen by what the branch touches:
//
//   shared    nothing under convex/ has changed, so run Expo alone against the
//             main checkout's local backend. Instant, and your account and
//             conversations are already there.
//   isolated  the branch changes backend code, so provision a local backend
//             belonging to this worktree — its own sqlite, its own ports, its
//             own copy of the secrets. Starts empty; sign in with the email
//             code that `convex dev` prints.
//
// Codegen output and test files don't count as backend changes: neither alters
// what a running backend serves.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { COPY, readDeploymentEnv, unquote } from "./lib/convex-env.mjs";
import { allDevOrigins, git, isFree } from "./lib/worktree.mjs";
import { readEnvFile, setup, useSharedBackend } from "./worktree-setup.mjs";

const say = (line = "") => process.stderr.write(`${line}\n`);

function run(command, args, options = {}) {
  return spawnSync(command, args, { stdio: "inherit", ...options });
}

function backendChanges(root) {
  const base = git(["merge-base", "main", "HEAD"], root);
  const committed = base
    ? (git(["diff", "--name-only", base, "HEAD", "--", "convex/"], root) ?? "")
    : "";
  const working = git(["status", "--porcelain", "--", "convex/"], root) ?? "";
  return [
    ...committed.split("\n"),
    // Porcelain lines are "XY path"; a rename is "R  old -> new" and the new
    // name is the one that matters.
    ...working.split("\n").map((line) => line.slice(3).split(" -> ").pop()),
  ]
    .map((file) => file.trim())
    .filter(
      (file) =>
        file.startsWith("convex/") &&
        !file.startsWith("convex/_generated/") &&
        !file.endsWith(".test.ts"),
    );
}

// Convex writes the team and project into the CONVEX_DEPLOYMENT comment, which
// is the only place they're recorded outside the dashboard. Reading them back
// is what lets a worktree provision without an interactive prompt.
function projectCoordinates(mainCheckout) {
  const team = process.env.CONVEX_TEAM;
  const project = process.env.CONVEX_PROJECT;
  if (team && project) return { team, project };
  const envFile = path.join(mainCheckout, ".env.local");
  const line = fs.existsSync(envFile)
    ? fs
        .readFileSync(envFile, "utf8")
        .split("\n")
        .find((l) => l.startsWith("CONVEX_DEPLOYMENT="))
    : undefined;
  const match = /#\s*team:\s*([^,]+),\s*project:\s*(\S+)/.exec(line ?? "");
  if (!match) {
    say(
      "Could not read the team and project from the main checkout's " +
        ".env.local.\nSet CONVEX_TEAM and CONVEX_PROJECT and run again.",
    );
    process.exit(1);
  }
  return { team: match[1].trim(), project: match[2].trim() };
}

// Every worktree serves from a different localhost port, and the shared backend
// can't know which ones exist — so it trusts the whole range at once. Read
// before write: this runs on every shared-mode start and should be a no-op
// after the first. convex/auth.ts splits this value into trustedOrigins.
function trustDevOrigins(mainCheckout) {
  const current = readDeploymentEnv([], { cwd: mainCheckout });
  if (current === null) {
    say(
      "Could not reach the main checkout's backend to check trusted origins.\n" +
        "Sign-in from this port will be rejected until `pnpm dev` runs there.",
    );
    return;
  }
  const wanted = allDevOrigins();
  const existing = unquote(current.get("EXTRA_TRUSTED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const missing = wanted.filter((origin) => !existing.includes(origin));
  if (missing.length === 0) return;
  const merged = [...existing, ...missing].join(",");
  say("Teaching the shared backend to trust the worktree ports…");
  run("npx", ["convex", "env", "set", "EXTRA_TRUSTED_ORIGINS", merged], {
    cwd: mainCheckout,
  });
}

// A fresh local backend has no secrets at all, so it comes up looking healthy
// and then fails on sign-in or the first message. Copy them from the backend
// the main checkout already has, using the same filter previews use.
function seedSecrets(root, mainCheckout) {
  const source = readDeploymentEnv([], { cwd: mainCheckout });
  if (source === null) {
    say(
      "Could not read the main checkout's backend, so this one starts without\n" +
        "secrets. Set them by hand with `npx convex env set`, or start the main\n" +
        "checkout once and rerun.",
    );
    return;
  }
  const copied = COPY.filter((name) => source.has(name));
  for (const name of copied) {
    run("npx", ["convex", "env", "set", name, unquote(source.get(name))], {
      cwd: root,
    });
  }
  say(`Copied ${copied.length} variables from the main checkout's backend.`);
  if (!copied.includes("AWS_REGION")) {
    say(
      "No SES credentials, so sign-in codes are not emailed — they appear in " +
        "the `convex dev` output below instead.",
    );
  }
}

function provision(root, mainCheckout, port) {
  const { team, project } = projectCoordinates(mainCheckout);
  say(`Provisioning a local backend for this worktree (${team}/${project})…`);
  // stdin is not inherited: if this ever does hit a prompt, the CLI takes its
  // non-interactive default instead of hanging an agent session forever.
  const { status } = run(
    "npx",
    [
      "convex",
      "dev",
      "--once",
      "--configure",
      "existing",
      "--team",
      team,
      "--project",
      project,
      "--dev-deployment",
      "local",
    ],
    { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (status !== 0) {
    say("Provisioning failed. Nothing was started.");
    process.exit(status ?? 1);
  }
  seedSecrets(root, mainCheckout);
  run("npx", ["convex", "env", "set", "SITE_URL", `http://localhost:${port}`], {
    cwd: root,
  });
}

const flags = process.argv.slice(2);
const { root, mainCheckout, isMain, port } = setup({ install: true, log: say });
const web = `pnpm web --port ${port}`;

// This checkout owns its port for as long as it exists, so something already
// listening means this checkout is already running. Say so instead of starting
// a second copy somewhere unexpected.
if (!(await isFree(port))) {
  say(`Port ${port} is already in use, and it belongs to this checkout.`);
  say("It is most likely already running. Stop it first, or reload the tab at");
  say(`http://localhost:${port}`);
  process.exit(1);
}

if (isMain) {
  say(`Main checkout, port ${port}.`);
  process.exit(
    run("npx", ["convex", "dev", "--tail-logs", "always", "--start", web], {
      cwd: root,
    }).status ?? 1,
  );
}

const changed = backendChanges(root);
const isolated = flags.includes("--isolated")
  ? true
  : flags.includes("--shared")
    ? false
    : changed.length > 0;

say();
if (isolated) {
  say(
    changed.length > 0
      ? `Isolated backend: this branch changes ${changed.length} file(s) under convex/.`
      : "Isolated backend: asked for with --isolated.",
  );
  say(`Serving on http://localhost:${port}`);
  say();
  if (!readEnvFile(path.join(root, ".env.local")).has("CONVEX_DEPLOYMENT")) {
    provision(root, mainCheckout, port);
  }
  process.exit(
    run("npx", ["convex", "dev", "--tail-logs", "always", "--start", web], {
      cwd: root,
    }).status ?? 1,
  );
}

say("Shared backend: no backend changes on this branch, so reusing the main");
say("checkout's. Run with --isolated for one of this worktree's own.");
say(`Serving on http://localhost:${port}`);
say();
// Rewritten every time, not just when absent: this is also the path back for a
// worktree that went isolated and has since dropped its convex/ changes, whose
// .env.local still names a backend nobody is running.
if (!useSharedBackend(root, mainCheckout, say)) process.exit(1);
trustDevOrigins(mainCheckout);
process.exit(
  run("pnpm", ["web", "--port", String(port)], { cwd: root }).status ?? 1,
);
