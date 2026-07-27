# Spec: personalization (tradition lens + "more about you")

**Epic:** 8 — Memory & personalization
**Status when written:** ⬜ both rows

Two features, one spec, because they are the same mechanism: a user-editable
field that changes the system prompt. Written before #23, #24 and #25 so the
prompt gets assembled once rather than acquiring a string parameter per issue.

The tradition lens turned out to hold two decisions rather than one, and the
second reaches past the prompt into retrieval — see "Two kinds of lens". It is
also the answer to #62, which is why that issue is referenced throughout.

## Amendment, 2026-07-27 — the Madhyasth Darshan launch

Read this before the rest of the spec. Dhee launched to Madhyasth Darshan
students, and that changed the premise the "Two kinds of lens" section below
argues from.

**What changed in `DHEE_INSTRUCTIONS`:**

- Dhee is now stated to _be_ an assistant for Madhyasth Darshan, rather than a
  companion that had quietly read it. The base prompt carries the darshan's
  fundamentals inline — co-existence, the four states, जीवन and the body, भ्रम
  as the source of problems, the human goal, relationship as recognition,
  nested व्यवस्था, and the three अनुसन्धान — so that a turn which retrieves
  nothing is still grounded. Most turns retrieve nothing.
- **Rule 1 is no longer a ban.** It is a preference: lean plain, say the thing
  rather than name it, but let an honest term land with a short gloss. The
  failure mode named in the prompt is stacking terms and teaching a glossary,
  not using a word. `convex/evals/checks.ts` moved with it — the
  `plain-language` check became `plain-language (light)` and passes up to
  `MAX_LIGHT_TERMS` distinct terms instead of requiring zero.
- **Depth is now an instruction.** Answer from a higher vantage than the
  question was asked from; go to the root; a practical question gets its
  practical answer first, then at most a line or two that opens it. A question
  whose fact is out of reach — where the bus is, what time it is — is still
  answered rather than apologised for: leading with the limitation reads as a
  tool that failed, and costs the trust the depth is there to build. The two
  edges either side of that are inventing the fact and reaching for depth to
  sound deep; the prompt names all three, and `users.test.ts` pins them.
- **Sources**: not volunteered, but no longer refused. Asked where an idea
  comes from, or asked for a page by name, Dhee answers. What the corpus lens
  still gates is study _length_ and free use of the vocabulary.
- **Retrieval is the default, not the exception.** The prompt used to tell Dhee
  to skip the corpus on practical questions; it now says searching is almost
  always the better move, because the model's recollection of the darshan is
  looser than the books. The two eval cases that policed retrieval restraint
  (`bare/practical`, and the new `corpus/mundane`) moved to `retrieval: either`
  — a check that contradicts the prompt fails honest replies.

**What changed in onboarding:** the tradition step preselects Madhyasth Darshan
(`DEFAULT_TRADITION` in `src/lib/traditions.ts`, spelled to match
`isCorpusLens`), and the copy says so and says how to turn it off. So study
mode — Decision 2 below — is now the default path rather than the rare one.
Decision 2's guardrails matter more after this change, not less.

Everything below still holds as written, with those substitutions: "Rule 1
forbids" now reads "the base prompt prefers", and "the overwhelming majority
who have not named a lens" is no longer the overwhelming majority.

## Mockup reference

- File: `mockup/project/Dhee.dc.html`
- "More about you" inputs: ~1396–1405 (nickname / what you do / about you)
- Tradition lens section: ~1407–1414; helpers `lensList` / `toggleLens` /
  `addDraftLens` / `clearLenses` at ~2967–2978
- `TRADITIONS` (25 entries): line 1970
- Prompt assembly: ~2645–2652
- Onboarding tradition step: ~1643
- Free tier gets one lens: `PRICING`, ~2140–2141

## Two kinds of lens

`DHEE_INSTRUCTIONS` in `convex/agents/dhee.ts` forbids ever using the corpus's
terms of art — "not even in parentheses, not even to define them" — and names
**madhyasth darshan** among them. Madhyasth Darshan is the second entry in the
design's tradition list. Someone who picks it as their lens is asking for
exactly what Rule 1 forbids.

Settling that turned up a second thing hiding inside the same field. The 25
traditions are not peers:

- **A framing lens** is a way of thinking the person brings with them. Dhee has
  no Stoic texts, no Jungian corpus, no IFS manuals — naming one of those says
  _how to talk to me_, and nothing more. That is 24 of the 25 entries.
- **The corpus lens** is Madhyasth Darshan, the one tradition Dhee actually
  holds the books for (`convex/tools/md.ts`, against the MD MCP corpus).
  Naming it can mean something the others cannot: _let me at the source_.

Treating those as one dial is what made the vocabulary question look like the
whole question. It isn't. They get one decision each.

## Decision 1: a framing lens unlocks that tradition's vocabulary

**For the person who named it, and only theirs.**

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
4. **Rule 2 still sets the shape.** A framing lens changes which words are
   available, not the length or the posture. Perspective, not lecture.

Because this narrows a rule the code calls load-bearing, `buildSystemPrompt`
carries a unit test asserting the Madhyasth Darshan case specifically — so a
future refactor cannot quietly widen or lose it.

## Decision 2: the corpus lens opens the source (study mode)

**Naming Madhyasth Darshan as a lens also puts Dhee in study mode: it may quote
the books verbatim, say where a line comes from, and answer at whatever length
the question actually needs.**

The case for this isn't a design argument, it's what already worked.
old.dhee.app let people ask which page says what, and what a particular line on
a particular page means, and got back answers that went to the source and
returned in the source's own words. That is the capability the tester feedback
in #62 is missing when it says "response quality and depth felt noticeably more
robust" — not warmth, and not length for its own sake.

Study mode is not a softer Rule 1. It's a different job:

|                    | Ordinary reply              | Study mode                     |
| ------------------ | --------------------------- | ------------------------------ |
| Vocabulary         | plain words only            | the tradition's own            |
| The corpus's words | translated, never quoted    | quotable verbatim              |
| Citation           | not unless the person asks  | book, chapter and page, freely |
| Length             | one or two short paragraphs | follows the question           |
| Retrieval          | search, maybe read one page | as many steps as it takes      |

**What does not change — and this is the whole guardrail:**

1. **Only for the person who asked for it.** Study mode is reached by naming
   the corpus as your lens. Nobody arrives in it by accident, and it is one
   setting away from off.
2. **Non-conversion, not brevity.** What Rule 2 protects here isn't "keep it
   short", it's "don't preach". Answer the question that was asked, at the
   depth it was asked. Don't turn a page lookup into a sermon, don't volunteer
   the philosophy when someone brought a life question, and don't read their
   having named the lens as agreement with everything in it.
3. **Their language, their script.** Unchanged. The corpus is Devanagari; a
   person writing in English gets the quoted line with an English rendering
   beside it, not a wall of Hindi.
4. **Quote what the answer needs.** A line, a passage, a paragraph — enough to
   answer. "Verbatim quotation is unlocked" is not "reproduce the book on
   request"; these are copyrighted works and the ceiling is the answer, not the
   person's patience.

### Recognizing the corpus lens

`traditions` is free text — the picker deliberately accepts anything typed —
and this is the one entry the backend has to actually recognize. Match
case-insensitively against a short list of spellings rather than one string
equality:

```
madhyasth darshan · madhyastha darshan · madhyasth-darshan
मध्यस्थ दर्शन · jeevan vidya · जीवन विद्या
```

A miss fails safe: the person gets the framing lens and no study mode, which is
exactly today's behaviour. Keep the list in one exported constant so the prompt
builder, the agent config and the tests all read the same one.

### What study mode needs from the retrieval layer

The prompt alone cannot deliver this. Three things below `dhee.ts` make the old
behaviour impossible today, and all three are in scope:

1. **`TRANSLATE_REMINDER` is glued to every tool description**
   (`convex/tools/md.ts`) — "Never quote or paraphrase them directly to the
   person", and on `lookupDefinition`, "they are for your understanding only".
   It arrives with every tool result, which is closer to the model's attention
   at generation time than the system prompt is. Tool descriptions are static
   strings baked into the `Agent` at construction, so it cannot be conditioned
   on a per-user setting where it currently sits. **Move it into
   `DHEE_INSTRUCTIONS`**, where the lens section can override it, and leave
   each tool description saying only what its tool is for. One instruction, one
   place — the shape this spec already takes for everything else.
2. **Nothing gets from a book's name to its pages.** `readPage` takes "the book
   id and page number from a prior search result", and no tool enumerates the
   books. The MCP server exposes `list_books` and `get_book_toc`;
   `convex/md.ts` wires neither. Without them "page 3 of Manav Vyavhar Darshan"
   is answerable only if a semantic search happens to surface that book. Wire
   both. The titles are Devanagari (मानव व्यवहार दर्शन is book 138, 219 pages),
   so the model needs the list in front of it to match a romanized name.
3. **`stopWhen: stepCountIs(5)`** doesn't fit a study question. Resolve the
   book, read the page, look up two terms it turns on, read the facing page,
   answer — six steps before the reply starts. Give study mode a larger budget
   (start at 12); leave the ordinary path at 5. Log real step counts first, per
   #62, so the number is measured rather than guessed.

   This needs no second `Agent`: the client takes
   `args.stopWhen ?? this.options.stopWhen` on both `streamText` and
   `generateText`, so `chat.streamReply` passes `stepCountIs(STUDY_STEPS)` when
   the corpus lens is on and passes nothing otherwise. The `Agent` keeps its 5
   as the default for everyone else.

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
   person described above. When the named lens is the corpus one, this section
   also carries study mode (Decision 2) — permission and guardrail in the same
   passage, same as the vocabulary unlock.
4. **Memory context** — the layer-3 block derived from past conversations.
   Last, and explicitly held loosely ("people change, any of this may be
   stale"), so it never outranks what the person has stated about themselves
   in settings.

**Precedence follows position**: later sections may refine earlier ones, but
nothing may contradict section 1. If the tradition section and the base rules
disagree, the base rules win — except for the named narrowings above, which are
the only ones there are: vocabulary (Decision 1), and under the corpus lens,
verbatim quotation, citation and length (Decision 2).

The base rules are written as absolutes ("Never say: According to Madhyasth
Darshan… / Nagraj-ji says…", "Do not cite books, chapters, page numbers"), so
section 3 overriding them has to be explicit about which sentence it is
lifting. A lens paragraph that only grants vocabulary leaves the citation ban
standing, and "which page says this" stays unanswerable — that is the bug this
decision exists to prevent, and it is what the current wording would have
shipped.

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
- One entry in the array is load-bearing beyond its text: the corpus lens, per
  "Recognizing the corpus lens" above. Everything else in the field is passed
  to the model as written and never inspected.

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

For study mode (Decision 2), the same three files plus:

- `convex/agents/dhee.ts` — `CORPUS_LENS_ALIASES` and `isCorpusLens(traditions)`
  exported from here, since the prompt is what turns on. `STUDY_STEPS = 12`.
  The translate-and-never-quote instruction moves _into_ `DHEE_INSTRUCTIONS`
  from the tool descriptions, so the lens section can lift it.
- `convex/tools/md.ts` — drop `TRANSLATE_REMINDER` from the four descriptions;
  add `listBooks` and `readBookToc`. Descriptions say what each tool is for and
  nothing about how to render the result.
- `convex/md.ts` — `listBooks` and `getBookToc` internal actions over the MCP
  server's `list_books` and `get_book_toc`.
- `convex/chat.ts` — `streamReply` passes `stopWhen: stepCountIs(STUDY_STEPS)`
  when `isCorpusLens(personalization.traditions)`, and passes nothing
  otherwise. Same in `incognitoReply`: study mode is a setting, and settings
  apply in incognito.

**Tests (write first):**

1. Each setter round-trips through `currentProfile`.
2. Whitespace-only input clears the field rather than storing spaces.
3. Over-long input is capped, not rejected.
4. Free plan + two traditions → throws. Unlimited plan → allowed.
5. Missing plan is treated as free.
6. `buildSystemPrompt` with no personalization → byte-identical to today.
7. Each field present → its sentence appears exactly once.
8. **A Madhyasth Darshan lens produces a prompt that permits its vocabulary and
   still carries the non-dogmatic guardrail.** This is the test that pins
   Decision 1 against a regression that would otherwise only surface in a real
   conversation.
9. A framing lens (Stoicism) unlocks vocabulary and **nothing else** — no
   quotation, no citation, no length change. This is the test that keeps
   Decision 2 from leaking into the other 24 traditions.
10. `isCorpusLens` matches every spelling in `CORPUS_LENS_ALIASES` regardless of
    case, matches the Devanagari form, and returns false for a near miss
    ("Madhyamaka", "darshan") — a miss must fail safe to the framing lens.
11. The corpus lens prompt lifts the citation ban **and** carries
    non-conversion: it says to answer at the depth asked, and it still says not
    to preach, not to volunteer the philosophy, and to stay in the person's
    language and script.
12. `streamReply` passes the raised `stopWhen` only when the corpus lens is on.
    Assert on the arguments, not by running the model.
13. No lens at all still produces byte-identical output to today — test 6 covers
    it, but re-run it after the translate instruction moves into
    `DHEE_INSTRUCTIONS`, because that move changes the baseline. **Update the
    expected string in the same commit as the move**, and say so in the message;
    a silently re-recorded snapshot is how this rule stops meaning anything.

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
      → `pnpm eval --only lens` runs all three side by side (`bare/life`,
      `stoic/life`, `advaita/life`); the report renders them for pasting.
- [ ] Screenshots in both themes.
- [ ] `FEATURES.md` Epic 8 rows flipped.

Study mode has its own, and these are the ones that decide whether Decision 2
worked. These were written as a human step, on the grounds that they need a live
deployment rather than a test suite. Most of them are now
`pnpm eval --only study` — see `specs/eval-harness.md`; the case that automates
each one is named below. What still needs a person is reading the replies, and
the comparison against old.dhee.app:

- [ ] **"What does this line on page 3 of Manav Vyavhar Darshan mean?"** with
      the corpus lens on. The reply resolves the book, reads the page, quotes
      the line in Devanagari, renders it in the language the question was asked
      in, and says where it is from. This is the exact capability #62 is
      missing; if it doesn't work, nothing else in Decision 2 matters.
      → `corpus/page-lookup`. Note the probe there is worded "read me the
      opening lines of page 3" rather than "what does _this_ line mean": run as
      written above, "this line" refers to nothing, so the correct reply is to
      ask which line, and the check never gets to test the capability.
- [ ] The same question with **no lens** still declines the vocabulary and the
      citation. The unlock has to be reachable only by the person who asked.
      → `bare/page-lookup`.
- [ ] Three of the questions from #62 run **side by side against
      old.dhee.app**, transcripts pasted on that issue. This is the comparison
      that separates "prompt too tight" from "retrieval too weak", and it is
      the only way to know whether depth actually came back.
- [x] Step counts logged for those runs. If study mode never exceeds five
      steps, the budget wasn't the constraint and `STUDY_STEPS` should come back
      down. → Done, 2026-07-27: 40 study-mode samples, **max 3 steps** against a
      budget of 12. Recorded next to `STUDY_STEPS` in `convex/agents/dhee.ts`.
      By this checklist's own criterion the budget should come down; left as a
      decision rather than changed in passing.
- [ ] A life question — not a text question — asked **with the corpus lens on**
      still gets a companion's answer, not a lecture. This is the one that
      catches non-conversion failing, and it is the failure the design's own
      blog post warns about. → `corpus/life`. The pure checks only catch the
      crude form of this (length, citations); read the reply and the judge's
      `lensAsLensNotDoctrine` score.
