# Deployment & environments

Dhee runs on Vercel, with the Convex backend deployed from the Vercel build
(`vercel.json` → `scripts/vercel-build.mjs`). GitHub Actions does **not** deploy
— it only runs CI (see `.github/workflows/ci.yml`).

## Topology

| Environment | Where it runs               | Git branch           | Domain                  | Convex deployment              |
| ----------- | --------------------------- | -------------------- | ----------------------- | ------------------------------ |
| Development | your machine (`convex dev`) | any                  | localhost               | your local/dev backend         |
| Preview     | Vercel                      | any branch with a PR | generated `.vercel.app` | a throwaway backend per branch |
| Production  | Vercel                      | `main`               | `dhee.app`              | the production backend         |

There is no long-lived staging environment. A PR gets a preview so a tester can
click through it; merging to `main` ships.

## How the build works

Both environments run the same script, `scripts/vercel-build.mjs`, whose first
and (in production) only step is:

```
npx convex deploy --cmd 'pnpm build:web' --cmd-url-env-var-name EXPO_PUBLIC_CONVEX_URL
```

`convex deploy` picks its target **from the `CONVEX_DEPLOY_KEY` it's given** —
Vercel's Production environment holds a Convex _production_ deploy key, and its
Preview environment a _preview_ one. It pushes the backend, then sets
`EXPO_PUBLIC_CONVEX_URL` to that deployment's URL and runs the Expo web export
inside it. The frontend bundle therefore can't point at the wrong backend: one
key decides both halves.

`build:web` is `build:legal && expo export -p web`. The first step renders
`docs/legal/*.md` into `public/*.html`, which the export copies into `dist/`;
`vercel.json` then serves them at `/privacy` and `/terms`. Export directly with
`expo export` and the site builds without its legal pages, which is why the
deploy goes through the script. See [legal/README.md](legal/README.md) —
those URLs are what Google's OAuth verification and the app stores are given.

## Preview deployments

Open a PR and Vercel comments on it with a URL. Behind that URL is a Convex
backend of its own, named after the branch and holding nothing but the demo
seed — so a schema change or a half-finished migration is exercised in
isolation, never against production data. Convex deletes an idle preview
deployment 5 days after creation (14 on Pro).

### Which branches build

Every branch is eligible, and `vercel.json`'s `ignoreCommand` is the gate:

```
if [ "$VERCEL_ENV" = "production" ] || [ -n "$VERCEL_GIT_PULL_REQUEST_ID" ]; then exit 1; else exit 0; fi
```

Exit **1 builds** and exit **0 skips** — inverted from the usual convention, and
worth reading twice. `VERCEL_GIT_PULL_REQUEST_ID` is the empty string until a PR
exists, so pushing a work-in-progress branch costs a skipped deployment rather
than a build and a backend. Opening the PR triggers the first real one.

This replaces an earlier `git.deploymentEnabled` block. Note that whichever
mechanism is used, Vercel reads it from `vercel.json` **on the branch being
pushed** — a branch cut before this landed behaves the old way until it picks
up `main`.

### What the build does beyond the deploy

`convex deploy` with a preview key provisions the branch's backend, and
`scripts/vercel-build.mjs` then does two things a plain deploy can't:

- Runs `seed:demo` on it (`--preview-run`), so the backend isn't empty.
- Tells the backend where the app is being served from, which is only knowable
  at build time. A preview answers on two hostnames, and both have to be allowed
  or sign-in fails CORS with a bare "Failed to fetch":

  | Convex env var          | Set to                 | Why                                                                          |
  | ----------------------- | ---------------------- | ---------------------------------------------------------------------------- |
  | `SITE_URL`              | the per-branch alias   | Stable across pushes; the origin people are redirected back to               |
  | `EXTRA_TRUSTED_ORIGINS` | the per-deployment URL | The immutable URL Vercel links from the PR comment (`convex/lib/origins.ts`) |

The web bundle needs `EXPO_PUBLIC_CONVEX_SITE_URL` too, and only the API URL can
be injected. It's derived from that (`src/lib/convex-urls.ts`), which is why no
preview needs a hand-set env var.

### One-time setup

1. Convex dashboard → Project Settings → Deploy Keys → generate a **preview**
   deploy key.
2. Vercel → Settings → Environment Variables → add it as `CONVEX_DEPLOY_KEY`
   scoped to **Preview** only. Production keeps its own production key.
3. Convex dashboard → Project Settings → **Default Environment Variables**.
   These are copied into each newly created deployment, which is the only way a
   throwaway backend gets credentials — nothing is inherited at deploy time.
   Generate the block to paste from production:

   ```bash
   pnpm preview:env | pbcopy
   ```

   `scripts/preview-env.mjs` filters `convex env list --prod` down to what a
   preview needs (`OPENROUTER_API_KEY`, `BETTER_AUTH_SECRET`, the `AWS_*` block,
   `AUTH_EMAIL_FROM`, and `MD_MCP_URL` if set) and withholds the rest:
   `SITE_URL` and `EXTRA_TRUSTED_ORIGINS` are set per preview by the build, and
   `AUTH_GOOGLE_*` can't work there at all. It writes secrets to stdout, so pipe
   it to the clipboard rather than into a file. If production later grows a
   variable the script doesn't recognise, it says so on stderr instead of
   quietly dropping it — teach it by editing `COPY` or `SKIP`.

4. Vercel → Settings → Deployment Protection. If Vercel Authentication is on for
   Preview, a tester without a Vercel account hits a login wall before seeing the
   app at all. Turn it off for Preview, or give testers a Protection Bypass link.
5. Vercel → Settings → Git → confirm PR comments are on. That comment is the
   link the tester clicks.

### What doesn't work on a preview

- **Google sign-in.** The OAuth callback is built from the deployment's own
  `.convex.site` host, which is generated per branch, and Google requires every
  redirect URI to be registered exactly — no wildcards. `AUTH_GOOGLE_*` is
  deliberately left off the preview defaults. Testers use the email code.
- **Email to unverified addresses**, if the SES account is still sandboxed.
  Previews share production's SES credentials.
- **Continuity.** Each branch's backend starts fresh; a tester signing in gets a
  new account with no history.

## DNS

`dhee.app` resolves to the Vercel deployment and serves production. The zone is
**Route 53**, hosted zone `Z0622971PZ3I7JYRF5DY` in AWS account `573562677649`
(SSO profile `k4m2a`, `ap-south-1`).

Mail is **ForwardEmail**, configured entirely through DNS: `MX` to
`mx1/mx2.forwardemail.net`, and one `forward-email=` value per alias in the apex
`TXT` record. Domain-verification tokens (Google Search Console) live in that
same record set.

That shared record set is the thing to be careful about. Route 53 has no "append
a value" operation — `UPSERT` replaces every value in a record set — so adding a
verification token by writing only that token silently deletes the SPF record
and every mail alias with it. Read the current values first and send them all
back:

```
aws route53 list-resource-record-sets --profile k4m2a \
  --hosted-zone-id Z0622971PZ3I7JYRF5DY \
  --query "ResourceRecordSets[?Type=='TXT' && Name=='dhee.app.']"
```

> The waitlist lives on a separate domain (`dhee.co`) and a separate Vercel
> project (`dhee-waitlist`); none of the above touches it.

## Day-to-day

- Feature work: branch → PR → CI green → merge to `main` → production ships.
- Local backend: `npx convex dev`. Seed reviewable data with
  `npx convex run seed:demo`.
- Secrets are never in the repo. Backend secrets live in the Convex deployment's
  environment variables; the deploy key lives in Vercel.
