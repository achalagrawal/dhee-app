# Spec: Enter sends the message

**Epic:** 2 — Composer
**Status when written:** ⬜ (Enter inserts a newline everywhere; only the send
button sends)

Issue [#76](https://github.com/achalagrawal/dhee-app/issues/76). ChatGPT, Claude
and Gemini all send on Enter. Dhee took Enter to the next line, so every message
on a laptop ended with a reach for the mouse — small, and paid on every single
turn.

The mockup already says so: `onKey` in
[`Dhee.dc.html`](../../../mockup/project/Dhee.dc.html) is
`if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }`.
The mockup is web-only, though, and Dhee also runs on phones — so the rule needs
one more idea than the mockup has.

## Behavioral contract

The line the three of them draw is **the device, not a setting**:

| Key                   | With a physical keyboard | On a touch device |
| --------------------- | ------------------------ | ----------------- |
| `Enter`               | send                     | newline           |
| `Shift`/`Alt`+`Enter` | newline                  | newline           |
| `Cmd`/`Ctrl`+`Enter`  | send                     | send              |

- **"Physical keyboard" is `(pointer: fine)` on web** — a mouse or trackpad is
  the primary pointer. It is the closest signal the platform gives us, and it
  re-evaluates live, so attaching a trackpad to a tablet flips the behaviour.
  Native iOS/Android is always touch: Enter stays a newline there, which is what
  the ChatGPT and Claude apps do too.
- **An IME beats everything.** Enter is how Devanagari and CJK input methods
  accept the candidate they are showing; sending on that would post half a word.
  `nativeEvent.isComposing` (or `keyCode === 229` on older browsers) means the
  key was never ours.
- **A send that can't happen still swallows the newline.** Empty input, or a
  reply already generating: the Enter does nothing and leaves no blank line
  behind.
- Focus stays in the box after sending — you can type the next message straight
  away.
- The send button is unchanged, and stays the whole story on touch.

No hint text: none of the three show one, and the composer is already busy.

## Backend contract

None. Functions touched: none. Schema changes: none.

## Tests (write first)

`src/lib/keyboard.test.ts` — the decision is a pure function over the event, so
it is tested directly, for both event shapes (web's DOM keydown, native's
`nativeEvent.key`-only):

- bare Enter sends where Enter sends, and is a newline where it isn't
- Shift+Enter and Alt+Enter are never a send
- Cmd+Enter and Ctrl+Enter send either way
- a composing event (`isComposing`, and `keyCode === 229`) is never a send
- every other key, and an empty event object, fall through untouched

## UI wiring

- New: `src/lib/keyboard.ts` (`composerKeyAction`, pure) and
  `src/lib/useEnterToSend.ts` (the `(pointer: fine)` hook).
- `src/components/Composer.tsx` — the composer on Home, Chat and Incognito.
- `MessageEditor` in `app/(app)/chat/[threadId].tsx` — editing and resending a
  message has the same Enter, alongside the Escape that already cancels.
- Single-line inputs (sign-in, rename, settings) already submit on Enter via
  `onSubmitEditing`; the freeform multiline fields in Settings and Understanding
  are prose, and keep Enter as a newline.

## Verification

- [x] `pnpm test` green.
- [x] Driven in the browser against the real `Composer` (throwaway route, deleted
      after): Enter sends and keeps focus; Shift+Enter falls through to the
      newline; Cmd/Ctrl+Enter sends; an Enter marked `isComposing` falls through;
      Enter on an empty or whitespace-only box neither sends nor leaves a line.
      With `(pointer: fine)` stubbed false — the preview browser won't emulate a
      coarse pointer — plain Enter falls through and Cmd+Enter still sends.
- [x] Flip status in `FEATURES.md`.
