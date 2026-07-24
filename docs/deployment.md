# Deployment & environments

Dhee runs two environments, both hosted on Vercel with the Convex backend
deployed from the Vercel build (`vercel.json`). GitHub Actions does **not** deploy
(it only runs CI — see `.github/workflows/ci.yml`).

## Topology

| Environment | Git branch  | Domain         | Convex deployment                     | Vercel env |
| ----------- | ----------- | -------------- | ------------------------------------- | ---------- |
| Production  | `main`      | `dhee.app`     | production                            | Production |
| Staging     | `dev`       | `dev.dhee.app` | preview deployment named `dev`        | Preview    |
| PR previews | any PR head | `*.vercel.app` | preview deployment named after branch | Preview    |

How it works: the build runs
`npx convex deploy --cmd 'pnpm expo export -p web' --cmd-url-env-var-name EXPO_PUBLIC_CONVEX_URL`.
`convex deploy` chooses its target **from the deploy key it's given**, and injects
that deployment's URL into `EXPO_PUBLIC_CONVEX_URL` for the web build:

- With a **production** deploy key (Vercel Production env) → deploys to the
  production Convex deployment.
- With a **preview** deploy key (Vercel Preview env) → creates/updates a Convex
  **preview deployment named after the git branch** (`VERCEL_GIT_COMMIT_REF`), so
  `dev` → a `dev` preview deployment, and each PR gets its own.

So the same `vercel.json` serves all environments; only the per-environment
`CONVEX_DEPLOY_KEY` differs. Preview deployments are available on the free Convex
plan; note they are **auto-cleaned 5 days after creation** (14 days on Pro), so a
long-lived `dev` staging needs to be redeployed periodically (any push to `dev`).

## One-time setup

Steps that require dashboard / DNS / secret access are marked **[you]** — they
can't be scripted from the repo. Do them in order.

### 1. Convex — preview deploy key + preview env vars **[you]**

In the Convex dashboard for the Dhee project:

1. **Generate a Preview Deploy Key**: Project Settings → Deploy Keys → _Generate
   Preview Deploy Key_. Copy it.
2. **Set default env vars for preview deployments** (Settings → Environment
   Variables → the "Preview" defaults section) so staging/PR backends have what
   they need — mirror production's:
   `OPENROUTER_API_KEY`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USERNAME`,
   `EMAIL_PASSWORD`, `AUTH_EMAIL_FROM`, `JWT_PRIVATE_KEY`, `JWKS`,
   `MD_MCP_URL` (optional), and `SITE_URL=https://dev.dhee.app`.
   (Reusing the production `JWT_PRIVATE_KEY`/`JWKS` for staging is fine.)
3. Make sure the **production** deployment's `SITE_URL` is `https://dhee.app`.

### 2. Vercel — per-environment deploy keys **[you]**

The `CONVEX_DEPLOY_KEY` is currently set for **Production only**, which is why
preview builds fail. Add the preview key (values are secrets — enter them
yourself; never commit them):

```bash
# From the repo root (already linked to the dhee-app project).
vercel env add CONVEX_DEPLOY_KEY preview     # paste the Convex *preview* deploy key

# Remove the static preview value so the build-time injection is authoritative:
vercel env rm EXPO_PUBLIC_CONVEX_URL preview
```

Adding the preview key alone turns the failing Vercel CI check green.

### 3. Git — create the long-lived `dev` branch

After the preview key exists (so its first build succeeds):

```bash
git branch dev main
git push -u origin dev
```

Vercel builds `dev` as a Preview; Convex creates a `dev` preview deployment.

### 4. Vercel — domains **[you]**

In the dhee-app project → Settings:

1. **Git → Production Branch** = `main` (confirm).
2. **Domains**:
   - Add **`dhee.app`** (and optionally `www.dhee.app` redirecting to it) and
     assign it to **Production**. Set `dhee.app` as the primary production domain.
   - Change **`dev.dhee.app`** so its **Git Branch = `dev`** (it currently serves
     Production). Now it tracks the `dev` staging deployment.

### 5. DNS **[you]**

`dhee.app` currently has no Vercel record. At the DNS provider (nameservers are
Google), add what Vercel shows for each domain — typically:

- `A  dhee.app  76.76.21.21`
- `CNAME  dev  cname.vercel-dns.com.` (for `dev.dhee.app`)
- `CNAME  www  cname.vercel-dns.com.` (if using `www.dhee.app`)

Vercel verifies automatically once the records propagate.

> The waitlist lives on a separate domain (`dhee.co`) and a separate Vercel
> project (`dhee-waitlist`); none of the above touches it.

## Verifying

- Push to `dev` → `https://dev.dhee.app` serves the app against the `dev` Convex
  preview deployment.
- Merge to `main` → `https://dhee.app` serves the app against the production
  Convex deployment.
- The Vercel check on PRs goes green (previews now have a deploy key).

## Day-to-day

- Feature work: branch → PR (gets its own preview) → merge to `main`.
- To refresh staging: merge/push to `dev` (also keeps the preview deployment from
  being auto-cleaned).
- Secrets are never in the repo; they live in Convex (backend) and Vercel (build)
  per environment.
