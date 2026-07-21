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

SES is called by signing SigV4 requests directly over `fetch`
(`convex/lib/ses.ts`) rather than pulling `@aws-sdk/client-sesv2`. The SDK
would add several MB and force the auth provider into Convex's Node runtime;
SendEmail is one JSON POST. The signing primitives are checked against AWS's
published test vectors — run `pnpm test`.

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

# Sign-in emails. AUTH_EMAIL_FROM must be an identity you have verified in
# SES, and a new SES account is sandboxed until you request production
# access — until then it can only send to verified addresses.
npx convex env set AWS_REGION ap-south-1
npx convex env set AWS_ACCESS_KEY_ID AKIA...
npx convex env set AWS_SECRET_ACCESS_KEY ...
npx convex env set AUTH_EMAIL_FROM "Dhee <hello@yourdomain.com>"
```

The IAM user needs only `ses:SendEmail` on the sending identity.

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
| `AWS_REGION` | Convex deployment | SES region, e.g. `ap-south-1` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Convex deployment | IAM credentials with `ses:SendEmail` |
| `AWS_SESSION_TOKEN` | Convex deployment | Only when using temporary credentials |
| `AUTH_EMAIL_FROM` | Convex deployment | Sender address; must be verified in SES |
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
