# Dhee

An AI companion for questions about life.

Dhee is a chat product like ChatGPT or Claude, purpose-built for one thing:
helping a person see their situation from a bigger vantage point than the one
they're asking from. Its knowledge grounding is Madhyasth Darshan, a
co-existential philosophy — but Dhee never uses that vocabulary with you.
Everything is translated into plain, everyday language, in English or Hindi.

Live at [dhee.app](https://dhee.app).

## Status

Early MVP. Chat, retrieval, auth, the memory layer, and the "Dhee's
understanding of you" screen are all in place.

## Two rules that govern every response

1. **Plain language only.** The corpus and its MCP results are dense specialist
   Hindi. Dhee understands them, then says the idea in ordinary words. No
   terminology, no book names, no chapter references — unless you explicitly ask
   where an idea came from.
2. **Perspective, not information.** A good reply widens the frame by a degree.
   Warm, unhurried, conversational. Never a lecture.

Both rules are enforced in the system prompt (`convex/agents/dhee.ts`) *and*
restated in every retrieval tool description, so the reminder is in context at
the moment raw passages come back.

## Stack

- **Backend**: [Convex](https://convex.dev) with the [Agent component](https://docs.convex.dev/agents) for threads, messages, and streaming; [Workflows](https://docs.convex.dev/agents/workflows) for background memory extraction.
- **LLM**: [OpenRouter](https://openrouter.ai) via the Vercel AI SDK. The model slug is a single constant in `convex/config.ts`, so switching providers — including to open-weight models — is a one-line change.
- **App**: [Expo](https://expo.dev) (managed, Expo Router) — iOS, Android, and web from one TypeScript codebase.
- **Retrieval**: Madhyasth Darshan corpus over MCP at `https://md-mcp.achal.xyz/mcp`, called from Convex actions.
- **Auth**: [Convex Auth](https://labs.convex.dev/auth) with email OTP delivered through AWS SES.

### Version constraints worth knowing

`@convex-dev/agent` 0.6 requires **AI SDK v6**, not v7, and renamed
`args`→`inputSchema` and `handler`→`execute` on `createTool`. That constrains
the OpenRouter provider too: **`@openrouter/ai-sdk-provider` must stay on v2.x**
(v3 requires AI SDK v7). v2 ships no runtime dependencies, so it doesn't
conflict with the `@ai-sdk/provider` / `@ai-sdk/provider-utils` pnpm overrides
in `package.json` — those exist to stop a v5 copy being hoisted, which breaks
the `LanguageModel` type.

Sign-in mail goes out over **SMTP** (`convex/email.ts`), which is why that one
module is `"use node"` — SMTP needs a TLS socket and Convex's default V8
runtime only has `fetch`. Convex Auth passes `ctx` into
`sendVerificationRequest`, so the V8 provider hops to the Node action.

Worth knowing if you swap credentials: **SES SMTP credentials are not IAM API
credentials.** An SES SMTP password is derived one-way from an IAM secret key,
so it cannot sign SigV4 requests against the SES HTTP API. If you ever want the
HTTP API instead, you need the original IAM secret, not the SMTP password.

## Repo layout

```
app/            Expo Router routes (sign-in, onboarding, threads, chat, understanding)
src/            Components, theme, i18n, fonts, Convex client
convex/         Schema, agent, MCP tools, memory workflow, auth
```

## Local setup

Requires Node ≥ 20 and pnpm.

```bash
pnpm install
pnpm convex:dev          # provisions a local backend, writes .env.local
```

Then set the secrets Convex needs (these live in the deployment, not in a file):

```bash
npx convex env set OPENROUTER_API_KEY sk-or-v1-...

# Sign-in emails over SMTP. With SES, EMAIL_USERNAME/EMAIL_PASSWORD are the
# SMTP credentials from the SES console (not an IAM key pair), and
# AUTH_EMAIL_FROM must be an identity verified in SES. A new SES account is
# sandboxed until you request production access — until then it can only
# send to verified addresses.
npx convex env set EMAIL_HOST email-smtp.ap-south-1.amazonaws.com
npx convex env set EMAIL_PORT 465
npx convex env set EMAIL_USERNAME ...
npx convex env set EMAIL_PASSWORD ...
npx convex env set AUTH_EMAIL_FROM "Dhee <noreply@yourdomain.com>"
```

Check the connection without mailing anyone:

```bash
npx convex run devEmail:smtpCheck '{}'
```

And confirm the model and corpus tools work after any `CHAT_MODEL` change:

```bash
npx convex run dev:smokeTest '{}'
```

Auth also needs a JWT keypair. If `npx convex env list` doesn't already show
`JWT_PRIVATE_KEY` and `JWKS`, generate them with `npx @convex-dev/auth`.

Finally:

```bash
pnpm web                 # or: pnpm ios / pnpm android
```

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Convex deployment | Model access for chat and extraction |
| `EMAIL_HOST`, `EMAIL_PORT` | Convex deployment | SMTP endpoint; 465 uses implicit TLS, 587 STARTTLS |
| `EMAIL_USERNAME`, `EMAIL_PASSWORD` | Convex deployment | SMTP credentials (leave unset for unauthenticated relay) |
| `AUTH_EMAIL_FROM` | Convex deployment | Sender address; must be verified with your provider |
| `JWT_PRIVATE_KEY`, `JWKS` | Convex deployment | Convex Auth token signing |
| `SITE_URL` | Convex deployment | Base URL for auth links |
| `MD_MCP_URL` | Convex deployment | Corpus MCP endpoint (optional; defaults to the hosted one) |
| `EXPO_PUBLIC_CONVEX_URL` | `.env.local` | Written automatically by `convex dev` |

### Seed data

```bash
npx convex run seed:demo
```

Creates a demo person, a seeded conversation, and the user-model rows that
conversation would have produced — so the understanding screen has content on
first open. Re-running replaces the previous demo data.

## Memory model

Three layers, deliberately separate:

- **Episodic** — threads and messages, owned entirely by the Convex Agent component.
- **User model** — `inquiries`, `observations`, `conceptsTouched`. Written by a
  Convex Workflow that runs a structured extraction every four turns, off the
  response path. Every row is viewable, editable, and deletable in-app.
- **Derived** — a compact `contextBlocks` string injected into each system prompt.

The derived block is **rebuilt** from the user model rather than accumulated.
That's what makes deletion real: removing an observation on the understanding
screen removes it from the next reply's context.

Extraction is deliberately conservative and never records health conditions,
political views, sexual details, other people's names, or financial specifics.
The prompt states that an empty result is a correct and common answer.

## License

MIT — see [LICENSE](LICENSE).
