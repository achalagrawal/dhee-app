# Deployment & environments

Dhee runs **one hosted environment**: production. It lives on Vercel, with the
Convex backend deployed from the Vercel build (`vercel.json`). GitHub Actions
does **not** deploy — it only runs CI (see `.github/workflows/ci.yml`).

## Topology

| Environment | Where it runs               | Git branch | Domain     | Convex deployment      |
| ----------- | --------------------------- | ---------- | ---------- | ---------------------- |
| Development | your machine (`convex dev`) | any        | localhost  | your local/dev backend |
| Production  | Vercel                      | `main`     | `dhee.app` | the production backend |

There is no staging environment and no per-PR preview. Feature work happens
locally against your own Convex dev deployment; merging to `main` ships.

## How the production build works

Vercel runs:

```
npx convex deploy --cmd 'pnpm expo export -p web' --cmd-url-env-var-name EXPO_PUBLIC_CONVEX_URL
```

`convex deploy` picks its target **from the `CONVEX_DEPLOY_KEY` it's given** —
set in Vercel for the Production environment only, holding a Convex _production_
deploy key. It pushes the backend, then sets `EXPO_PUBLIC_CONVEX_URL` to that
deployment's URL and runs the Expo web export inside it. The frontend bundle
therefore can't point at the wrong backend: one key decides both halves.

## Preview deployments are off

`vercel.json` disables automatic deployments for every branch except `main`:

```json
"git": { "deploymentEnabled": { "*": false, "main": true } }
```

(A branch matching several rules deploys if any rule is `true`, so `main` wins
over the `*` rule.) Pushes and PRs get no Vercel build and no deployment check —
correctness is enforced by CI, and you review changes by running the app locally.

Two things follow from this:

- Vercel's Preview environment has no `CONVEX_DEPLOY_KEY`, and doesn't need one.
  A leftover `EXPO_PUBLIC_CONVEX_URL` in Preview is inert; remove it if you like
  (`vercel env rm EXPO_PUBLIC_CONVEX_URL preview`).
- The setting is read from `vercel.json` **on the branch being pushed**, so a
  branch cut before this landed still deploys until it picks up `main`.

To re-enable previews later: drop the `git` block, generate a Convex _preview_
deploy key (dashboard → Project Settings → Deploy Keys), add it to Vercel's
Preview environment, and set the Preview default env vars in Convex so preview
backends have credentials. Each branch then gets its own throwaway Convex
deployment, auto-cleaned 5 days after creation (14 on Pro).

## Remaining setup

`dhee.app` has no DNS record pointing at Vercel yet — until it does, production
is only reachable at its `*.vercel.app` URL. In the dhee-app project:

1. **Git → Production Branch** = `main` (confirm).
2. **Domains** → add `dhee.app` (optionally `www.dhee.app` redirecting to it) and
   assign it to Production; make `dhee.app` the primary production domain.
   `dev.dhee.app` is unused now — remove it, or leave it aliased to production.
3. **DNS** (nameservers are Google) — add what Vercel shows, typically:
   - `A  dhee.app  76.76.21.21`
   - `CNAME  www  cname.vercel-dns.com.` (if using `www.dhee.app`)

Vercel verifies automatically once the records propagate.

> The waitlist lives on a separate domain (`dhee.co`) and a separate Vercel
> project (`dhee-waitlist`); none of the above touches it.

## Day-to-day

- Feature work: branch → PR → CI green → merge to `main` → production ships.
- Local backend: `npx convex dev`. Seed reviewable data with
  `npx convex run seed:demo`.
- Secrets are never in the repo. Backend secrets live in the Convex deployment's
  environment variables; the deploy key lives in Vercel.
