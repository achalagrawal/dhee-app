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

The app's rasters are not hand-drawn: `pnpm icons` writes `assets/favicon.png`
and the Home Screen icons in `public/`, and `pnpm og` writes the link-preview
card, all cut from the same measured geometry as
[`DheeMark`](src/components/ui/DheeMark.tsx) via
[`scripts/lib/mark.mjs`](scripts/lib/mark.mjs). Re-run them if the mark or the
accent moves. The web build runs both, so only the committed favicon — which
Expo turns into `dist/favicon.ico` — needs the manual pass.

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

## Who does what

| Role                           | GitHub access | Responsibilities                                                                                                                     |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Maintainer** (@achalagrawal) | Owner / admin | Reviews and merges every PR. Sole holder of production credentials (Convex prod, Vercel). Can bypass branch protection for hotfixes. |
| **Contributor**                | Write         | Pushes feature branches to this repo, opens PRs, reviews others' PRs.                                                                |
| **Tester**                     | Write¹        | Files and triages issues, verifies PRs, applies the `qa-*` labels. By convention does **not** push code or merge PRs.                |
| **Anyone else**                | —             | Fork the repo and open a PR. CI runs on forks with no secrets, so it works out of the box.                                           |

> ¹ **Known gap.** GitHub repositories owned by a personal account have exactly
> one collaborator level — write. The finer-grained **Triage** role (manage
> issues and labels, but no push) only exists on organization-owned
> repositories. So testers currently hold more access than their job needs:
> technically they can push branches and merge an approved PR. What actually
> holds the line is `main`'s branch protection plus this convention. If the team
> grows, move the repo into a (free) GitHub organization and drop testers to
> Triage.

Access is otherwise granted at the lowest level that does the job. If you need
more to do your work, ask — don't work around it.

## How a change lands

```
issue filed  ─►  branch + PR  ─►  CI + review  ─►  QA  ─►  squash-merge  ─►  prod
```

1. **Issue** — a tester or user files one from a template. It gets
   `needs-triage` until the maintainer confirms it and sets a `p0`/`p1`/`p2`.
2. **Branch** — contributors branch from `main` in this repo
   (`feat/…`, `fix/…`). No pushing to `main`; it's protected.
3. **PR** — fill in the template, including **How to test this**. That section
   is what the tester works from, so write it for someone who hasn't read the
   diff. Link the issue with `Closes #N`.
4. **CI + review** — `typecheck · test · format` must be green and the PR needs
   **1 approving review** from someone with write access. Review comments must
   be resolved before merge.
5. **QA** — once reviewed, label the PR `needs-qa`. A tester verifies it against
   the PR's preview deployment and comments with what they checked, then applies
   **`qa-passed`** or **`qa-failed`**. Backend-only, docs, and chore PRs skip
   this — note that in the PR body.
6. **Merge** — the maintainer squash-merges. The branch is deleted
   automatically and Vercel deploys `main` to production.

`qa-passed` is a convention, not an enforced check — nothing stops a merge
without it. It's a signal, so use it honestly.

### Testing a PR

You don't need to clone anything or be able to push. Open the PR, find the
preview deployment link on it, and test there. Every PR gets its own isolated
environment, so you can't damage real data. Report what you find as a comment on
the PR (for problems with that change) or as a new issue linked to it (for
pre-existing bugs you stumble across).

## Pull requests

- One feature/slice per PR; fill in the PR template.
- Working on `main` is fine to branch from, but open PRs from a branch.
- Every push to a branch gets a preview, and Vercel comments the URL on the PR —
  your branch running against a Convex backend of its own. That link is what a
  tester clicks. Sign in there with the email code; Google sign-in doesn't work
  on previews. Details and caveats: [`docs/deployment.md`](docs/deployment.md).
- `main` is protected: no direct pushes, no force-pushes, no deletion, and
  history stays linear (we squash-merge).
- We do not add "authored by / co-authored-by" trailers for AI tooling in commit
  messages.
- Never commit secrets. Push protection will block known key formats, but it
  can't catch everything — keep credentials in `.env.local` (git-ignored) and
  in the Vercel/Convex dashboards. Security issues go through
  [SECURITY.md](SECURITY.md), not a public issue.

## Working with Claude Code

This repo is set up so [Claude Code](https://claude.com/claude-code) can pick up
work with full context: `CLAUDE.md` and `AGENTS.md` point at the tracker and the
checks, so a fresh session reads `docs/build/FEATURES.md`, does a slice through
the loop above, and runs the checks before finishing.

Optional: to enable `@claude` on GitHub issues/PRs, run `/install-github-app`
from an interactive `claude` terminal — it provisions the workflow and the
`ANTHROPIC_API_KEY` secret together. (Not included here because it requires that
secret, which forks can't access.)
