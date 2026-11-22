# Spec: eval harness

**Epic:** tooling — not a product feature, so it has no `FEATURES.md` row of its
own. It exists to make Epic 8's rows verifiable.
**Status when written:** ⬜ → ✅

## Why

Every knob that shapes a reply — `DHEE_INSTRUCTIONS`, the personalization
facts, the tradition lens, the study-mode block, the memory context block, the
step budget — is assembled by `buildSystemPrompt` and handed to the model.
There was no way to change one and see what moved. `pnpm test` is deliberately
model-free, `dev:smokeTest` runs one hardcoded turn, and the verification
section of [personalization.md](personalization.md) said outright that its
checks "need a signed-in session against a live deployment, so they are a human
step, not something a test suite reaches".

That checklist was the eval, written down and never built. This is it.

## What it is

Two suites, both run against the real deployment and the real corpus, both
saved as JSON and rendered as HTML.

|            | command                                                 | what it decides                                                              |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| answers    | `pnpm eval`                                             | 15 persona × probe cases, checked against the rules the system prompt states |
| extraction | `pnpm eval --suite extraction --model chat\|background` | whether memory extraction still refuses the excluded categories              |

Runs land in `.evals/runs/`, reports in `.evals/report/`. Both are gitignored
(and prettier-ignored — that file is separate and does not read `.gitignore`).

### What a case is

A **persona** is a frozen set of `PromptInputs`; a **probe** is a frozen
question. Cross them and you get a **case** — a fixed point you can re-measure
after any edit.

The personas exist to isolate one layer at a time: `bare` has no
personalization, lens or memory; `stoic` and `advaita` add only a framing lens;
`personalized` only the three self-described fields; `remembered` only a memory
block; `corpus` opens study mode; `full` turns everything on at once. So when
`stoic/life` moves and `bare/life` does not, the lens section did it — which is
the whole point, and the thing that was impossible before.

## Using it

The harness talks to whatever Convex deployment `.env.local` points at, so for a
local backend `npx convex dev` has to be running first.

```bash
pnpm eval --dry-run                    # every prompt + the case matrix, $0
pnpm eval --label before --repeats 3   # the whole suite, three samples per case
pnpm eval --only lens --no-judge       # one slice, fast, checks only
pnpm eval --only corpus/page-lookup    # a single case while iterating
pnpm eval --suite extraction --model background
```

| flag                | default  | what it is for                                                             |
| ------------------- | -------- | -------------------------------------------------------------------------- |
| `--label <name>`    | ISO ts   | Names the run and its saved file. Use it — you compare runs by name.       |
| `--only <id\|tag>`  | all      | Case id (`corpus/life`) or tag (`lens`, `study`, `memory`, `script`, …).   |
| `--repeats <n>`     | 1        | Samples per case. See below — 3 is the threshold for believing a delta.    |
| `--concurrency <n>` | 4        | Cases in flight. Lower it if OpenRouter starts rate-limiting.              |
| `--no-judge`        | judge on | Drops the second model call: about half the cost, and all the extra noise. |
| `--dry-run`         | off      | Builds every prompt and enumerates the matrix without calling a model.     |

A selector matching nothing **throws** rather than running zero cases and
reporting green — an empty green run is the worst possible failure for a tool
whose only job is to be believed.

### The loop

```bash
pnpm eval --label before --repeats 3
#   ... edit the prompt ...
pnpm test                              # free: which personas changed?
pnpm eval --label after --repeats 3
pnpm eval:report .evals/runs/<after>.json .evals/runs/<before>.json
```

`pnpm eval:report` takes the new run first and the baseline second — it reads as
"report this, against that". The middle step costs nothing and answers half the
question on its own: a changed fingerprint in `personas.test.ts` names exactly
which personas your edit reached, before you spend a rupee finding out what it
did to them.

**Three repeats matters.** Temperature cannot be set — OpenRouter strips
sampling parameters for this model and Sonnet 5 rejects non-default ones — so
run-to-run variance is real and is handled by reporting rather than suppression.
At `--repeats 1` the report greys out every delta and labels it "within noise",
because it would be. The Hinglish bug is the worked example: 1/3 on the first
run read as variance, 0/3 on the second made it a fact.

## Reading a report

Read the sections in this order. Each one narrows the question the next one
answers.

**1. Header.** Model, timestamp, cases × repeats, total cost, and whether the
run was judged. If repeats is below 3 a banner says so.

**2. Checks table.** One row per check, the pass rate on each side, and the
delta. When comparing, it counts **only the cases both runs ran**, so a
`--only study` run against a full baseline compares five cases to five rather
than five to fifteen.

**3. System prompts.** One collapsible panel per persona, badged
`prompt identical` / `prompt changed` / `not in this run`. Changed ones open by
default with a line-level diff.

This is the panel that attributes cause, and it is the reason the report is
worth opening at all. The prompts are deterministic, so this diff is exact — it
is the difference between "my edit did this" and "the model was having a
different day".

**4. Case cards.** One per case, two columns when comparing with the baseline on
the left, and a highlight plus an "N checks moved" badge on any card that
changed. Each card carries:

- **check chips** — `3/3` or `1/3` across repeats, failure detail in the tooltip
- **the metrics line** — steps, latency, cost, tokens, `cacheReadTokens`, and
  which upstream OpenRouter routed to. That last one matters: OpenRouter routes
  differently run to run, and a routing change can masquerade as a prompt
  regression.
- **the tool table** — every call with the arguments the model chose. "It
  searched for the wrong thing" is a different problem from "it didn't search",
  and only this tells them apart.
- **the judge panel**, collapsed, with per-dimension means and its written
  rationale
- **every reply**, rendered as markdown, side by side

### A worked card

`corpus/page-lookup` from the baseline — the case study mode exists for:

```
tools   listBooks {}                        → 1,615 chars
        readPage  {"bookId":138,"pageNo":3}  → 1,425 chars

checks  PASS  searched-corpus                    called listBooks, readPage
        PASS  expected-tools
        PASS  quotes-the-source                  shared span: "अस्तित्व में से के लिए जानने पहचानने और"
        PASS  script-mirrored (quoting allowed)  77% latin, overall latin

metrics 3 steps · 25.5s · $0.0173 · 13,752 in / 982 out (11,706 cached) · Amazon Bedrock
```

`quotes-the-source` is the same detector that elsewhere enforces "never quote a
tool result directly" — here it is inverted. Under the corpus lens the reply is
_supposed_ to quote the page, so a shared span with the tool output is proof the
answer came from the book rather than from the model's memory. Same function,
opposite polarity, decided by the case's own `expect` block.

### What the report deliberately does not do

It does not diff the replies. Two samples from a non-deterministic model differ
everywhere, so a word-level diff of prose would be almost entirely noise and
would train you to skim past the report. The checks, the metrics and the prompts
are exact and get diffed precisely; the replies are rendered side by side to
read. **Diff what is exact; read what is not.**

## Three layers, in order of how much they should be trusted

**1. Deterministic, free, in CI.** `convex/evals/personas.test.ts` fingerprints
each persona's system prompt and asserts the section order. A changed
fingerprint is not a failure — it is the test asking you to confirm you meant
it, and the constant is updated by hand in the same commit, per the rule at
[personalization.md](personalization.md)'s snapshot note. This layer has zero
variance and answers "did I change what the model is told, and for whom?"

**2. Pure checks, no model.** `convex/evals/checks.ts` decides whether a rule
was broken outright: a term of art leaked, a page was cited, the script
switched, a corpus passage was pasted in, a memory line was recited. Binary and
objective, so these carry the regression signal. Every one is unit-tested in
`checks.test.ts`, which runs in CI.

**3. The judge, and your own eyes.** `convex/evals/judge.ts` scores
perspective-not-lecture, widened-the-frame, warmth, depth, and lens-not-doctrine
1–5. It is the noisiest thing here — the same non-deterministic model grading
another sample of itself — so scores are a direction, never a measurement, and
never a pass/fail. The report puts every reply side by side, rendered, because
some changes only show up to a reader.

## What it cannot decide

- **Hinglish.** Devanagari is detectable exactly; Hinglish shares an alphabet
  with the language it must be told apart from. The check is a function-word
  heuristic and is labelled as one in the report. A failure means go read it.
- **Tone, and whether a frame actually widened.** That is the judge's job and
  the judge is unreliable. Read the replies.
- **Where "abstracted past the detail" becomes "recorded a health condition."**
  The extraction suite reports that as `category-residue (heuristic)`, never as
  a failure, because it is a product judgement.
- **Anything at one sample.** With `--repeats 1` the report mutes every delta
  as "within noise". Deltas become claims at `--repeats 3`.

## Case contract

Every case in `scenarios.ts` carries a `why` naming the sentence it pins —
either a rule in `DHEE_INSTRUCTIONS` or a line in personalization.md's
verification list. A case that cannot name one gets deleted rather than kept:
every case costs money on every run.

`selectCases` throws on a selector matching nothing, rather than running zero
cases and reporting green. A typo that produces an empty green run is the worst
possible failure for a tool whose only job is to be believed.

## Design notes worth not re-deriving

- **No Convex tables.** The action returns the run as one JSON string; the node
  script captures stdout (`convex run` emits clean JSON when piped, and routes
  its own logging to stderr). Files diff, paste into an issue, and need no
  cleanup function or schema churn.
- **No throwaway threads.** Cases run in the sandbox `chat.incognitoReply`
  already uses — an opaque `userId` with `saveMessages: "none"` and no context
  — so hundreds of runs leave nothing behind.
- **`--push` is baked in.** Without it `convex run` executes whatever is
  deployed, which after an edit is the previous prompt.
- **`result.text` is the last step's text only.** A multi-step turn needs
  `steps.map(s => s.text).join()`, or a study answer loses its middle.
  `result.providerMetadata` has the same trap for cost, which must be summed
  across steps.
- **Replies are not diffed.** Two samples from a non-deterministic model differ
  everywhere. The checks, metrics and prompts are exact and get diffed
  precisely; the replies are shown side by side to read.

## Cost

~$0.30–1.00 for the full 15-case answer suite at one sample, roughly triple at
`--repeats 3`, plus about the same again for the judge. The extraction suite is
a few cents. Every run prints its measured total.

## Verification

- [x] `pnpm typecheck` — the four non-test eval modules typecheck under
      `tsc -p convex`; none is named `*.test.ts`, so vitest never runs them and
      no model is reachable from CI.
- [x] `pnpm test` — `checks.test.ts` and `personas.test.ts` green.
- [x] `pnpm eval --dry-run` — 15 cases, 7 prompts, $0.
- [x] A full run produces a result per case, with tool-call arguments, step
      counts, cost and non-zero `cacheReadTokens`.
- [x] The round trip: deleting the study-mode guardrail flipped exactly the
      `corpus` and `full` fingerprints in CI, and the comparison report opened
      those two prompts with the removed sentence diffed line by line.
- [x] Step counts logged next to `STUDY_STEPS`, as personalization.md asks.
