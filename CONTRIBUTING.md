# Contributing to Dhee

Thanks for your interest. This guide covers how the project is built, the checks
your change must pass, and the workflow we use to build toward the final design.

## Setup

Requires Node ≥ 20 and pnpm (pinned via `packageManager` in `package.json`; run
`corepack enable` to match it automatically).

```bash
pnpm install
```

Full backend setup (Convex deployment, env vars, seed data) is in the
[README](README.md#local-setup). You don't need a running backend to run the
checks below — the tests are in-memory.

## Checks (run before every commit)

CI runs exactly these three on every push and PR (`.github/workflows/ci.yml`).
Run them locally first:

```bash
pnpm typecheck     # tsc for the app + the convex project
pnpm test          # vitest + convex-test (in-memory, no backend needed)
pnpm format:check  # prettier --check .   (use `pnpm format` to fix)
```

CI needs no secrets — `convex/_generated` is committed and the tests never hit a
network or a model. Forks therefore get green CI out of the box.

## How we build: the tracked, spec-driven loop

We build Dhee toward the Claude Design mockups using a repeatable loop. The
source of truth is **[`docs/build/FEATURES.md`](docs/build/FEATURES.md)** — read
it first; it lists every feature, its status, and what to pick up next. The full
workflow is in [`docs/build/README.md`](docs/build/README.md). In short, per
feature:

1. **Spec** — copy `docs/build/specs/TEMPLATE.md`, fill it from the mockup.
2. **Backend first (TDD)** — write a failing `convex/**/*.test.ts`, then implement.
3. **Wire the UI** — build to match the mockup (many controls exist today as
   `soon()` stubs waiting to be made real).
4. **Verify** — tests green + visual check against the mockup.
5. **Track** — flip the status in `FEATURES.md`; one feature ≈ one PR.

## Tests

- Live next to the code as `convex/**/*.test.ts`, run on
  [`convex-test`](https://github.com/get-convex/convex-test).
- The shared harness is `convex/test.setup.ts`: `initTest()` returns an instance
  with the `@convex-dev/agent` component registered; `createUser` / `asUser`
  handle auth.
- Test files use Vite-only APIs and import component source, so they're excluded
  from `tsc` (see the caveat in `docs/build/README.md`) and validated by Vitest.
- Don't let a test invoke the LLM. Functions like `streamReply` are only
  _scheduled_; assert against `_scheduled_functions` instead of running them.
  When you do need generation, stub the model provider.

## Pull requests

- One feature/slice per PR; fill in the PR template.
- Working on `main` is fine to branch from, but open PRs from a branch.
- We do not add "authored by / co-authored-by" trailers for AI tooling in commit
  messages.

## Working with Claude Code

This repo is set up so [Claude Code](https://claude.com/claude-code) can pick up
work with full context: `CLAUDE.md` and `AGENTS.md` point at the tracker and the
checks, so a fresh session reads `docs/build/FEATURES.md`, does a slice through
the loop above, and runs the checks before finishing.

Optional: to enable `@claude` on GitHub issues/PRs, run `/install-github-app`
from an interactive `claude` terminal — it provisions the workflow and the
`ANTHROPIC_API_KEY` secret together. (Not included here because it requires that
secret, which forks can't access.)
