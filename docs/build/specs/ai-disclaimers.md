# AI disclaimers

Closes [#133](https://github.com/achalagrawal/dhee-app/issues/133) ("Add a
disclaimer — MD All Tech Meeting"). Epic 16 (Safety).

## The problem

From the meeting, in the issue's own words: _"Tool ka adhimoolyan ho sakta hai.
Prompting karna aur usse uttar lena hi adhyayan hai, aisa lag sakta hai."_ — the
tool can be over-valued, and prompting it can start to feel like study itself.

Dhee's failure mode is not that it is wrong. It is that it is fluent. A fluent
answer in the vocabulary of Madhyasth Darshan reads like authority, and someone
can take Dhee's reading for _the_ reading and stop opening the books. Nothing in
the app currently says otherwise: the only standing line is
`chatDisclaimer` — "Dhee offers perspective, not professional advice" — which is
about professional advice, not about study.

## What we say

Six points, in this order. The order is the argument: what Dhee is made of →
therefore its reading is contingent → therefore it cannot stand in for a person
→ and it can simply be wrong → and it is early → and so don't confide in it.

| #   | Point                                          | Why it is here                                                       |
| --- | ---------------------------------------------- | -------------------------------------------------------------------- |
| 1   | A general model, given the literature to read  | Names the machinery, so "Dhee says" is never mistaken for the śāstra |
| 2   | Another model would read it differently        | Makes the contingency concrete rather than abstract                  |
| 3   | It aids śāstrābhyās; it cannot replace a human | The meeting's central point — समझ मानव में ही होती है                |
| 4   | It can be wrong                                | Fluency is not accuracy                                              |
| 5   | Trial version, shaped by feedback              | Sets the expectation, and invites the reports                        |
| 6   | Don't share private information                | Because conversations are read internally — see below                |

### One correction to the issue's wording

The issue's numbered list says the system "uses the Claude Sonnet 5 LLM that has
been **trained on** Madhyasth Darshan Literature". That is not what this app
does, and the issue's own prose above the list says the accurate thing: _"We have
used an existing LLM (Sonnet 5 currently) and added Madhyasth Darshan context."_
The model is general-purpose; the literature reaches it through the corpus MCP
server at answer time (`convex/config.ts` → `DEFAULT_MD_MCP_URL`, the search /
paribhasha / page tools). The copy says the accurate version, because a
disclaimer that overstates the grounding does the opposite of its job.

### Point 6 and the Privacy Policy

The issue's reason for point 6 — questions are used internally to train and to
study reply quality — contradicted what `docs/legal/privacy.md` promised
("If we ever use what you write for anything beyond answering you — including to
train or tune a model — that is a new purpose… We will say so in this policy and
tell you in the app before it starts"). Shipping the in-app line alone would have
made the published policy false, so the policy's "Sending your words to a model"
section was rewritten in the same change to state the internal review and
improvement use plainly, and "Why we handle it" gained the matching basis.

**This is a substantive change to a published legal document and needs the
owner's sign-off**, in the same way the rest of `docs/legal/` is pending review.

## Where they appear

| Surface                   | What shows                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Onboarding, step 2        | All six, and the button that completes onboarding says "I understand"                                                  |
| Any signed-in screen      | `DisclaimerGate` — the same six, once, for accounts that onboarded before this existed or before the text last changed |
| Under every composer      | One line: "Dhee can be wrong. It offers perspective, not professional advice." + a link to /about                      |
| `/about`                  | The standing page: all six, plus links to Safety, Privacy, Terms                                                       |
| Settings → Data & privacy | A row into /about                                                                                                      |
| `docs/legal/safety.md`    | A "Reading the books is the study" section, for the web page                                                           |

Every point is written once, in `src/lib/i18n.ts` (EN + HI), and listed in order
by `src/lib/disclaimers.ts`. `DisclaimerList` renders it. There is no second copy
of this text in a component.

## Backend contract

The version is server-owned so that bumping the text can re-prompt everyone
without a client release.

- `convex/config.ts` → `DISCLAIMER_VERSION` (number, currently `1`). Bump it when
  the substance of the points changes — not for a typo.
- `profiles.disclaimersAckedVersion: v.optional(v.number())` — the version the
  person last acknowledged. Absent means never.
- `users.completeOnboarding` writes it, because step 2's button _is_ the
  acknowledgement. New accounts are never gated twice.
- `users.acknowledgeDisclaimers` — idempotent; writes the current version. What
  the gate calls.
- `users.currentProfile` returns `disclaimersAcked: boolean`
  (`ackedVersion >= DISCLAIMER_VERSION`), so the client compares nothing. A
  signed-out or profile-less caller is not "acked".

Tests in `convex/users.test.ts`: onboarding acknowledges; the mutation
acknowledges on its own; an old version reads as not acknowledged; a stale ack
plus a re-ack goes back to acknowledged.

## Not doing

- **A blocking modal per conversation.** Once, plus a standing line and a page
  one tap away. A dialog people dismiss without reading teaches them to dismiss
  dialogs.
- **Recording _when_ they acknowledged.** The version is what decides whether to
  ask again; a timestamp would only be there to argue with someone later.
- **Gating incognito.** The gate is mounted on the signed-in group, so it has
  already been seen before an incognito chat can start.
