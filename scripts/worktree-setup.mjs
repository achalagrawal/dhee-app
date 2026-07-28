// Makes a checkout runnable without asking anybody anything.
//
//   node scripts/worktree-setup.mjs             # fast; safe on every session start
//   node scripts/worktree-setup.mjs --install   # also `pnpm install` if needed
//
// A fresh `git worktree add` copies only tracked files, so a worktree arrives
// with no node_modules and no .env.local. Without CONVEX_DEPLOYMENT set,
// `convex dev` opens its interactive "configure a project" prompt and an agent
// session hangs there. This script closes that gap before anyone hits it:
// it picks the port this checkout owns, writes .claude/launch.json to match,
// and seeds .env.local pointing at the main checkout's backend.
//
// Everything here is idempotent and starts no servers — `pnpm dev`
// (scripts/worktree-dev.mjs) does the launching, and calls this first.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { claimPort, locate } from "./lib/worktree.mjs";

export function readEnvFile(file) {
  const entries = new Map();
  if (!fs.existsSync(file)) return entries;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}

// Only rewrite when the content actually changed. This runs on every session
// start, and a file whose mtime moves for no reason makes watchers churn.
function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) {
    return false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

// The Browser pane reads `port` from here to know where to connect, which is
// why this file can't be committed with one checkout's port baked in. See
// .claude/launch.example.json for the shape.
function launchConfig(port) {
  return `${JSON.stringify(
    {
      version: "0.0.1",
      configurations: [
        {
          name: "dhee",
          runtimeExecutable: "node",
          runtimeArgs: ["scripts/worktree-dev.mjs"],
          port,
        },
        {
          name: "expo-web",
          runtimeExecutable: "pnpm",
          runtimeArgs: ["web", "--port", String(port)],
          port,
        },
      ],
    },
    null,
    2,
  )}\n`;
}

// Point this worktree at the main checkout's backend.
//
// Always rewritten rather than written once, because both ends move: the main
// checkout's local backend renegotiates its ports whenever something else holds
// them, and a worktree that went isolated and then dropped its convex/ changes
// still has the old CONVEX_DEPLOYMENT in here, pointing at a backend nothing is
// running. Returns false when the main checkout has no backend to share.
export function useSharedBackend(root, mainCheckout, log = console.error) {
  const main = readEnvFile(path.join(mainCheckout, ".env.local"));
  const url = main.get("EXPO_PUBLIC_CONVEX_URL");
  const siteUrl = main.get("EXPO_PUBLIC_CONVEX_SITE_URL");
  if (!url || !siteUrl) {
    log(
      "The main checkout has no .env.local yet, so there is no backend to " +
        "share.\nRun `pnpm dev` there once, then come back.",
    );
    return false;
  }
  const content = [
    "# Written by scripts/worktree-setup.mjs. Not committed.",
    "#",
    "# This worktree talks to the main checkout's local Convex backend, so you",
    "# keep your account and your conversations. CONVEX_DEPLOYMENT is",
    "# deliberately absent: without it, a stray `pnpm convex:dev` here cannot",
    "# push this branch's schema over the one the main checkout is running.",
    "#",
    "# `pnpm dev` replaces this with a deployment of this worktree's own as soon",
    "# as the branch touches convex/, and restores it when those changes go",
    "# away. See README.md#running-more-than-one-checkout.",
    `EXPO_PUBLIC_CONVEX_URL=${url}`,
    `EXPO_PUBLIC_CONVEX_SITE_URL=${siteUrl}`,
    "",
  ].join("\n");
  if (writeIfChanged(path.join(root, ".env.local"), content)) {
    log("Pointed .env.local at the main checkout's backend.");
  }
  return true;
}

export function setup({ install = false, log = console.error } = {}) {
  const where = locate();
  const port = claimPort(where);
  const envFile = path.join(where.root, ".env.local");

  if (
    writeIfChanged(
      path.join(where.root, ".claude/launch.json"),
      launchConfig(port),
    )
  ) {
    log(`Wrote .claude/launch.json for port ${port}.`);
  }

  // Seed a missing .env.local so the worktree is runnable before anyone picks a
  // mode. Never touch one that exists: the main checkout's is hand-tended, and a
  // worktree that has gone isolated has a CONVEX_DEPLOYMENT in here that
  // `convex dev` wrote. Switching back is `pnpm dev`'s job, not this one's —
  // this runs on every session start and must not undo a running setup.
  if (!where.isMain && !fs.existsSync(envFile)) {
    useSharedBackend(where.root, where.mainCheckout, log);
  }

  const modules = path.join(where.root, "node_modules");
  if (!fs.existsSync(modules)) {
    if (!install) {
      log("No node_modules here yet. `pnpm dev` will install them.");
    } else {
      log("Installing dependencies…");
      const { status } = spawnSync("pnpm", ["install"], {
        cwd: where.root,
        stdio: "inherit",
      });
      if (status !== 0) throw new Error("pnpm install failed");
    }
  }

  return { ...where, port };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  setup({ install: process.argv.includes("--install") });
}
