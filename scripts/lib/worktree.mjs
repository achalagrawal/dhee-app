// Where am I, and which port is mine?
//
// Several Claude Code sessions run at once, each in its own git worktree under
// .claude/worktrees/. They used to collide on 8081 and on one shared Convex
// backend. This module answers the two questions that make them independent:
// which checkout is this, and what port does it own.

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";

// The main checkout keeps 8081, the port every doc and bookmark already names.
// Worktrees take a slot above it.
export const MAIN_PORT = 8081;
export const FIRST_WORKTREE_PORT = 8082;
export const LAST_WORKTREE_PORT = 8099;

export function git(args, cwd) {
  const { status, stdout } = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    cwd,
  });
  return status === 0 ? stdout.trim() : null;
}

// `--git-common-dir` resolves to the *main* checkout's .git from inside any
// worktree, which is what makes the main checkout findable from a worktree —
// and it is where .env.local, the shared local backend, and the port registry
// all live.
export function locate(cwd = process.cwd()) {
  const root = git(
    ["rev-parse", "--path-format=absolute", "--show-toplevel"],
    cwd,
  );
  if (root === null) {
    throw new Error(`Not inside a git repository: ${cwd}`);
  }
  const commonDir = git(
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    cwd,
  );
  const mainCheckout = path.dirname(commonDir);
  return { root, mainCheckout, isMain: root === mainCheckout };
}

export function registryPath(mainCheckout) {
  return path.join(mainCheckout, ".claude", "worktree-ports.json");
}

// Ports are assigned, not hashed. Hashing a worktree name into 18 slots
// collides constantly — 14 worktrees land on 9 distinct ports — and a
// colliding worktree's port then depends on start order, which defeats the
// point of a stable one. A registry in the main checkout gives each worktree
// one port for as long as it exists, and hands the slot back when it's gone.
//
// Keyed by absolute path, because that is what tells us a worktree was deleted.
export function claimPort({ root, mainCheckout, isMain }) {
  if (isMain) return MAIN_PORT;

  const file = registryPath(mainCheckout);
  let registry = {};
  if (fs.existsSync(file)) {
    try {
      registry = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      // A corrupt registry costs everyone their port, which is annoying but
      // recoverable; refusing to start is not. Begin again.
      registry = {};
    }
  }

  // Reclaim slots from worktrees that have been deleted. Without this the
  // range fills up with ghosts after a few weeks of feature branches.
  for (const dir of Object.keys(registry)) {
    if (dir !== root && !fs.existsSync(dir)) delete registry[dir];
  }

  if (typeof registry[root] !== "number") {
    const taken = new Set(Object.values(registry));
    let claimed = null;
    for (let p = FIRST_WORKTREE_PORT; p <= LAST_WORKTREE_PORT; p++) {
      if (!taken.has(p)) {
        claimed = p;
        break;
      }
    }
    if (claimed === null) {
      throw new Error(
        `Every port from ${FIRST_WORKTREE_PORT} to ${LAST_WORKTREE_PORT} is ` +
          `claimed. Delete a finished worktree, or widen the range in ` +
          `scripts/lib/worktree.mjs.`,
      );
    }
    registry[root] = claimed;
  }

  // Write via rename so a second session reading mid-write sees one version or
  // the other, never half a file.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(registry, null, 2)}\n`);
  fs.renameSync(temp, file);

  return registry[root];
}

export function isFree(port) {
  const probe = net.createServer();
  return new Promise((resolve) => {
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

// Every localhost origin a worktree could serve from. The shared backend has to
// trust all of them up front, because it can't know which worktrees exist —
// see EXTRA_TRUSTED_ORIGINS in convex/auth.ts.
export function allDevOrigins() {
  const origins = [`http://localhost:${MAIN_PORT}`];
  for (let p = FIRST_WORKTREE_PORT; p <= LAST_WORKTREE_PORT; p++) {
    origins.push(`http://localhost:${p}`);
  }
  return origins;
}
