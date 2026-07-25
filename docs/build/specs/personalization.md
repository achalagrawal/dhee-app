# Spec: personalization (tradition lens + "more about you")

**Epic:** 8 — Memory & personalization
**Status when written:** ⬜ both rows

Two features, one spec, because they are the same mechanism: a user-editable
field that changes the system prompt. Written before #23, #24 and #25 so the
prompt gets assembled once rather than acquiring a string parameter per issue.

## Mockup reference

- File: `mockup/project/Dhee.dc.html`
- "More about you" inputs: ~1396–1405 (nickname / what you do / about you)
- Tradition lens section: ~1407–1414; helpers `lensList` / `toggleLens` /
  `addDraftLens` / `clearLenses` at ~2967–2978
- `TRADITIONS` (25 entries): line 1970
- Prompt assembly: ~2645–2652
- Onboarding tradition step: ~1643
- Free tier gets one lens: `PRICING`, ~2140–2141

## The Rule 1 decision

`DHEE_INSTRUCTIONS` in `convex/agents/dhee.ts` forbids ever using the corpus's
terms of art — "not even in parentheses, not even to define them" — and names
**madhyasth darshan** among them. Madhyasth Darshan is the second entry in the
design's tradition list. Someone who picks it as their lens is asking for
exactly what Rule 1 forbids.

**Decision: an explicit lens unlocks that tradition's vocabulary, for the
person who named it.**

This deliberately narrows Rule 1 rather than working around it. The reasoning:
Rule 1 exists to protect people who don't know the vocabulary and would be
alienated or confused by it. Someone who types "Madhyasth Darshan" into a
settings field has told us they are not that person. Continuing to withhold the
words they themselves used would be talking down to them. The mockup's own
copy takes the same line — "If you follow a framework of thought, Dhee can use
its vocabulary. A lens, not doctrine."

**The unlock is narrow. All of these still hold:**

1. **Default is unchanged.** Rule 1 applies in full to everyone who has not
   named a lens. That is the overwhelming majority, and the product's voice for
   them is exactly what it is today.
2. **Only the named tradition's vocabulary.** Naming Stoicism does not unlock
   the corpus's Sanskrit terms. Naming Madhyasth Darshan does not unlock
   Jungian jargon.
3. **The guardrail travels with the instruction.** The lens sentence must, in
   the same breath, say to stay non-dogmatic and never force it. A lens that
   hardens into doctrine is the specific failure the design's own blog post
   warns about. Do not split the permission from the constraint when editing
   the prompt.
4. **It is a lens, not a switch to a different persona.** Rule 2 (perspective,
   not lecture) is untouched. Vocabulary being available is not licence to
   teach.

Because this narrows a rule the code calls load-bearing, `buildSystemPrompt`
carries a unit test asserting the Madhyasth Darshan case specifically — so a
future refactor cannot quietly widen or lose it.

## Prompt assembly — shape and precedence

One entry point, one object argument. Not a growing positional parameter list.

```ts
buildSystemPrompt({ contextBlock, nickname, occupation, aboutYou, traditions });
```

Sections are assembled in this order, and each is omitted entirely when its
field is empty:

1. **Base instructions** (`DHEE_INSTRUCTIONS`) — identity and the two rules.
   Always present, always first.
2. **Personalization** — nickname, occupation, about-you. Facts about who is
   being spoken to.
3. **Tradition lens** — how to frame things, plus the vocabulary unlock and its
   guardrail. After personalization because it modifies _how_ to speak to the
   person described above.
4. **Memory context** — the layer-3 block derived from past conversations.
   Last, and explicitly held loosely ("people change, any of this may be
   stale"), so it never outranks what the person has stated about themselves
   in settings.

**Precedence follows position**: later sections may refine earlier ones, but
nothing may contradict section 1. If the tradition section and the base rules
disagree, the base rules win — except for the single, named vocabulary
narrowing above.

**No personalization at all must produce byte-identical output to today's
`buildSystemPrompt("")`.** That is a test, not an aspiration: it is what makes
this refactor safe to land ahead of the UI.

## Incognito

**Personalization applies. Memory context does not.**

Incognito means "this conversation is not saved". It does not mean "pretend
not to know who I am" — someone who has told Dhee to call them by a nickname
should not have to reintroduce themselves because they turned off history. The
nickname, occupation, about-you and lens are settings the person maintains
deliberately, and they are as true in incognito as anywhere else.

The memory context block is different in kind: it is _derived from saved
conversations_, which is precisely what incognito opts out of. It stays out.

So `chat.incognitoReply` passes personalization and an empty `contextBlock`.

## Fields

| Field        | Cap                     | Empty means                           |
| ------------ | ----------------------- | ------------------------------------- |
| `nickname`   | 60                      | Dhee uses no name (matches `setName`) |
| `occupation` | 120                     | not mentioned in the prompt           |
| `aboutYou`   | 600                     | not mentioned in the prompt           |
| `traditions` | 1 free / unlimited paid | no lens; Rule 1 in full               |

- **Whitespace-only is empty.** Storing `"   "` and then describing the person
  to the model as `About them:    ` is worse than storing nothing.
- **Over-long input is capped, not rejected.** Someone writing an essay into
  "about you" gets the first 600 characters kept, not an error. Silent
  truncation is acceptable here; the field is advisory.
- **Clearing a field must remove it from the prompt**, not leave a stale
  sentence behind. A person who clears "about you" has withdrawn consent to be
  described that way.
- `traditions` is an **array**, not the design's comma-joined string. The
  free/paid distinction is a _count_, and a string makes counting a parsing
  problem. The design splits on commas at read time anyway.

## Free-tier cap

Free = **one** lens. Paid = several (design `PRICING`).

- **Enforced server-side** in `users.setTraditions`. A client sending three
  lenses on a free plan gets an error, not three lenses.
- **Fail closed**: a missing or unrecognized `plan` is treated as free. Ties to
  `users.plan` from #7; if Epic 8 lands first, gate on a helper that defaults
  to free rather than blocking on that issue.
- The UI explains the limit and offers the upgrade path (#10) rather than
  failing silently.

## Onboarding

The onboarding tradition step writes the **same field** as settings.
`users.completeOnboarding` currently takes only `name` and
`preferredLanguage`; it gains the tradition and writes `traditions`. Two
sources of truth for one field is how they drift.

## Copy

Every label, placeholder and helper line goes in `src/lib/i18n.ts` in **English
and Hindi**, like the rest of the app's chrome.

## Backend contract

- `convex/schema.ts` — `profiles` gains `nickname`, `occupation`, `aboutYou`,
  `traditions`, all optional.
- `convex/agents/dhee.ts` — `buildSystemPrompt` takes one object. Stays a
  **pure function of its arguments**, which is what makes it testable without
  the model.
- `convex/users.ts` — `setPersonalization` (patches any subset),
  `setTraditions` (replaces, enforces the cap), `currentProfile` (returns the
  new fields).
- Callers: `chat.streamReply` loads the profile alongside
  `internal.memory.contextBlockForUser`; `chat.incognitoReply` per the
  incognito rule above.

**Tests (write first):**

1. Each setter round-trips through `currentProfile`.
2. Whitespace-only input clears the field rather than storing spaces.
3. Over-long input is capped, not rejected.
4. Free plan + two traditions → throws. Unlimited plan → allowed.
5. Missing plan is treated as free.
6. `buildSystemPrompt` with no personalization → byte-identical to today.
7. Each field present → its sentence appears exactly once.
8. **A Madhyasth Darshan lens produces a prompt that permits its vocabulary and
   still carries the non-dogmatic guardrail.** This is the test that pins the
   decision above against a regression that would otherwise only surface in a
   real conversation.

## UI wiring

- `app/(app)/settings.tsx` — a "More about you" section (#24) and a "Tradition
  lens" section (#25). Save on blur or debounced, matching the quiet feel of
  the existing name field; no per-field Save button.
- `app/onboarding.tsx` — the tradition step (#25).
- One line under the "More about you" header saying this is what Dhee is told
  about you and it can be changed or cleared at any time. The fields sit next
  to the "Dhee's understanding of you" screen, which already promises that
  anything the assistant knows lives in a row you can read and delete; these
  three should feel like the same promise.

## Verification

- [ ] Backend tests green (`pnpm test`).
- [ ] A real conversation uses a set nickname.
- [ ] Clearing a field stops it reaching the model.
- [ ] The same question asked with no lens, a Stoic lens and an Advaita lens
      gives visibly different framing while staying plain-spoken and
      non-dogmatic (#25 requires the three replies in its PR).
- [ ] Screenshots in both themes.
- [ ] `FEATURES.md` Epic 8 rows flipped.
