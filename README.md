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

Both rules are enforced in the system prompt (`convex/agents/dhee.ts`) _and_
restated in every retrieval tool description, so the reminder is in context at
the moment raw passages come back.

## Stack

- **Backend**: [Convex](https://convex.dev) with the [Agent component](https://docs.convex.dev/agents) for threads, messages, and streaming; [Workflows](https://docs.convex.dev/agents/workflows) for background memory extraction.
- **LLM**: [OpenRouter](https://openrouter.ai) via the Vercel AI SDK. The model slug is a single constant in `convex/config.ts`, so switching providers — including to open-weight models — is a one-line change.
- **App**: [Expo](https://expo.dev) (managed, Expo Router) — iOS, Android, and web from one TypeScript codebase.
- **Retrieval**: Madhyasth Darshan corpus over MCP at `https://md-mcp.achal.xyz/mcp`, called from Convex actions.
- **Auth**: [Better Auth](https://better-auth.com) via its [Convex component](https://labs.convex.dev/better-auth) — email OTP and Google, with user records in our own deployment. Sign-in mail goes out over the SES v2 HTTP API.

### Version constraints worth knowing

`@convex-dev/agent` 0.6 requires **AI SDK v6**, not v7, and renamed
`args`→`inputSchema` and `handler`→`execute` on `createTool`. That constrains
the OpenRouter provider too: **`@openrouter/ai-sdk-provider` must stay on v2.x**
(v3 requires AI SDK v7). v2 ships no runtime dependencies, so it doesn't
conflict with the `@ai-sdk/provider` / `@ai-sdk/provider-utils` pnpm overrides
in `package.json` — those exist to stop a v5 copy being hoisted, which breaks
the `LanguageModel` type.

Sign-in mail goes out over the **SES v2 HTTP API** (`convex/email.ts`), signed
with [`aws4fetch`](https://github.com/mhart/aws4fetch). This is deliberate:
SMTP needs a raw TLS socket, which would force `"use node"` and a second
bundle on the sign-in path. **The whole backend now runs in Convex's default V8
runtime** — there is no `"use node"` module left.

Worth knowing if you are moving from an SMTP setup: **SES SMTP credentials are
not IAM API credentials.** An SES SMTP password is derived one-way from an IAM
secret key and cannot sign SigV4, so you need to mint a fresh IAM key rather
than reuse what SMTP was using.

One type-level wart: `@better-auth/expo`'s client plugin is cast to
`BetterAuthClientPlugin` in `src/lib/auth-client.ts`. Both packages are 1.6.25
and the runtime shapes match, but their better-fetch generics don't line up;
without the cast the plugin array degrades and `authClient` silently loses
`emailOtp`.

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
pnpm convex:dev          # provisions a deployment, writes .env.local
```

On a fresh clone this prompts you to pick a backend: a **local** one (including
the no-account "start without an account" option, which runs entirely on your
machine) or a **cloud dev** deployment under your Convex team. Either works —
the CLI writes `EXPO_PUBLIC_CONVEX_URL` to `.env.local` for whichever you chose.

Then set the secrets Convex needs (these live in the deployment, not in a file):

```bash
npx convex env set OPENROUTER_API_KEY sk-or-v1-...
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"

# Sign-in emails over the SES v2 HTTP API. These are ordinary IAM credentials
# with ses:SendEmail — *not* SES SMTP credentials, which cannot sign SigV4.
# AUTH_EMAIL_FROM must be an identity verified in SES. A new SES account is
# sandboxed until you request production access — until then it can only send
# to verified addresses.
npx convex env set AWS_REGION ap-south-1
npx convex env set AWS_ACCESS_KEY_ID ...
npx convex env set AWS_SECRET_ACCESS_KEY ...
npx convex env set AUTH_EMAIL_FROM "Dhee <noreply@yourdomain.com>"
```

**On a local backend the `AWS_*` block is optional.** Leave those unset and
sign-in mail is skipped rather than attempted — the OTP is already written to
the deployment logs, so you can sign in from the `convex dev` output without an
inbox or an AWS account. Set them and mail goes out as normal. A cloud
deployment always requires them: there, missing credentials throw instead of
being ignored, because sign-in mail that silently vanishes looks like a healthy
deploy.

Check the credentials without mailing anyone — this calls SES's read-only
GetAccount, and also tells you whether the account is still sandboxed:

```bash
npx convex run devEmail:sesCheck '{}'
```

And confirm the model and corpus tools work after any `CHAT_MODEL` change:

```bash
npx convex run dev:smokeTest '{}'
```

There is no JWT keypair to generate: the Better Auth component holds its
signing keys in its own `jwks` table and serves the public set from this
deployment, which `convex/auth.config.ts` points Convex at.

### Sign in with Google

Create a **Web application** OAuth client in the
[Google Cloud console](https://console.cloud.google.com/apis/credentials) and add
one authorized redirect URI per Convex deployment. Convex builds the callback
from its own site URL, so these must match it exactly:

```
http://127.0.0.1:3211/api/auth/callback/google        # local backend
https://<prod-deployment>.convex.site/api/auth/callback/google
```

A single Web client covers web, iOS and Android: the browser hits Convex's HTTP
endpoint and Convex exchanges the code server-side, so the client secret never
ships in the app bundle. Then, per deployment:

```bash
npx convex env set AUTH_GOOGLE_ID <client-id>.apps.googleusercontent.com
npx convex env set AUTH_GOOGLE_SECRET <client-secret>
npx convex env set SITE_URL http://localhost:8081   # where the app runs
```

`SITE_URL` is the only place a web redirect destination is allowed from — see
`convex/lib/redirect.ts`, which also allows the app's `dhee://` deep link (and
Expo Go's `exp://` when the backend is loopback) and refuses everything else.

Finally:

```bash
pnpm web                 # or: pnpm ios / pnpm android
```

### Environment variables

| Variable                                     | Where             | Purpose                                                    |
| -------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| `OPENROUTER_API_KEY`                         | Convex deployment | Model access for chat and extraction                       |
| `AWS_REGION`                                 | Convex deployment | SES region, e.g. `ap-south-1`                              |
| `AWS_ACCESS_KEY_ID`, `..._SECRET_ACCESS_KEY` | Convex deployment | IAM credentials with `ses:SendEmail`                       |
| `AUTH_EMAIL_FROM`                            | Convex deployment | Sender address; must be verified in SES                    |
| `BETTER_AUTH_SECRET`                         | Convex deployment | Better Auth signing/encryption secret                      |
| `SITE_URL`                                   | Convex deployment | Base URL for auth links, and the OAuth redirect allowlist  |
| `AUTH_GOOGLE_ID`                             | Convex deployment | Google OAuth client id ("Continue with Google")            |
| `AUTH_GOOGLE_SECRET`                         | Convex deployment | Google OAuth client secret                                 |
| `MD_MCP_URL`                                 | Convex deployment | Corpus MCP endpoint (optional; defaults to the hosted one) |
| `EXPO_PUBLIC_CONVEX_URL`                     | `.env.local`      | Written automatically by `convex dev`                      |
| `EXPO_PUBLIC_CONVEX_SITE_URL`                | `.env.local`      | Where the auth client reaches Better Auth's handler        |

### Seed data

```bash
npx convex run seed:demo
```

Creates a demo person, a seeded conversation, and the user-model rows that
conversation would have produced — so the understanding screen has content on
first open. Re-running replaces the previous demo data.

## Development

### Checks

Three commands, also run by CI on every push and PR:

```bash
pnpm typecheck     # tsc for the app + the convex project
pnpm test          # vitest + convex-test (in-memory — no backend needed)
pnpm format:check  # prettier --check .   (pnpm format to fix)
```

Backend tests live next to the code as `convex/**/*.test.ts` and run against
[`convex-test`](https://github.com/get-convex/convex-test), so they need no
running Convex deployment, no secrets, and never call a model. The shared harness
is `convex/test.setup.ts`.

### Evals

The three checks above never call a model, by design. Measuring what a prompt
change does to an actual reply is a separate tool, run by hand against a live
deployment:

```bash
pnpm eval --label before --repeats 3    # 15 persona × probe cases
pnpm eval:report .evals/runs/<after>.json .evals/runs/<before>.json
```

It fixes one variable at a time — a persona is a frozen set of prompt inputs, a
probe a frozen question — so you can change the tradition lens or the memory
block and see which cases moved, with the exact system prompt, every tool call
and its arguments, step counts and cost recorded per case. The report diffs what
is deterministic (checks, metrics, prompts) and renders the replies side by side
to read.

Costs real money and never runs in CI. Full guide, including how to read a
report: [`docs/build/specs/eval-harness.md`](docs/build/specs/eval-harness.md).

### CI/CD

- **CI** — [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the three
  checks above. It needs no secrets (`convex/_generated` is committed and tests
  are in-memory), so it's green on forks.
- **CD** — deployment is handled by **Vercel**, which runs `convex deploy` as
  part of the web build (see [`vercel.json`](vercel.json)). One hosted
  environment: `main` → production at [dhee.app](https://dhee.app). There is no
  staging and no per-PR preview — `vercel.json` disables deployments for every
  branch but `main`. GitHub Actions deliberately does not deploy. Full setup:
  [`docs/deployment.md`](docs/deployment.md).

### Building toward the final design

Feature work follows a tracked, spec-driven loop. Start at
[`docs/build/FEATURES.md`](docs/build/FEATURES.md) (what's done / what's next) and
[`docs/build/README.md`](docs/build/README.md) (the per-feature workflow). See
[CONTRIBUTING.md](CONTRIBUTING.md).

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the checks your change must
pass, and the build workflow.

## License

MIT — see [LICENSE](LICENSE).
