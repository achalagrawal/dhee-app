# Spec: Photo attachments

**Epic:** 2 — Composer (with the storage half of Epic 11 — Attachments & media)
**Status when written:** 🟡 (the composer's `+` is a `soon()` stub; no backend)

Issue [#96](https://github.com/achalagrawal/dhee-app/issues/96): "The file and
photo attachment on the ask box should work." The `+` button has been rendered
for fidelity since the shell landed and pops "coming soon" — a control in the
place people touch most that does nothing.

This ships **photos only**, into saved threads. Documents (PDF/MD/TXT/DOC),
drag-and-drop on web, the lightbox, and incognito attachments are deliberately
out — each is its own row in `FEATURES.md` and none of them is needed for the
button to stop lying. What they need is written down under "Not in this slice"
so the next person doesn't have to re-derive it.

## Mockup reference

- File: `mockup/project/Dhee.dc.html`
- Composer chips: around line 307 — a wrapped row above the textarea, each
  attachment an inline chip (`--surface-2`, 1px `--border`, radius 10, 13px
  text, ellipsized at 200px) with a leading glyph, the filename, and a `×`.
- In the transcript: around line 419 — attachments render **above** the user
  bubble, right-aligned, images as 120×120 `object-fit: cover` thumbs with
  radius 12 and a 1px border.
- One deviation: the chip's leading glyph slot holds a small rounded thumbnail
  of the photo rather than a generic icon. Same geometry; a filename like
  `IMG_4821.jpg` says nothing about which photo it is. The generic icon is
  still right for documents when they land.

## Behavioral contract

- The `+` opens the photo library directly. The mockup's attach _menu_ (files,
  photos, web search) waits until there is more than one thing on it.
- Multiple photos per message. Each is uploaded as it is picked, so the send is
  instant rather than uploading a batch on submit.
- A photo appears as a chip the moment it is picked, dimmed while uploading.
  Send is disabled while any upload is in flight.
- **Send is enabled by a photo alone** — text is not required. An image-only
  message is a real question ("what is this?").
- `×` on a chip removes it and deletes the upload server-side. Removing before
  the upload finishes is allowed; the discard runs when it lands.
- A failed upload drops the chip and says why — too large, or not a photo, or
  the ordinary "something went wrong". It never blocks the text already typed.
- Attachments clear once the send lands, not before: a send that fails keeps
  its photos so retry resends the same message rather than the words alone.
- In the transcript, photos sit above the user's bubble, right-aligned. A
  message with photos and no text renders the photos and no empty bubble.
- Tapping a thumbnail does nothing yet (the lightbox is Epic 3, unbuilt).
- **Editing a message keeps its photos.** The edit box rewrites text only; the
  resent turn carries the same images. Silently dropping them would delete
  someone's photo out of their conversation through a button labelled "edit".
- Incognito's composer keeps the `soon()` stub — nothing is saved there, and
  the file store is a saved thing.

## Backend contract

New module `convex/attachments.ts`. Uploads go to app file storage first (the
same two-step the avatar already uses), then get registered with the agent
component, which is what makes the file a first-class part of a message and
gives it a refcount.

- `attachments.generateUploadUrl()` → `string`. Signed-in only.
- `attachments.attach({ storageId, mediaType, filename? })` →
  `{ fileId } | { error }`. Refuses anything not `image/*`, anything over
  `MAX_ATTACHMENT_BYTES` (5 MB — the per-image ceiling the model accepts), and
  any upload whose stored `contentType` contradicts the declared `mediaType`.
  A refusal deletes the blob, so nothing is left behind. Otherwise registers
  via `components.agent.files.addFile`, which starts the file at refcount 0.

  **A refusal returns; it does not throw.** A mutation that throws rolls its
  whole transaction back, cleanup delete included, so a thrown refusal would
  leave in storage exactly the file it refused. The error is a code
  (`notPhoto` / `tooLarge` / `mismatch` / `missing`) rather than a sentence,
  which also keeps the wording — and both languages — on the client.

  `mediaType` is declared by the caller rather than read off storage because
  it labels the message part too; the cross-check against storage's own
  `contentType` is what stops a client claiming `image/png` over a PDF.

- `attachments.discard({ fileId })` → `null`. For `×` before send. Refuses a
  file already referenced by a message (refcount > 0), deletes the component
  row and the underlying blob otherwise.
- `chat.sendMessage` gains `fileIds?: string[]`. With files it saves a
  content-part message — image parts then the text part — and passes
  `metadata: { fileIds }`, which is what takes each refcount to 1. Empty text
  **and** no files is now refused; before, an empty prompt was saveable.
- `chat.editAndResend` carries the target message's image parts and `fileIds`
  onto the replacement.
- `streamReply` is untouched. It resolves the turn by `promptMessageId`, so
  image parts reach the model with no change at all.

Schema changes: none. The agent component owns the `files` table; `threadMeta`
is unaffected.

**Tests (write first)** — `convex/attachments.test.ts`:

- `generateUploadUrl` and `attach` throw when unauthenticated.
- `attach` registers an image: a component `files` row exists at refcount 0.
- `attach` refuses a non-image, and the blob is gone afterwards.
- `attach` refuses a file over the cap, and the blob is gone afterwards.
- the same photo twice registers once, and the duplicate's bytes are dropped.
- `discard` removes both the component row and the blob.
- `discard` on an already-gone photo is a no-op, not an error.
- `discard` refuses a file that a message already references.
- an attached photo is a vacuum candidate (`files.getFilesToDelete`) until it
  is sent, and not one afterwards.

Not covered: the `mediaType` cross-check. `convex-test`'s storage fake records
only size and sha256, so the `contentType` it reads is always undefined there.
It sits behind the `image/*` rule, which is covered.

…and in `convex/chat.test.ts`:

- `sendMessage` with a fileId saves a user message carrying an image part and
  the text, records `fileIds` on the doc, and takes the refcount to 1.
- several photos keep the order they were picked in.
- `sendMessage` with a fileId and no text is accepted and schedules a reply.
- `sendMessage` with neither text nor files is refused.
- `sendMessage` rejects an unknown fileId.
- a turn without photos still saves a plain string prompt and no `fileIds` —
  the shape every message had before this existed.
- `editAndResend` on a message with a photo keeps the image part and `fileIds`.

## UI wiring

- New hook `src/lib/useAttachments.ts` — pick, upload, remove, clear, plus the
  in-flight flag. Both composers use it; neither owns the upload logic.
- `src/components/Composer.tsx` — new optional `attachments` /`onPickPhoto` /
  `onRemoveAttachment` props and the chip row. **Replaces the `soon()` stub on
  `+`** when `onPickPhoto` is given; without it (incognito) the stub stays.
- `app/(app)/home.tsx` and `app/(app)/chat/[threadId].tsx` — pass the hook
  through and send `fileIds`.
- `app/(app)/chat/[threadId].tsx` — the user bubble renders image parts off
  `message.parts`, and stops returning `null` for a message that has photos
  but no text.

## Not in this slice

- **Documents** (PDF/MD/TXT/DOC) — needs `expo-document-picker`, a wider
  content-type allowlist in `attach`, and the doc chip in the transcript. The
  model already accepts PDFs, so this is mostly UI.
- **Drag-and-drop** (web) — `state.dragOver` in the mockup.
- **Lightbox** — Epic 3, `state.lightbox`.
- **Incognito attachments** — its reply path sends `{role, text}` pairs and
  persists nothing; images would need a separate, storage-free route.
- **Vacuuming orphans.** `discard` covers the common case (picked, then
  removed). Two paths still leave a refcount-0 row and its blob: quitting with
  attachments pending, and deleting a message or thread that had photos. The
  component exposes `files.getFilesToDelete` for exactly this; it wants a cron,
  and belongs with Settings → "manage storage" (Epic 9).
- **Access control on the image URL.** A Convex storage URL is unguessable but
  public, which is what the avatar already does. Worth revisiting with the rest
  of the privacy hardening before public launch, not during closed beta.
- **Photos in a shared conversation.** `convex/share.ts` deliberately sends
  only role and text — file ids never leave the server — so a shared link
  leaks no photo, which is the right default. The side effect is that it also
  drops messages with no text, so a photo-only turn vanishes from the shared
  copy and leaves Dhee answering a question that isn't there. Whether a shared
  conversation should carry its photos at all is a product decision, not a
  bug; until it is made, the safe behaviour is the one in place.

## Verification

- [x] `pnpm test` green (298 tests, 16 files).
- [x] `pnpm typecheck` and `pnpm format:check` green.
- [ ] **Still owed:** visual check in the preview browser — chip row in the
      composer, dimming while an upload is in flight, thumbs above the user
      bubble, a photo-only turn, light and dark, at mobile width. Not run: it
      needs `convex dev` to push `attachments.*` to a dev deployment, which
      this worktree isn't configured for.
- [x] Flip the Epic 2 attachments row and the Epic 11 storage rows in
      `FEATURES.md`.
