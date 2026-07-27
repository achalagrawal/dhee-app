# Spec: share a conversation by link

**Epic:** 15 — Sharing
**Status when written:** ⬜ both rows

Closes #98 (share should be a real, prominent control in the thread header) and
#65 (the ⋯ menu's Share is a `soon()` stub and a tester reported it as broken).
#65's "fix now" was to hide the stub; this spec is its "fix properly, later",
and landing it makes the hide unnecessary.

## Mockup reference

- File: `mockup/project/Dhee.dc.html`
- Share modal: `<!-- ===== SHARE MODAL ===== -->`, ~1078–1110. A dialog headed
  "Share this" with the subtitle **"Anyone with the link can read it."**, an
  optional preview card of the shared body, a `Share as card` button, and a
  read-only link row with a **Copy link** button.
- Behaviour helpers: `openShare` / `closeShare` / `copyShareLink` /
  `buildShareLink`, ~2419–2437.

The mockup's `buildShareLink` encodes the whole conversation into the URL
fragment (`#share=<base64>`). That is a prototype trick for a thing with no
backend — it makes links unrevocable and unbounded in length. We store a row and
mint a slug instead. Everything else in the modal is taken as specified.

## What is being shared

**A snapshot of one conversation, read-only, at the moment Share was pressed.**

Not a live mirror. Someone who shares a thread and then keeps talking has not
consented to the rest being published, and a link that keeps growing after the
fact is the failure mode people actually get bitten by. The snapshot boundary is
the last message in the thread at share time, stored on the share row as
`throughMessageId` and passed to the agent component's
`upToAndIncludingMessageId`. Re-pressing Share re-snapshots to the current end —
extending a share is a deliberate act, not a side effect of chatting.

**The boundary is a turn, not a message.** The agent component gives an
assistant reply the same `order` as the prompt it answers, so a thread shared
while Dhee is still replying publishes that reply when it lands. This is
deliberate: sharing mid-reply is common, and the alternative is a link that
shows a question with no answer until the author notices and re-shares. Nothing
at a _later_ order — anything said next — is ever included.

**A rewrite revokes the link.** Edit-and-resend and regenerate delete messages,
and their replacements take the same `order` numbers the deleted ones had, so
neither the boundary id nor the order bound can tell the new conversation from
the published one. When a deletion reaches inside the snapshot
(`order <= throughOrder`), the share is revoked rather than re-pointed: whoever
holds the link was given a particular exchange, and once that exchange is gone
the honest answer is that the link is dead. Rewriting a turn _after_ the
boundary changes nothing anyone holds a link to and leaves the share alone.

**An empty conversation can't be shared.** There is no boundary message to
snapshot at, and a link to nothing is worse than no link.

### What a reader sees

Role and text, and nothing else:

- **Every reply is markdown text only.** Tool calls, tool results, reasoning
  traces, file ids and message metadata never leave the server. The public query
  returns `{ key, role, text }`, not `UIMessage`. A reader's client cannot
  request more, because more is never sent.
- **No feedback, no marks.** Thumbs, edited and stopped labels are the author's
  own annotations of their conversation; they are not part of what was said.
- **Only successful messages.** `statuses: ["success"]` — a pending or failed
  turn is a UI state of the author's session, not content.
- Thread title, frozen at share time. A later rename doesn't rewrite a page
  other people already hold a link to.

### What cannot be shared

- **A crisis-flagged thread.** `threadMeta.crisisFlagged` is sticky for the life
  of a thread ([`schema.ts`](../../../convex/schema.ts)) and is raised by
  something the person wrote suggesting they may be in danger. Publishing that
  is the worst outcome this feature can produce, so the mutation refuses. The
  UI hides the control rather than offering a button that throws.
- **Incognito conversations**, which have no thread to point at.

### The personalization question #65 raises

#65 asks whether the personalization block — nickname, occupation, about-you,
tradition lens, and the layer-3 memory context — makes sharing a companion
thread different from sharing a document. It does, but not by leaking: none of
that text is in the transcript. What it does is _shape_ the replies, so a shared
thread can read as unexpectedly well-informed about its author without ever
quoting the source.

That is a disclosure the sender should make knowingly, not a bug to fix in the
query. So the modal says what it is sharing before the link exists, and the
answer here is one line of copy rather than a filter.

## Revocation

- **Unshare kills the link permanently.** The row is kept with `revokedAt` set,
  and a revoked slug is never reissued. Sharing again mints a _new_ slug. A link
  someone sent to the wrong person must stay dead even if they later re-share.
- At most one active (non-revoked) row per thread. Older revoked rows accumulate
  as tombstones; they are small and they are what makes "never reissued" true.
- **Deleting the thread deletes every share of it.** `deleteThread` and
  `deleteAllThreads` already clean up `threadMeta` and `messageFeedback`; share
  rows join that list. A shared page whose thread is gone must 404, not serve a
  cached copy — the messages live in the agent component and go with it, but the
  row would otherwise survive and point at nothing. Deleted rather than
  tombstoned: the slug can't be reissued because the thread it named is gone.
- **A crisis flag raised _after_ sharing does not revoke.** The flag is about
  the author's safety, and pulling a link out from under them without a word is
  its own harm. Refusing new shares is the guard.
- A missing slug, a revoked slug and a deleted thread are **indistinguishable**
  to a reader: all three return `null`. Distinguishing them would turn the
  public query into an oracle for which slugs once existed.

## Behavioral contract

- Share is a **first-class control in the thread header**, next to ⋯ — #98's
  ask, and the reason the ⋯ entry alone wasn't enough.
- Pressing Share opens the modal and creates the link in the same step, matching
  the mockup's `openShare` (which mints, opens and copies together). No
  two-stage "create a link?" confirm.
- The link is copied to the clipboard on open, and **Copy link** re-copies with
  a "Link copied" flash.
- Already shared: the modal opens on the existing link, with **Update** (re-snap
  to the current end) and **Unshare** alongside it.
- The reader's page needs no account and no sign-in redirect, on web and in the
  app.
- Offline / failure: the modal reports the failure rather than showing a link
  that was never stored.

## Backend contract

New file `convex/share.ts` — the public read path is the only unauthenticated
surface in the app, and it should be readable in one screen rather than buried
in `chat.ts` among functions that all begin with an authorization call.

**Schema** (`convex/schema.ts`), new table:

```ts
sharedThreads: defineTable({
  userId: v.id("users"),
  threadId: v.string(),
  slug: v.string(),
  title: v.optional(v.string()), // frozen at share time; unset until named
  throughMessageId: v.string(), // snapshot boundary
  throughOrder: v.number(), // …and its order, since the id can be deleted
  createdAt: v.number(),
  revokedAt: v.optional(v.number()),
})
  .index("by_slug", ["slug"])
  .index("by_thread", ["threadId"])
  .index("by_user", ["userId"]);
```

**Functions:**

| Function                   | Auth   | Args → returns                                               |
| -------------------------- | ------ | ------------------------------------------------------------ |
| `share.shareThread`        | author | `{ threadId }` → `{ slug }`                                  |
| `share.unshareThread`      | author | `{ threadId }` → `null`                                      |
| `share.shareForThread`     | author | `{ threadId }` → `{ slug, sharedAt } \| null`                |
| `share.sharedConversation` | public | `{ slug }` → `{ title, sharedAt } \| null`                   |
| `share.listSharedMessages` | public | `{ slug, paginationOpts }` → paginated `{ key, role, text }` |

- The two public queries call `requireUserId` **never**. That is the whole of
  what makes them public, and it is why they live in their own file.
- `listSharedMessages` returns an empty page rather than throwing when the slug
  is unknown — a reader following a dead link gets the "not available" page, not
  an error boundary.
- Messages are read through `components.agent.messages.listMessagesByThreadId`
  directly rather than the `listUIMessages` helper, because only the component
  query takes `upToAndIncludingMessageId`. `order: "asc"` — a shared page reads
  top to bottom.
- Slugs are 20 hex characters from `crypto.randomUUID()`. Unguessable is the
  entire access control; a sequential or thread-derived id would let anyone
  enumerate shared conversations.
- `share.ts` also exports three helpers `chat.ts` calls, rather than reaching
  into `sharedThreads` from there: `deleteSharesForThread`,
  `deleteSharesForUser` (the two delete paths) and `revokeSharesTouching`
  (`regenerate` and `editAndResend`, called with the doomed messages _before_
  they are deleted).

**Tests (write first)** — `convex/share.test.ts`:

1. `shareThread` and `unshareThread` on someone else's thread throw
   `Not your conversation`; unauthenticated throws `Not signed in`. So does
   `shareForThread`, which would otherwise report whether a stranger's
   conversation is public.
2. A shared thread's messages are readable **with no identity at all** — the
   test that defines the feature.
3. The snapshot holds: messages sent after sharing are not in the public read.
4. A reply that lands after sharing completes its own turn (the mid-reply case).
5. Re-sharing extends the snapshot to the current end and keeps the same slug.
6. Editing inside the snapshot revokes the link; regenerating a shared reply
   revokes it; editing a turn past the boundary leaves it alone.
7. `unshareThread` makes the slug return `null` from both public queries, and is
   a no-op rather than an error when there is nothing to revoke.
8. Re-sharing after revoking mints a **different** slug, and the old one stays
   dead.
9. A crisis-flagged thread refuses to share; a flag raised after sharing leaves
   the existing link alone.
10. Only role and text cross the boundary: the returned objects have exactly the
    keys `key`, `role`, `text`. This is the regression net for the whole privacy
    argument above — a future refactor to `UIMessage` would ship tool calls and
    reasoning to anonymous readers, and only this test would notice.
11. Failed and pending messages are excluded.
12. `deleteThread` removes the share row and the slug then returns `null`;
    `deleteAllThreads` kills every link.
13. An unknown slug returns `null` / an empty page rather than throwing.
14. The title is frozen: renaming the thread after sharing doesn't change what
    the public query returns.
15. An empty conversation refuses to share.

## UI wiring

- `app/s/[slug].tsx` — the public reader. **Outside `app/(app)/`**, because the
  auth gate that redirects to `/sign-in` lives in that group's `_layout.tsx`;
  the root layout supplies the Convex client, so a route outside the group is
  signed-out-capable with no new plumbing. `vercel.json` already rewrites
  `/(.*)` → `index.html`, so no rewrite is needed either.
- A read-only message renderer over `Markdown` + `DheeAvatar`. **Not** an
  extraction of `Message` from [`chat/[threadId].tsx`](<../../../app/(app)/chat/[threadId].tsx>):
  that component is woven through feedback, edit, regenerate and mark state, and
  a reader has none of those. A separate simpler renderer is the smaller change.
- A footer on the shared page saying what Dhee is, linking to the site. The page
  is the product's most public surface.
- `src/components/ShareSheet.tsx` — the modal. It mints on open, copies the
  link, and offers Update / Stop sharing once one exists.
- `src/lib/share-url.ts` — `<site>/s/<slug>`, preferring the browser's own
  origin so a link minted on a Vercel preview opens on that preview rather than
  on production, where the row doesn't exist. It reads `window.location`
  directly rather than importing `Platform`: pulling react-native in would drag
  Flow-typed source into the Vitest run and cost the module its unit test.
- `src/components/ThreadMenuSheet.tsx` — the `soon()` stub becomes an `onShare`
  callback, and the row is **omitted** when the caller passes none (#65). The
  sheet lives with the caller because the header opens the same one.
- `app/(app)/chat/[threadId].tsx` — a share `IconButton` joins `plus` and `dots`
  in the header (#98). Both entry points are hidden on a crisis-flagged thread,
  which the mutation refuses anyway.
- **The threads list keeps no share row.** Its ⋯ menu has no crisis flag to
  check (`chat.threadFlags` doesn't carry one), so offering share there would
  mean either a button that sometimes fails or widening that query. Sharing is
  reached from inside the conversation.
- Copy in `src/lib/i18n.ts`, English and Hindi, like the rest of the chrome.

**Link previews are out of scope.** `output: "single"` means every route serves
one static `index.html`, so a shared link pastes into WhatsApp with generic Dhee
metadata and no title. Per-share OG tags need a Convex HTTP route or a Vercel
function; that is its own change, and this feature is useful without it.

## Verification

- [x] Backend tests green (`pnpm test`) — 26 in `convex/share.test.ts`, 3 in
      `src/lib/share-url.test.ts`.
- [x] `pnpm typecheck` and the web bundle (`pnpm build:web`) build with the new
      route.
- [ ] A link opened in a signed-out browser renders the conversation. **Needs a
      dev deployment** (`npx convex dev` — the schema and `share.ts` have to be
      pushed before any of the below can run).
- [ ] Unshare, then reload the same link → not available.
- [ ] Share, send another message, reload the link → the new message is absent.
- [ ] Edit a shared turn → the link dies rather than showing the rewrite. This
      is the one that was wrong on the first pass and is worth doing by hand.
- [ ] Screenshots of the modal and the public page, both themes.
- [x] Flip the Epic 15 rows in `FEATURES.md`.
