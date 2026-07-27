# Spec: Markdown in assistant replies

**Epic:** 3 — Chat & messages
**Status when written:** ⬜ (no renderer exists; the prompt forbids markdown)

Issue [#63](https://github.com/achalagrawal/dhee-app/issues/63). Feedback from
testing: the old LibreChat deployment formatted answers, and that made them
easy to read. The new app renders assistant text into a bare `<Text>`, so the
prompt had to forbid markdown outright — a renderer-shaped hole, written into
the prompt as a rule about writing.

The decision here is that formatting helps: emphasis, a paragraph that breaks
where it should, a short list when someone asked for options. So both halves
land together — the renderer, and the prompt that is allowed to use it.

## What renders

A small markdown subset, parsed in-app. No new runtime dependency: the parser
is ~200 lines of pure TypeScript and the renderer is React Native primitives,
which is what keeps it working on web, iOS and Android alike.

| Syntax                          | Renders as                                |
| ------------------------------- | ----------------------------------------- |
| blank line                      | paragraph break                           |
| `**bold**` / `__bold__`         | semibold face                             |
| `*italic*` / `_italic_`         | italic                                    |
| `~~strike~~`                    | line-through                              |
| `` `code` ``                    | monospace on a tinted chip                |
| `# … ###`                       | headings, three sizes                     |
| `- item` / `* item` / `1. item` | bullet / numbered list, one nesting level |
| `> quoted`                      | quote with an accent rule down the left   |
| ` ``` ` fenced block            | monospace block, tinted, scrolls sideways |
| `---`                           | horizontal rule                           |
| `[text](https://…)`             | accent-coloured link, opens externally    |

Everything else is literal text. Unknown syntax must never disappear.

## Streaming contract

The parser runs on every delta, over the partial text. It therefore has to
behave sensibly on text that is cut mid-token:

- **Unclosed inline delimiter** (`he said **something`) renders literally, as
  the asterisks the person can see being typed. It does not bold the tail of
  the message and then un-bold it — a delimiter only takes effect once closed.
- **Half-open fence** (` ``` ` with no close yet) renders as a code block
  containing everything after it. Content accumulates inside the block instead
  of the block appearing after the fact.
- **Never throws.** Any input is a valid parse; the worst case is literal text.

## Prompt

`DHEE_INSTRUCTIONS` in [`convex/agents/dhee.ts`](../../../convex/agents/dhee.ts):
the Formatting paragraph flips from a ban to a permission — use formatting
where it aids reading, keep it light. Rule 2 (perspective, not lecture) is
untouched and is what still keeps replies from becoming bulleted advice; the
formatting rule no longer has to carry that job second-hand.

## Backend contract

- Functions touched: none. Schema changes: none.
- Only the prompt string changes, so the existing `buildSystemPrompt` tests
  (which assert composition, not wording) stay green.

## Tests (write first)

`src/lib/markdown.test.ts` — the parser is pure, so it is tested directly:

- each block type parses, with its inline spans
- `**` / `*` / `` ` `` left open render as literal text
- an unclosed fence captures the rest of the input
- `2 * 3 * 4`, `snake_case`, and a bare `#hashtag` are left alone
- escapes (`\*`) survive
- every prefix of a formatted message parses without throwing (streaming)

## UI wiring

- New: `src/lib/markdown.ts` (parser), `src/components/chat/Markdown.tsx`.
- Used by the assistant bubble in `app/(app)/chat/[threadId].tsx` and
  `app/(app)/chat/incognito.tsx`.
- **User bubbles stay plain.** People type asterisks and underscores meaning
  them; nothing is gained by interpreting a person's own message.
- **Copy stays raw.** The clipboard gets `message.text`, markdown and all —
  it is what pastes correctly into anywhere else.

## Verification

- [x] `pnpm test` green (parser tests + existing backend tests).
- [x] Visual check in the preview browser: a reply with bold, a list, a quote
      and a fence, in light and dark, at mobile width.
- [x] Flip status in `FEATURES.md`.
