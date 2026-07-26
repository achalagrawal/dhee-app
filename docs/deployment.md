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
npx convex deploy --cmd 'pnpm build:web' --cmd-url-env-var-name EXPO_PUBLIC_CONVEX_URL
```

`convex deploy` picks its target **from the `CONVEX_DEPLOY_KEY` it's given** —
set in Vercel for the Production environment only, holding a Convex _production_
deploy key. It pushes the backend, then sets `EXPO_PUBLIC_CONVEX_URL` to that
deployment's URL and runs the Expo web export inside it. The frontend bundle
therefore can't point at the wrong backend: one key decides both halves.

`build:web` is `build:legal && expo export -p web`. The first step renders
`docs/legal/*.md` into `public/*.html`, which the export copies into `dist/`;
`vercel.json` then serves them at `/privacy` and `/terms`. Export directly with
`expo export` and the site builds without its legal pages, which is why the
deploy goes through the script. See [legal/README.md](legal/README.md) —
those URLs are what Google's OAuth verification and the app stores are given.

## Preview deployments are off

`vercel.json` disables automatic deployments for every branch except `main`:

```json
"git": { "deploymentEnabled": { "**": false, "main": true } }
```

(A branch matching several rules deploys if any rule is `true`, so `main` wins
over the `**` rule.) Pushes and PRs get no Vercel build and no deployment check —
correctness is enforced by CI, and you review changes by running the app locally.

The pattern is `**`, not `*`. Vercel matches these keys with
[minimatch](https://vercel.com/docs/project-configuration/git-configuration),
where `*` stops at a `/` — so under `*` every slash-named branch (`feat/…`,
`fix/…`, `perf/…`) matched no rule, fell back to the default of `true`, and
deployed anyway. Only flat branch names were ever suppressed, and `main` deploys
either way, which is why the hole stayed invisible for a while.

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
