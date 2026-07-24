# Build system — turning the design into the product

This folder is the **single source of truth** for building Dhee toward the final
design (the Claude Design bundle in
`~/Downloads/dhee-conversational-ai-for-life/project/Dhee.dc.html`).

Both a human and Claude Code should be able to open this folder and know, without
any chat history: what the product is meant to do, what's done, what's next, and
whether it still works.

## The three artifacts

1. **`FEATURES.md`** — the tracker. Every feature the design implies, grouped into
   epics, each with a status. **Start every session by reading this.** It tells you
   what's done and what to pick up next.
2. **`specs/<feature>.md`** — one short spec per feature. Written **just-in-time**,
   right before you implement that feature — not all up front. Each spec captures
   the mockup reference, the behavioral contract (the ChatGPT/Claude-style
   conventions, made explicit), and the backend contract.
3. **Tests** — the executable half of the spec, for backend/logic only
   (Vitest + `convex-test`). UI fidelity is verified visually against the mockup,
   not with brittle up-front tests.

## The per-feature loop

Every feature goes through the same five steps. This is the "consistent way of
developing" — the whole point is that it's identical every time, so it's
predictable and resumable.

1. **Spec** — write/confirm `specs/<feature>.md` from the mockup. Cheap; catches
   ambiguity before code.
2. **Backend contract** — TDD the Convex functions it needs: write a failing
   Vitest + `convex-test` test, then implement to green.
3. **Wire the UI** — build/replace the screen or control to match the mockup,
   using the real backend. Many controls already exist as `soon()` stubs in the
   Composer/Drawer — this step replaces the stub with the real thing.
4. **Verify** — visual check in the preview browser (web build) + screenshot; run
   the backend tests.
5. **Track** — flip the status in `FEATURES.md`, commit. One feature = one focused
   commit/PR.

## Running the backend tests

```bash
pnpm test          # run once (vitest run)
pnpm test:watch    # watch mode
```

Tests live next to the code as `convex/**/*.test.ts` and run on `convex-test`
(in-memory Convex — no `convex dev` needed). The shared harness is
`convex/test.setup.ts`: `initTest()` returns a test instance with the
`@convex-dev/agent` component registered; `createUser`/`asUser` handle auth.

**Caveat:** test files use Vite-only APIs (`import.meta.glob`) and import the
agent component's source, which `tsc` can't cleanly resolve through pnpm's nested
`node_modules`. So `convex/**/*.test.ts` and `test.setup.ts` are excluded from
both `tsconfig` typecheck passes — Vitest's own toolchain compiles and runs them.

## Rules of thumb

- **Don't** write tests for visual layout. The mockup specifies it better than any
  assertion. Test behavior with clear input→output.
- **Do** write down the ChatGPT/Claude conventions in the spec once (streaming,
  stop button, edit-and-resend, optimistic send, copy, regenerate). Applying them
  from a written spec is what keeps screens consistent.
- **Do** characterize existing backend before changing it — a test that captures
  current behavior is a regression net.
- Keep `FEATURES.md` honest. 🟡 means "partly there / stubbed", not "done".

## Status legend (used in FEATURES.md)

- ✅ **Done** — matches the design and is backed by real functionality.
- 🟡 **Partial** — UI shell exists but wired to a `soon()` stub, or backend exists
  but no UI, or exists but doesn't yet match the design.
- ⬜ **Not started** — neither UI nor backend.
