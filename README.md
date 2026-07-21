# Dhee

An AI companion for questions about life.

Dhee is a chat product like ChatGPT or Claude, purpose-built for one thing:
helping a person see their situation from a bigger vantage point than the one
they're asking from. Its knowledge grounding is Madhyasth Darshan, a
co-existential philosophy — but Dhee never uses that vocabulary with you.
Everything is translated into plain, everyday language, in English or Hindi.

Live at [dhee.app](https://dhee.app).

## Status

Early MVP, under active construction.

## Stack

- **Backend**: [Convex](https://convex.dev) with the [Agent component](https://docs.convex.dev/agents) for threads, messages, and streaming; [Workflows](https://docs.convex.dev/agents/workflows) for background memory extraction.
- **LLM**: Anthropic via the Vercel AI SDK (`@ai-sdk/anthropic`) inside the Convex Agent. Model is a single constant in `convex/config.ts`.
- **App**: [Expo](https://expo.dev) (managed, Expo Router) — iOS, Android, and web from one TypeScript codebase.
- **Retrieval**: Madhyasth Darshan corpus via the existing MCP server at `https://md-mcp.achal.xyz/mcp`, called from Convex actions as agent tools.
- **Auth**: [Convex Auth](https://labs.convex.dev/auth) with email OTP.

## Repo layout

```
app/            Expo Router routes
src/            Non-route app code (components, hooks, lib)
convex/         Convex functions, schema, agent, tools
assets/         Fonts (Noto Sans / Noto Sans Devanagari), images
```

## Local setup

Requires Node ≥ 20 and pnpm.

```bash
pnpm install
cp .env.example .env.local        # fill in ANTHROPIC_API_KEY
pnpm convex:dev                    # first run: authenticates to Convex
pnpm web                           # or: pnpm ios / pnpm android
```

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Convex dashboard | Anthropic API key used by the agent |
| `MD_MCP_URL` | Convex dashboard | MD MCP endpoint (default `https://md-mcp.achal.xyz/mcp`) |
| `EXPO_PUBLIC_CONVEX_URL` | `.env.local` | Convex deployment URL (auto-filled by `convex dev`) |

## Design principles

Two hard rules govern every response:

1. **Plain language only.** The corpus and MCP results are in Madhyasth Darshan terms; Dhee translates in real time. A user with zero background must never feel they're missing vocabulary.
2. **Dimension-changing answers.** The goal of a reply is not information but perspective. Warm, unhurried, conversational — never lecture-like, never preachy.

## Memory model

Three layers, deliberately separate:

- **Episodic** — threads and messages, entirely owned by the Convex Agent component.
- **User model** — `inquiries`, `observations`, `conceptsTouched` tables. Every field is fully viewable and editable in-app on the "Dhee's understanding of you" screen.
- **Derived** — a compact `contextBlocks` string regenerated from the above and injected into each system prompt.

Extraction is conservative and explicitly excludes health diagnoses, political views, sexual details, family members' names, and financial specifics.

## License

MIT — see [LICENSE](LICENSE).
