# Spec: Characterize the existing chat backend

**Epic:** 3 — Chat & messages (also underpins 1, 4, 5)
**Status when written:** ✅ backend exists — this spec adds the regression net, it
does not change behavior.

This is the **worked example** of the loop and the recommended first task. Its
goal is not new features but a test net around `convex/chat.ts` so every later
change to the chat spine is safe.

## Mockup reference

N/A — pure backend. The consumer UI is the home composer and `chat/[threadId]`.

## Behavioral contract (what the current code actually does — assert these)

From `convex/chat.ts`:

- **`sendMessage(threadId, prompt)`** (mutation):
  - Requires auth and authorizes the thread (`authorizeThread`) — unauthenticated
    or foreign thread → throws.
  - Saves the user message via the agent (`dhee.saveMessage`, `skipEmbeddings`).
  - Increments `threadMeta.turnsSinceExtraction` by 1 (from 0 if no meta row).
  - Schedules `internal.chat.streamReply` at delay 0.
  - Schedules `internal.memory.runExtraction` **only** when
    `turns >= MEMORY_EXTRACTION_INTERVAL_TURNS`.
- **`startThread()`** — requires auth; returns a new thread id.
- **`setStarred` / `setPinned`** — toggle flags; **`threadFlags`** reflects them.
- **`renameThread`** — trims; empty title throws "A conversation needs a name.".
- **`deleteThread` / `deleteAllThreads`** — remove thread(s) for the user only.
- **`setMessageFeedback` / `threadFeedback`** — persist and read back feedback.
- **`incognitoReply(messages)`** — requires auth; persists nothing
  (`saveMessages: "none"`, `recentMessages: 0`). Returns text.

## Backend contract

- No schema or code changes. Tests only.
- **Testable without an LLM (do these first):** the _bookkeeping_ in `sendMessage`
  (auth, authorization, turn counting, the two scheduler calls, the extraction
  threshold), plus `setStarred`/`setPinned`/`threadFlags`, `renameThread`
  validation, delete scoping, and feedback round-trip. Assert scheduled functions
  via `convex-test`'s scheduler inspection rather than running them.
- **Requires mocking the model:** `streamReply`, `titleThread`, `incognitoReply`
  all call `dhee.*` → the LLM. Stub the model provider (or the `dhee` wrapper) so
  tests are deterministic and offline. Keep these in a separate test file so the
  fast, no-network tests stay fast.

**Tests to write (define "done"):**

1. `sendMessage` throws when unauthenticated.
2. `sendMessage` throws for a thread the user doesn't own.
3. `sendMessage` on turn 1 schedules `streamReply` and does **not** schedule
   `runExtraction`.
4. `sendMessage` schedules `runExtraction` exactly when the turn count crosses
   `MEMORY_EXTRACTION_INTERVAL_TURNS`.
5. `renameThread("")` throws; `renameThread("  x  ")` stores `"x"`.
6. `setStarred(true)` then `threadFlags` shows starred; same for pinned.
7. `deleteAllThreads` removes only the caller's threads.
8. `setMessageFeedback` then `threadFeedback` returns the stored value.

## UI wiring

None.

## Verification — DONE (2026-07-24)

- [x] `pnpm test` green — **9 assertions** in `convex/chat.test.ts` (the 8 above,
      with star/pin split into two).
- [x] No behavior changed — tests describe the current code.
- [x] Harness proven end-to-end: `vitest` + `convex-test` wired into
      `package.json` (`test` / `test:watch`), agent component registered.
- [x] LLM never invoked — `streamReply`/`titleThread` are only _scheduled_, and
      the suite asserts against `_scheduled_functions` without running them
      (617ms, no network).

## Notes on tooling (as implemented)

- Dev deps added: `vitest`, `convex-test`, `@edge-runtime/vm`.
- `convex-test` runs Convex functions in-memory (no `convex dev` needed).
- The `@convex-dev/agent` component is registered in `convex/test.setup.ts` via
  its `src/component` source (imported by file path to bypass the package's
  `exports` field). No model stub was needed because the LLM-touching functions
  are only scheduled, not run — a genuine model stub is still required for the
  _next_ step (actually exercising `streamReply`/`incognitoReply`).
- Test files are excluded from `tsc` (see README caveat).
