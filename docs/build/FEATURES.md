# Features tracker

Source of truth for building Dhee toward the final design. Read
[README.md](./README.md) for the workflow. Status legend: ✅ done · 🟡 partial
(UI stub or backend-only, or doesn't match design yet) · ⬜ not started.

> **Scope note.** The design is a full ChatGPT/Claude-class product **plus** a
> personalization/settings suite, a Journal + Spaces knowledge layer, safety
> features, billing, and a marketing site. It is **much** larger than the app
> today. Many advanced controls already render in the Composer/Drawer but are
> wired to a `soon()` placeholder.

## How this inventory was built (and how to keep it honest)

The design's behavior lives in a JS state machine inside `Dhee.dc.html` — the
authoritative feature list is **`this.state.*` keys** and the **data arrays**
(`ONBOARD`, `TRADITIONS`, `MODELS`, `MODES`, `STARTERS`, `FAQS`, `LEGAL`, `GUIDE`,
`BLOG`, `CAREERS`, `PRICING`, `I18N`, `DAILY_LIMIT`), not the HTML `show*` flags.
When adding features, grep the state keys, don't eyeball the markup. Design
reference: [`mockup/project/Dhee.dc.html`](../../mockup/project/Dhee.dc.html).

**Audit status (2026-07-24):** verified against **all 81 `state.*` keys** and
**all 12 data arrays**. Every state key maps to an epic below; the only excluded
keys are pure UI plumbing (`route`, `screen`, `draft`, `activeId`, `threads`,
`confirm`) handled by router/component infra.

---

## Epic 1 — App shell & navigation

| Feature                                          | Status | Where                             | Notes                                                                                                                                                                         |
| ------------------------------------------------ | ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App shell (sidebar + main + header)              | 🟡     | `AppShell`, `AppDrawer`           | Design polish pending                                                                                                                                                         |
| Sidebar collapse / icon rail (desktop)           | ⬜     | —                                 | `state.sidebarCollapsed`                                                                                                                                                      |
| New conversation                                 | ✅     | `chat.startThread`                |                                                                                                                                                                               |
| Search conversations                             | ✅     | `SearchModal`, `chat.listThreads` |                                                                                                                                                                               |
| History: recent groups                           | 🟡     | `threads.tsx`                     | Grouping/labels vs design                                                                                                                                                     |
| Starred section                                  | 🟡     | `chat.setStarred/threadFlags`     | Backend done, UI pending                                                                                                                                                      |
| Pinned rows                                      | 🟡     | `chat.setPinned`                  | Backend done, UI pending                                                                                                                                                      |
| Home topic modes + per-mode starter questions    | ⬜     | —                                 | `state.mode`/`suggestedPrompts`; 6 modes (`MODES`: decision, relationship, purpose, grief, work, everyday), each with ~3 written starter questions (`STARTERS`) shown on home |
| Time-of-day greeting (morning/afternoon/evening) | 🟡     | `home.tsx`                        | I18N `morning/afternoon/evening`                                                                                                                                              |
| "Get the app" / download button                  | ⬜     | —                                 | → download page                                                                                                                                                               |

## Epic 2 — Composer

| Feature                                                          | Status | Where              | Notes                                                                                      |
| ---------------------------------------------------------------- | ------ | ------------------ | ------------------------------------------------------------------------------------------ |
| Text send                                                        | ✅     | `chat.sendMessage` |                                                                                            |
| Attachments (files/photos) + drag-drop                           | 🟡     | Composer stub      | `state.pendingFiles/uploads/dragOver`; types: IMG/PDF/MD/TXT/DOC                           |
| Model picker: **Dhee Quick / Reflective (default) / Deep (pro)** | 🟡     | Composer stub      | `state.model` + `fastAnswers/higherIntel` quick-toggles; see `MODELS` (Deep is plan-gated) |
| Web search toggle                                                | 🟡     | Composer stub      | `state.webSearchOn` (distinct from `md.ts`)                                                |
| Dictation (mic)                                                  | 🟡     | Composer stub      | `state.dictating/dictationPref`                                                            |
| Voice mode                                                       | 🟡     | Composer stub      | `state.speakingId`; see Epic 12                                                            |
| Typeahead suggestions                                            | ⬜     | —                  |                                                                                            |
| Token bar / limit-reached card                                   | ⬜     | —                  | Needs billing (Epic 14)                                                                    |

## Epic 3 — Chat & messages

| Feature                                   | Status | Where                                    | Notes                                               |
| ----------------------------------------- | ------ | ---------------------------------------- | --------------------------------------------------- |
| Streaming reply                           | 🟡     | `chat.streamReply`                       | Built; cadence + caret unverified against mockup    |
| Thinking indicator                        | ✅     | `chat/[threadId].tsx`                    | Suppressed once text arrives                        |
| Stop generating                           | ✅     | `chat.stopGeneration`                    | Aborts the stream; partial reply kept               |
| Edit & resend user message                | ✅     | `chat.editAndResend`                     | Forks the thread; confirms when >1 reply is lost    |
| Regenerate response                       | ✅     | `chat.regenerate`                        | Replaces the last reply; feedback cleared           |
| Copy message                              | ✅     | clipboard                                |                                                     |
| Message feedback (👍/👎)                  | ✅     | `chat.setMessageFeedback/threadFeedback` | UI wired too; active rating shown in `accentStrong` |
| Message action sheet (mobile)             | ✅     | inline actions row                       | Not building one — the inline row covers it (#18)   |
| Crisis / safety flag banner               | ✅     | `lib/crisis.ts`, `CrisisBanner`          | Server-side, EN + HI; → `/support`                  |
| Artifacts in-message + sheet              | ⬜     | —                                        | `state.artifactsOpen/codeDraft`                     |
| Lightbox (image viewer)                   | ⬜     | —                                        | `state.lightbox`                                    |
| Scroll-to-bottom button + pull-to-refresh | ✅     | `chat/[threadId].tsx`                    | Pull-to-refresh dropped by design (spec §8)         |

## Epic 4 — History / Library

| Feature                    | Status | Where                                | Notes                          |
| -------------------------- | ------ | ------------------------------------ | ------------------------------ |
| Threads list               | ✅     | `chat.listThreads`                   |                                |
| Rename thread              | ✅     | `chat.renameThread`                  | `state.renameDraft`            |
| Delete thread / delete all | ✅     | `chat.deleteThread/deleteAllThreads` |                                |
| Library grid/list toggle   | ⬜     | —                                    | `state.order`, grid/list views |

## Epic 5 — Incognito

| Feature                    | Status | Where                 | Notes             |
| -------------------------- | ------ | --------------------- | ----------------- |
| Incognito chat (not saved) | ✅     | `chat.incognitoReply` | `state.incognito` |
| Incognito banner + toggle  | ✅     | header                |                   |

## Epic 6 — Journal (NEW)

| Feature                         | Status | Notes                                                                                              |
| ------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Save a conversation to Journal  | ⬜     | "Save conversations to your Journal" — curated saved reflections, distinct from raw thread history |
| Journal list / view             | ⬜     | Named in onboarding, pricing, guide as a first-class surface                                       |
| Journal backend (schema + CRUD) | ⬜     | New tables                                                                                         |

## Epic 7 — Spaces (NEW)

| Feature                                     | Status | Notes                                  |
| ------------------------------------------- | ------ | -------------------------------------- |
| Spaces list                                 | ⬜     | `state.spaces`                         |
| Space detail                                | ⬜     | `state.spaceView`                      |
| Space picker (assign chat/journal to space) | ⬜     | Groups conversations & journal entries |
| Spaces backend (schema + CRUD)              | ⬜     | New tables                             |

## Epic 8 — Memory & personalization

Existing "understanding" screen covers the memory-notes half. The design adds a
larger personalization surface.

| Feature                                                                         | Status | Where                                      | Notes                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------- | ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory notes (observations/inquiries/concepts)                                  | ✅     | `understanding.*`                          | `state.memory`                                                                                                                                                                                                    |
| Memory extraction from threads                                                  | ✅     | `memory.extractFromThread/applyExtraction` | Background                                                                                                                                                                                                        |
| Forget everything                                                               | ✅     | `understanding.forgetEverything`           |                                                                                                                                                                                                                   |
| Reference past conversations (toggle)                                           | ⬜     | —                                          | `state.referenceRecord`                                                                                                                                                                                           |
| "Learn about who I am from the internet"                                        | ⬜     | —                                          | `state.learnFromWeb/learnWebOpen/learnWebInput` (Learn-from-web modal)                                                                                                                                            |
| Custom instructions (base style & tone, response length, warmth, encouragement) | ⬜     | —                                          | `state.customInstructions/baseStyle/responseLength`                                                                                                                                                               |
| "More about you" (nickname, occupation, about you)                              | ⬜     | —                                          | `state.nickname/occupation/aboutYou`                                                                                                                                                                              |
| **Tradition lens**                                                              | ⬜     | —                                          | `state.tradition/traditionDraft`; **25 traditions** in `TRADITIONS` (Stoicism, Madhyasth Darshan, Advaita, Buddhist psychology, Zen, Ikigai, NVC, IFS…); central to the product; free = one lens, paid = multiple |
| Improve-the-model opt in/out                                                    | ⬜     | —                                          | `state.improveModel`                                                                                                                                                                                              |

## Epic 9 — Settings

The design's settings is a multi-section modal (nav + sections + mobile drill-in),
far richer than today's flat screen.

| Section / feature                                                              | Status | Where                                                     | Notes                                 |
| ------------------------------------------------------------------------------ | ------ | --------------------------------------------------------- | ------------------------------------- |
| Multi-section modal layout                                                     | 🟡     | `settings.tsx` (flat)                                     | Design has nav + mobile back          |
| Account (name, avatar, username, email)                                        | 🟡     | `users.setName/setAvatar`                                 | Username/email fields missing         |
| Custom instructions section                                                    | ⬜     | —                                                         | See Epic 8                            |
| Memory section                                                                 | 🟡     | `understanding.*`                                         | Toggles missing                       |
| Appearance (theme + accent + contrast)                                         | 🟡     | `ThemeContext`                                            | Contrast option missing               |
| Language (English / हिन्दी)                                                    | ✅     | `users.setLanguage`, `i18n.ts`                            | Design ships English + Hindi strings  |
| Dictation preference                                                           | ⬜     | —                                                         | `state.dictationPref`                 |
| Notifications (push, email, follow-up nudges, weekly reflection, product news) | ⬜     | —                                                         | `state.notify/notifyPush/notifyEmail` |
| Security (change password, 2FA, active sessions, log out all)                  | ⬜     | —                                                         | `state.mfaEnabled`                    |
| Data (export your data, manage storage)                                        | ⬜     | —                                                         | Export to text file                   |
| Usage & plan (limits, cancel plan)                                             | ⬜     | —                                                         | `state.plan`; see Epic 14             |
| Delete chats / delete account / delete everything                              | 🟡     | `chat.deleteAllThreads`, `understanding.forgetEverything` | Delete-account missing                |
| Sign out                                                                       | ✅     | `@convex-dev/auth`                                        |                                       |

## Epic 10 — Auth & onboarding

| Feature                                                         | Status | Where                            | Notes                                                                                                         |
| --------------------------------------------------------------- | ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Email OTP sign-in + verify flow                                 | ✅     | `EmailOTP`, `email.sendOtpEmail` | `state.emailDraft`                                                                                            |
| **Continue with Google (OAuth)**                                | ⬜     | —                                | In auth modal; not yet in backend                                                                             |
| Guest mode ("Maybe later")                                      | ⬜     | —                                | `state.authed` — use before signing in; auth is a gate to _persist_                                           |
| Terms/privacy agreement + "not a medical/crisis service" notice | ⬜     | —                                | In auth modal footer                                                                                          |
| Auth as modal (design variant)                                  | 🟡     | `sign-in.tsx` (full screen)      | `state.showAuth`                                                                                              |
| Onboarding — 3 intro slides                                     | 🟡     | design `ONBOARD`                 | "Welcome to Dhee" → "What it is, and isn't" (not a therapist/crisis service) → "One or two things"            |
| Onboarding — profile setup (name → goal → tradition)            | 🟡     | `users.completeOnboarding`       | `state.onboardStep/onboardName/onboardGoal/onboardTradition`; goal = one of the 6 `MODES`; tradition optional |

## Epic 11 — Attachments & media backend

| Feature                                  | Status | Notes                                                                      |
| ---------------------------------------- | ------ | -------------------------------------------------------------------------- |
| File/image storage + `expo-image-picker` | ⬜     | Convex file storage; `users.generateAvatarUploadUrl` is a starting pattern |
| Attachments rendered in messages         | ⬜     | image thumbs + doc chips (IMG/PDF/MD/TXT/DOC)                              |
| Multimodal in generation                 | ⬜     | Pass attachments to the model                                              |

## Epic 12 — Voice & dictation

| Feature                        | Status | Notes              |
| ------------------------------ | ------ | ------------------ |
| Dictation (speech→text)        | ⬜     | `state.dictating`  |
| Full voice mode (speak/listen) | ⬜     | `state.speakingId` |

## Epic 13 — Model selection & web search

| Feature                       | Status | Notes                                       |
| ----------------------------- | ------ | ------------------------------------------- |
| Model registry + picker wired | ⬜     | Fast / Balanced / Higher intelligence tiers |
| Web search tool               | ⬜     | Distinct from MD corpus search (`md.ts`)    |

## Epic 14 — Billing / plans

| Feature                                                   | Status | Notes                                               |
| --------------------------------------------------------- | ------ | --------------------------------------------------- |
| Upgrade modal                                             | ⬜     | `state.upgradeOpen`                                 |
| Pricing tiers: **Free $0 / Reflective $8 / Patron $20**   | ⬜     | Concrete features per tier in `PRICING` array       |
| Sync across devices (paid)                                | ⬜     | Prototype stores locally; real app is server-backed |
| Usage limit enforcement (**free = 5/day**, `DAILY_LIMIT`) | ⬜     | Token bar, limit-reached card, "limit resets"       |
| Cancel plan                                               | ⬜     |                                                     |

## Epic 15 — Sharing

| Feature                                | Status | Notes                                 |
| -------------------------------------- | ------ | ------------------------------------- |
| Share conversation modal (link + body) | ⬜     | `state.shareOpen/shareLink/shareBody` |
| Shared/public thread view              | ⬜     | Backend                               |

## Epic 16 — Safety

| Feature                                       | Status | Notes                                            |
| --------------------------------------------- | ------ | ------------------------------------------------ |
| Crisis detection → safety banner              | ✅     | Server-side in `sendMessage`; EN + HI + Hinglish |
| Safety & limitations page (crisis resources)  | 🟡     | `/support` has the lines; full page still to do  |
| Trusted / emergency contacts                  | ⬜     | `state.trustedContacts/trustedEmail/trustedName` |
| "Not a medical or crisis service" disclaimers | ⬜     | Auth, onboarding, legal                          |

## Epic 17 — Marketing & static site (web)

Content already fully written in the design's data arrays — this is mostly layout.

| Page                             | Status | Source in design                      |
| -------------------------------- | ------ | ------------------------------------- |
| Landing / website                | ⬜     | `Dhee Web.dc.html`                    |
| About                            | ⬜     | copy in file                          |
| Pricing                          | ⬜     | `PRICING` (3 tiers)                   |
| Guide ("How to think with Dhee") | ⬜     | `GUIDE` (5 steps)                     |
| Blog index + articles            | ⬜     | `BLOG` (3 full posts)                 |
| FAQ / Help                       | ⬜     | `FAQS` (7 Q&A)                        |
| Careers                          | ⬜     | `CAREERS` (values, benefits, 3 roles) |
| Legal — Privacy                  | ⬜     | `LEGAL.privacy` (7 sections)          |
| Legal — Terms                    | ⬜     | `LEGAL.terms` (7 sections)            |
| Safety & limitations             | ⬜     | see Epic 16                           |
| Contact                          | ⬜     | `state.contactEmail/contactMsg`       |
| Download                         | ⬜     |                                       |
| Not-found (404)                  | ⬜     | `showNotFound`                        |

---

## Suggested order

1. **Characterize existing backend** (Epics 1–5, 8, 10) — `convex-test` tests that
   capture current `chat`, `users`, `understanding`, `memory` behavior. Regression
   net before change. See `specs/chat-backend-characterization.md`.
   - ✅ **Harness bootstrapped** + `convex/chat.test.ts` (9 tests, green). Run
     `pnpm test`.
   - ⬜ Next: characterize `users`, `understanding`, `memory` the same way; add a
     model stub to cover `streamReply`/`incognitoReply`.
2. **Finish the core chat loop to match design** — streaming polish, stop, edit &
   resend, regenerate, feedback UI (Epic 3).
3. **Auth completeness** — Google OAuth + guest mode (Epic 10); unblocks the real
   product entry.
4. **Tradition lens + custom instructions** (Epic 8) — central to Dhee's identity
   and cheap relative to impact.
5. Then Journal/Spaces (6, 7), then the rest by product priority.

Marketing pages (Epic 17) are backend-free and content-complete in the design;
they can proceed in parallel by anyone.
