# Spec: chat loop conventions

**Epic:** 3 — Chat & messages
**Status when written:** 🟡 — streaming, thinking, copy and feedback exist; stop,
regenerate and edit-and-resend are `soon()` stubs.

This spec exists so the rest of Epic 3 (#13 stop, #14 regenerate, #15 edit &
resend, #16 streaming polish, #17 scroll) can be built **without reopening the
mockup**. It writes down the ChatGPT/Claude conventions once, and records where
Dhee's build deliberately differs from the prototype.

## Mockup reference

- File: `mockup/project/Dhee.dc.html`
- Chat transcript + composer dock: ~408–600. Edit-in-place bubble: ~431–441.
  Error card: ~510–518. Scroll-to-latest button: ~521–526.
- Handlers: `stopGeneration` ~2389, `startEditMessage`/`saveEditMessage`
  ~2405–2416, `regenerate` ~2717, `retry` ~2715, `runModel` ~2695–2713,
  `onMainScroll`/`scrollToLatest` ~2841–2850, pull-to-refresh ~2828–2838.
- State keys: `thinking`, `aborted`, `editingIndex`, `editDraft`, `chatError`,
  `showScrollBtn`, `pullDist`, `refreshing`.

### Where our build differs from the prototype, on purpose

The mockup is a **local-state prototype**: threads live in a plain object,
`regenerate` pops the last element off an array, `stopGeneration` clears a
`setInterval`, and streaming is a fake word-by-word reveal of an
already-complete string.

Dhee's build goes through `@convex-dev/agent` and a real message store, so:

| Prototype                                      | Dhee                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `msgs.pop()` to regenerate                     | a **backend mutation** deleting a message from the agent component's store  |
| `clearInterval` to stop                        | `abortStream` — the model call must actually end, server-side               |
| streaming = revealing a string already fetched | real deltas persisted by `saveStreamDeltas`, synced over websockets         |
| `aborted` is a client boolean                  | abort is durable thread state; a reload must not resurrect a stopped stream |
| edit truncates an array                        | `deleteMessageRange` over a real order range, plus feedback-row cleanup     |

The practical consequence: **every destructive action in this spec is a
mutation, not a client-side state change**, and each one has to be authorized
against the thread's owner.

## Behavioral contract

### 1. Optimistic send

The current implementation in `app/(app)/chat/[threadId].tsx` is the pattern —
write it down rather than change it:

- The draft is cleared **before** the mutation resolves; the user bubble appears
  from the live query as soon as `sendMessage` commits.
- On rejection: the draft is **restored to the composer** and a retry card
  appears below the transcript. Nothing is silently lost.
- The composer is never disabled while a reply generates. A person may queue a
  follow-up thought; sending is only blocked on an empty draft.

### 2. Streaming

- Deltas are persisted server-side (`saveStreamDeltas`) so a reload mid-stream
  resumes rather than restarts.
- Cadence: `{ chunking: "word", throttleMs: 100 }` in `chat.streamReply`. This is
  the tuning knob for #16 — change it there, not in the client.
- **Caret**: shown only while `status === "streaming"`. It must disappear the
  instant status leaves `streaming`, and must not reflow the last line.
- **Actions row** (copy / feedback / regenerate) appears when the message is
  `done` — `status` of `success` or `failed`. It must not appear mid-stream.
- A `failed` message with no text renders as a failure surface (§7), **not** as
  an empty bubble with a copy button.

### 3. Thinking indicator

- "Dhee is considering…" (`i18n` key `thinking`) shows **only before any
  assistant text exists** — i.e. the last message is a user turn, or is an
  assistant turn that is `pending`/`streaming` with empty text.
- The moment the first delta arrives it is replaced by the streaming bubble.
  Never both at once.
- Already implemented. This section exists so a refactor doesn't lose it.

### 4. Stop (#13)

- The Stop button replaces Send while `generating`. It is the only control that
  changes shape during generation.
- **What a stopped message leaves behind:** the partial text is **kept and stays
  readable**. A stop is "that's enough", not "undo".
- A stopped message is treated as **done**: the actions row appears exactly as on
  a completed reply, including regenerate.
- **Not resumable.** There is no "continue". The way forward from a stopped reply
  is regenerate (#14) or a new message. This is deliberate — resuming a
  half-finished thought produces worse writing than starting the thought again.
- The button reverts to Send immediately. Stopping must never leave a stuck
  `generating` state, including when the abort races the stream finishing on its
  own — an abort with no active stream is a **no-op, not an error**.
- The abort must end the **model call**, not just hide output. A stop that keeps
  burning tokens server-side is not a stop.
- **Titling still happens.** A thread stopped on its first turn must not stay
  "New conversation" forever; if there is enough text to label, `titleThread`
  runs anyway.

### 5. Regenerate (#14)

- **Replaces, never appends.** The discarded reply is removed from the message
  store; there is no "1 of 2 responses" browser at launch. If that is wanted
  later it is a schema change, not a UI toggle — decide it then, not by
  accidentally leaving orphan rows now.
- Offered on the **last assistant message only**. Regenerating mid-thread would
  fork history, which is #15's job and has different truncation semantics.
- **Disabled while generating**, and refused server-side if a stream is already
  active on the thread.
- **Feedback on the discarded reply is deleted.** A thumbs-down is what usually
  triggers a regeneration; inheriting it onto the replacement is wrong.
- **Does not count as a user turn** — `threadMeta.turnsSinceExtraction` is
  unchanged, or memory extraction fires early on a conversation that didn't
  actually advance.
- **Does consume the daily allowance** (#7). It is a real model call. Recorded
  here and in the limits spec so the two don't disagree.
- Titling is unchanged: `titleThread` no-ops when a title exists, so regenerating
  turn one keeps the first title. Accepted.

### 6. Edit & resend (#15)

- Only a **user** message can be edited. An assistant message is never rewritten
  — that would put words in Dhee's mouth and poison memory extraction.
- The bubble becomes an inline editor holding the current text. Save re-sends
  from that point; Cancel restores; Escape cancels.
- **Everything after the edited turn is dropped.** The conversation forks and the
  old branch is not recoverable.
- **This is destructive, so it confirms** when more than the immediately
  following reply would be lost — i.e. when the edited message is not the last
  user turn. Editing the newest turn (losing only its reply) proceeds silently.
  Use `src/components/ConfirmDialog.tsx`.
- An empty or whitespace-only edit is rejected, mirroring `renameThread`'s
  "A conversation needs a name." style.
- **Refused while a reply is in flight**, with the same guard regenerate uses —
  deleting the pending reply would pull it out from under the running action.
  The edit affordance is hidden while generating; the way to edit mid-reply is
  to stop first.
- **Does not double-count turns**: the edited turn replaces a turn, it does not
  add one.
- **Feedback rows for the dropped assistant messages are cleared**, same as #14.
- **Counts as a message** under #7.
- **Known gap, accepted for launch:** if memory extraction already ran over the
  discarded turns, `observations`/`inquiries` rows may reference a conversation
  that no longer says what it said. The mitigation is that the memory layer is
  user-visible and editable on the "Dhee's understanding of you" screen. Not a
  blocker; do not silently re-run extraction to "fix" it.

### 7. Failure surfaces

There are **three** distinct reasons a turn can fail, and they must not all
render as one generic "something went wrong" (mockup: `chatError` is
`null | 'error' | 'rate'`, with different copy per value — ~3656–3658):

| Reason                       | Surface                                                          | Recovery                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Model / network error**    | Retry card below the transcript. Draft restored to the composer. | Try again retries the action that failed — a failed regenerate retries the regeneration, a failed edit the same rewrite. |
| **Stopped by the user**      | **No error surface at all.** Partial text + normal actions row.  | Regenerate, or keep typing.                                                                                              |
| **Daily limit reached** (#7) | Limit card in the composer dock, with when the limit resets.     | Not a retry — the upgrade path (#10).                                                                                    |

A stop is not a failure. This is the single most important line in this section:
if stopping shows an error card, the feature reads as broken.

### 8. Scroll (#17)

- Auto-scroll to the newest message is allowed **only when the user is already
  near the bottom** (threshold: within ~240px, matching the mockup's
  `fromBottom > 240` in `onMainScroll`).
- As soon as the user scrolls away from the bottom, auto-scroll **stops** —
  including mid-stream, where content size changes on every chunk. Scrolling up
  to re-read something must not yank the view back down.
- A **scroll-to-latest button** appears whenever auto-scroll is suppressed: a
  38px circular `surface` button with a down chevron, centered above the composer
  dock. Tapping it scrolls to the newest message and hides itself. The button is
  what makes suppressing auto-scroll safe — there is always a way back.
- Opening a thread from history lands at the newest message **without animating**
  through the whole transcript.
- **Pull-to-refresh is not implemented.** Convex's live queries mean there is
  nothing to refetch; the mockup's 650ms fake spinner would be a lie. Recorded as
  a deliberate omission rather than a gap.

## Backend contract

Functions this spec governs (implemented by the issues named):

| Function                                          | Issue | Notes                                                   |
| ------------------------------------------------- | ----- | ------------------------------------------------------- |
| `chat.sendMessage(threadId, prompt)`              | done  | Optimistic-send contract above.                         |
| `chat.stopGeneration(threadId, ...)`              | #13   | Authorized; no-op when no active stream.                |
| `chat.regenerate(threadId)`                       | #14   | Refuses while streaming; clears feedback; no turn bump. |
| `chat.editAndResend(threadId, messageId, prompt)` | #15   | User messages only; truncates; clears feedback.         |

Rules that hold for **all** of them:

- Every entry point calls `authorizeThread` first. A thread belongs to one
  person and no mutation may touch another person's conversation.
- Destructive work happens in a **mutation**, so it is transactional; the model
  call is always a scheduled action afterwards.
- **Tests never invoke the model.** `streamReply` is only _scheduled_; assert
  against `_scheduled_functions` and the component's message/stream rows. See
  `CLAUDE.md`.

## UI wiring

- `app/(app)/chat/[threadId].tsx` — transcript, message actions, scroll, edit
  state, failure surfaces.
- `src/components/Composer.tsx` — already accepts `generating` / `onStop`; #13
  replaces the `soon()` alert with the real mutation.
- `src/components/ConfirmDialog.tsx` — the destructive-edit confirm in #15.
- All new copy goes in `src/lib/i18n.ts`, English **and** Hindi.

## Verification

- [ ] Backend tests green (`pnpm test`) for each implementing issue.
- [ ] Stop verified on a real deployment: the model call ends, not just the UI.
- [ ] Scrolling up mid-stream stays put, on web and iOS.
- [ ] The three failure surfaces in §7 are visibly distinct.
- [ ] `FEATURES.md` Epic 3 rows flipped as each issue lands.
