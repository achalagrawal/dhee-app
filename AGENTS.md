<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Building toward the final design

We build Dhee toward the Claude Design mockups using a spec-driven, tracked loop.
**Before working on any product feature, read `docs/build/FEATURES.md`** — it's the
source of truth for what's done and what's next. See `docs/build/README.md` for the
per-feature workflow (spec → backend TDD → wire UI → verify → track).

## Running the app

`pnpm dev` — never `pnpm web` or `convex dev` directly. Sessions run in parallel
worktrees, and `pnpm dev` is what stops them colliding: it claims this
checkout's port and picks between reusing the main checkout's backend and
provisioning one for this worktree, based on whether the branch changes
`convex/`. It needs no input and prompts for nothing. See
`README.md#running-more-than-one-checkout`.

## Checks before finishing

Run these before committing — CI (`.github/workflows/ci.yml`) enforces all three,
and they need no backend or secrets:

- `pnpm typecheck` — tsc for the app + the convex project
- `pnpm test` — vitest + convex-test, in-memory (backend tests are `convex/**/*.test.ts`)
- `pnpm format:check` — prettier (`pnpm format` to fix)

Testing notes: the harness is `convex/test.setup.ts` (`initTest`/`createUser`/`asUser`).
Never let a test call the LLM — functions like `streamReply` are only _scheduled_;
assert against `_scheduled_functions` instead of running them. If a feature
advances a `docs/build/FEATURES.md` row, update its status in the same change.

Deployment is Vercel's job (runs `convex deploy` in the web build); do not add
deploy steps to GitHub Actions. See `CONTRIBUTING.md`.
