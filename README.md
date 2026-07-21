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
- **LLM**: Anthropic via the Vercel AI SDK (`@ai-sdk/anthropic`). The model id is a single constant in `convex/config.ts`.
- **App**: [Expo](https://expo.dev) (managed, Expo Router) — iOS, Android, and web from one TypeScript codebase.
- **Retrieval**: Madhyasth Darshan corpus over MCP at `https://md-mcp.achal.xyz/mcp`, called from Convex actions.
- **Auth**: [Convex Auth](https://labs.convex.dev/auth) with email OTP via Resend.

### Version constraint worth knowing

`@convex-dev/agent` 0.6 requires **AI SDK v6** (`ai@^6`, `@ai-sdk/anthropic@^3`),
not v7, and renamed `args`→`inputSchema` and `handler`→`execute` on
`createTool`. `package.json` pins `@ai-sdk/provider` and `@ai-sdk/provider-utils`
via pnpm overrides to stop a v5 copy being hoisted, which breaks the
`LanguageModel` type.

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
npx convex env set ANTHROPIC_API_KEY sk-ant-...
npx convex env set AUTH_RESEND_KEY re_...          # for sign-in emails
npx convex env set AUTH_EMAIL_FROM "Dhee <hello@yourdomain.com>"
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
| `ANTHROPIC_API_KEY` | Convex deployment | Model access for chat and extraction |
| `AUTH_RESEND_KEY` | Convex deployment | Resend key for sign-in code emails |
| `AUTH_EMAIL_FROM` | Convex deployment | Sender address (defaults to Resend's onboarding address) |
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
