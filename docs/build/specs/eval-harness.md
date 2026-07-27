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

```bash
pnpm eval --dry-run                       # every prompt + the case matrix, $0
pnpm eval --label before --repeats 3      # the whole suite, three samples per case
pnpm eval --only lens --no-judge          # one slice, fast, checks only
pnpm eval:report .evals/runs/<new>.json .evals/runs/<old>.json
```

Runs land in `.evals/runs/`, reports in `.evals/report/`. Both are gitignored
(and prettier-ignored — that file is separate and does not read `.gitignore`).

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
