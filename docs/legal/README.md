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

**Jurisdiction: India first.** The drafts are written to the Digital Personal
Data Protection Act, 2023 — Data Fiduciary/Data Principal framing, the rights in
sections 11–14, breach notification, and a named Grievance Officer — rather than
a GDPR-shaped template. If there will be EU or UK users at launch, that is a
second set of obligations and a second pass over both documents.

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
| Daily message limit, incognito counting towards it, manual upgrade requests            | Issue #11 and its children (#7, #8) — **not yet built**                               |

## Before publishing — the checklist

**Values to fill in.** Legal entity name and registered address; privacy contact
address; grievance officer name, address, email, and response windows; the city
whose courts have jurisdiction; the Safety & limitations page URL. None of these
exist anywhere in the repo today.

**Claims that depend on configuration, not code.** These are true only if
someone has set them that way, and none of them can be verified from this
repository:

- That OpenRouter is not logging prompts for our account, and that the upstream
  model provider does not train on or retain our requests beyond its terms. The
  policy currently asserts this — verify or reword it.
- Whether the corpus service at `md-mcp.achal.xyz` is first-party or a third
  party, where it runs, and whether it logs the queries it receives. If it is a
  third party, it needs a processing agreement and a named mention.
- The Convex, SES, Vercel, and Google regions and data-residency positions,
  which decide how the cross-border transfer paragraph should read.
- Whether a DPDP consent notice needs to be shown at sign-up as a separate
  artefact from this policy.

**Gaps between the drafts and the code.** Each of these is a place where the
document and the app do not yet agree:

- **Account deletion has no code path.** The drafts promise it by email request,
  which is honest but manual. `docs/build/FEATURES.md` Epic 9 already tracks
  "delete account" as missing.
- **Deleting a user does not cascade.** `triggers.user.onDelete` in
  `convex/auth.ts` deletes the app-side `users` row only; `profiles`,
  `inquiries`, `observations`, `conceptsTouched`, `contextBlocks`, `threadMeta`,
  `messageFeedback`, stored avatars, and the agent component's threads and
  messages are all left behind. Anything that promises erasure needs this fixed
  first.
- **There is no export.** The design promised one; the drafts do not. If the
  DPDP right to a summary of processing is to be self-serve, it needs building.
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
