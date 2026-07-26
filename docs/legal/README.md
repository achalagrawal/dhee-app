# Legal drafts

Working drafts of the two documents Dhee has to publish before launch:

- [`privacy.md`](./privacy.md) — Privacy Policy
- [`terms.md`](./terms.md) — Terms of Use

**Neither is legal advice and neither is ready to publish.** They were written by
engineering from the code, which is the part engineering can actually do well:
produce an accurate data-flow inventory and a faithful first draft. Given the
sensitive-category content Dhee invites and the health-adjacent disclaimers it
has to carry, a lawyer must review both before they go live.

## Why the design's copy wasn't reused

`LEGAL` in `mockup/project/Dhee.dc.html` was written for a browser-local
prototype. Its structure and voice are worth keeping and are kept here; two of
its factual claims are false about the app we are building and are gone:

- _"your conversations, journal, spaces, and memory notes are stored locally in
  your browser, not on our servers"_ — everything is server-side in Convex.
- _"delete everything from this browser"_ / _"export all your data as a text
  file"_ — deletion is server-side, and there is no export feature.

Two claims from the design survive verbatim in spirit because they are true and
worth keeping: conversations here are "not protected health information or a
confidential professional relationship", and Dhee is "not a medical or crisis
service".

## Decisions taken while drafting

**Operated by an individual.** Both documents name **Achal Agrawal**, of
Gandhinagar, Gujarat, in his personal capacity rather than through a company,
with `privacy@dhee.app` as the published contact and the courts at Gandhinagar
named for governing law. Worth saying once: an individual operator carries
personal, unlimited liability for everything these documents promise, which is
the usual reason people incorporate before launching a product that invites
grief and mental distress. That is a decision for the operator, not a drafting
problem.

**Jurisdiction: Indian law, open to everyone, with a real GDPR section.** The
product is available worldwide, so the drafts are written to the Digital
Personal Data Protection Act, 2023 — Data Fiduciary/Data Principal framing, the
rights in sections 11–14, breach notification, a named Grievance Officer — and
carry a European section covering controller identity, lawful basis per
purpose, transfers, retention, the Article 15–21 rights, and the right to
complain to a supervisory authority.

**The lawful-basis split is the part to read closely.** The policy says the
service itself runs on contract, that keeping it standing up is a narrow
legitimate interest, and that the sensitive things people write — grief,
distress, faith, relationships — rest on **explicit consent** under Article
9(2)(a). That is the only sound basis for special-category data, and it is a
promise the app does not yet keep: consent has to be given knowingly at sign-up,
separately from "by continuing you agree to our terms", and it has to be
withdrawable. See the gaps section below.

**Liability is capped at the greater of amounts paid or ₹10,000.** A pure
"amounts you paid" cap is zero while Dhee is free, and a cap a court reads as
illusory is easier to strike out entirely. Death, personal injury, fraud, and
non-waivable consumer rights are carved out.

**Minimum age 18, not 16.** The design says 16. Under the DPDP Act a "child" is
anyone under 18, and processing their data needs verifiable parental consent,
which Dhee has no mechanism for. 18 is the only age the code can honestly
support today.

**Inference gets its own section.** The memory layer generates claims about a
person — values, relationships, aspirations, patterns — from what they said.
That is a stronger processing claim than storage, so the policy states it
plainly, alongside the mitigation the schema already commits to: every inference
lives in a row the person can read, edit, and delete.

**The corpus lookup is disclosed.** Query text leaving our backend for
`md-mcp.achal.xyz` is a real third-party hop and is in the inventory, including
the fact that it happens in incognito conversations too.

## Traceability — every claim back to the repo

| Claim in the drafts                                                                    | Where it comes from                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Conversations, threads, and streamed replies are stored server-side                    | `convex/chat.ts` (agent component tables via `@convex-dev/agent`)                     |
| Message text goes to OpenRouter, then to Anthropic's Claude                            | `convex/agents/config.ts`, `CHAT_MODEL` in `convex/config.ts`                         |
| Query text goes to the corpus service at `md-mcp.achal.xyz`                            | `DEFAULT_MD_MCP_URL` in `convex/config.ts`, `convex/lib/mcp.ts`, `convex/tools/md.ts` |
| The corpus is searched for most life questions, and in incognito too                   | `convex/tools/md.ts` descriptions; `incognitoReply` comment in `convex/chat.ts`       |
| Titles and summaries are model-generated from the conversation                         | `chat.titleThread`                                                                    |
| Dhee infers values, relationships, aspirations, patterns, and context                  | `convex/memory.ts` (`extractionSchema`), `convex/schema.ts` (`observations`)          |
| Inferences are marked "stated" vs "inferred"                                           | `observations.confidence` in `convex/schema.ts`                                       |
| Extraction is instructed to skip health, politics, sexual orientation, names, finances | `EXTRACTION_EXCLUSIONS` in `convex/memory.ts`                                         |
| Every inference is visible, editable, deletable, and deletion takes effect immediately | `convex/understanding.ts` (each mutation rebuilds `buildContextBlock`)                |
| Clearing everything Dhee remembers is one action                                       | `understanding.forgetEverything`                                                      |
| Deleting conversations is separate from clearing memory                                | `chat.deleteAllThreads` comment                                                       |
| Incognito persists nothing but is still sent to the model                              | `chat.incognitoReply` (`saveMessages: "none"`, `recentMessages: 0`)                   |
| Email address is stored, and sign-in codes go out over AWS SES                         | `convex/schema.ts` (`users.email`), `convex/email.ts`                                 |
| Codes are six digits, hashed at rest, 15-minute expiry, three attempts                 | `emailOTP` options in `convex/auth.ts`                                                |
| Google sign-in receives name, email, and profile photo                                 | `socialProviders.google` and the `onCreate` trigger in `convex/auth.ts`               |
| The Google profile photo is copied into our own storage                                | `users.importOAuthAvatar`                                                             |
| Avatars live in Convex file storage; replacing one deletes the old                     | `users.setAvatar`                                                                     |
| Profile holds name, preferred language, photo                                          | `profiles` in `convex/schema.ts`, `users.completeOnboarding`                          |
| Thumbs up/down is stored against the message                                           | `messageFeedback` in `convex/schema.ts`, `chat.setMessageFeedback`                    |
| Starred and pinned conversations are recorded                                          | `threadMeta` in `convex/schema.ts`                                                    |
| No account identifier is sent to the model provider                                    | `convex/agents/config.ts` sends only `HTTP-Referer` / `X-Title` headers               |
| The context block sent to the model is rebuilt from user-editable rows                 | `memory.buildContextBlock`, `agents/dhee.ts` (`buildSystemPrompt`)                    |
| Every request is scoped to the signed-in person                                        | `requireUserId` in `convex/users.ts`, `authorizeThread` in `convex/chat.ts`           |
| Sessions live in device secure storage (native) or browser storage (web)               | `src/lib/auth-client.ts`                                                              |
| No analytics, advertising, or tracking SDKs                                            | Absence of any such dependency in `package.json`; no tracking code in `src/`          |
| The web app is hosted on Vercel                                                        | `docs/deployment.md`, `vercel.json`                                                   |
| Closing an account deletes the profile, photo, conversations, and inferences           | `account.purgeUserData`, scheduled by `triggers.user.onDelete` in `convex/auth.ts`    |
| Daily message limit, incognito counting towards it, manual upgrade requests            | Issue #11 and its children (#7, #8) — **not yet built**                               |

## Before publishing — the checklist

**No placeholders remain.** Every value is filled in: operator, contact address,
city for governing law, grievance windows (three working days to acknowledge,
thirty to resolve), liability cap, and the Safety page URL. The text can be
published as written. What follows is not drafting work — it is the things that
have to be true in the world for the published text to stay true.

**Things that must exist before either page goes live.** Each is a sentence in
the documents that is false until someone does it:

- **`privacy@dhee.app` must receive mail.** It is the only route for erasure
  requests, grievances, and account closure, and it is named in both documents.
- **`https://dhee.app/safety` must resolve.** The terms link to it from the
  emergency section, which is the worst page to 404. Epic 16 and Epic 17 both
  track it.
- **A postal address, if you submit to the app stores.** Not required by the
  documents as written, but Apple and Google both ask a developer for one.

**Claims that depend on configuration, not code.** None of these can be checked
from this repository:

- What the model providers retain. The policy no longer asserts anything about
  their settings — it says we do not train, and that their requests are handled
  under their own published terms. Confirm the OpenRouter account has not opted
  into any prompt-logging or data-collection tier; if it has, the paragraph
  needs a sentence saying so.
- Whether the corpus service at `md-mcp.achal.xyz` is first-party or a third
  party, where it runs, and whether it logs the queries it receives. If it is a
  third party, it needs a processing agreement and a named mention.
- The Convex, SES, Vercel, and Google regions and data-residency positions,
  which the European transfers paragraph depends on.
- Convex's backup and snapshot retention, which is the basis for the policy's
  one-line hedge that deleted data may survive briefly in backups. Confirm it or
  drop the sentence.

**What the GDPR section commits you to, beyond the text.** Writing the section
does not do the work it describes:

- **Explicit consent at sign-up.** The policy rests special-category data on
  Article 9(2)(a). That needs a real consent moment — a deliberate action,
  separable from accepting the terms, recorded and withdrawable — not a footer
  line. This is the single biggest gap between the drafts and the app.
- **Article 27 representatives.** An EU and a UK representative are probably
  required, since the exemption for occasional processing is unlikely to hold
  when the processing routinely touches sensitive categories. These are paid
  services with a named address published in the policy.
- **A DPIA.** Profiling plus special-category data plus a vulnerable user base
  makes one likely mandatory. It is an internal document, not a published one.
- **A record of processing.** Article 30, same reasoning.
- **Breach notification within 72 hours.** The policy promises notification;
  the GDPR puts a clock on it. Decide now who is on the hook and how they would
  find out.

If any of that is more than you want to take on before launch, the alternative
is to geo-limit signups to India, publish the DPDP-only version, and open up
later — the European section is self-contained and can be lifted out.

**Gaps between the drafts and the code.** Each of these is a place where the
document and the app do not yet agree:

- **Erasure now cascades — fixed here.** `triggers.user.onDelete` in
  `convex/auth.ts` used to delete the app-side `users` row and nothing else,
  stranding the profile, the avatar in storage, every conversation, and every
  inference. It now schedules `internal.account.purgeUserData`
  (`convex/account.ts`, covered by `convex/account.test.ts`), which removes all
  of it. The trigger itself only fires when the auth component deletes a user,
  which `convex-test` never does, so the end-to-end path is a live-deployment
  check — see `specs/auth-foundation.md`.
- **Nothing in the app calls it yet.** There is still no self-serve "delete my
  account" control, so closing an account is a manual step for whoever handles
  the request, and both drafts describe it that way. `docs/build/FEATURES.md`
  Epic 9 tracks the missing control.
- **There is no export.** The design promised one; the drafts do not. The DPDP
  right to a summary of processing and the GDPR right to portability are both
  answerable by email today, which does not scale past a handful of requests.
- **No consent record.** Nothing in the schema stores that a person consented,
  to what, or when — which is what an Article 7(1) demonstration needs. See the
  explicit-consent item above.
- **Plans and limits are described ahead of the code.** The "Plans, limits, and
  upgrades" section of the terms describes #11's design (free daily limit,
  manual upgrade requests, no payments). If #11 does not ship before launch,
  that section must be cut or rewritten to match what exists.
- **Hindi is missing.** Both documents are English only. Epic 17's legal pages
  need English and Hindi content, sitting alongside `src/lib/i18n.ts`, and a
  translated legal document needs the same review as the original.
- **The auth footer line is unwritten.** Epic 10's "Terms/privacy agreement +
  not-a-medical-service notice" row needs the design's line — "By continuing you
  agree to our terms. Dhee is not a medical or crisis service." — as an i18n
  string linking to both pages.
