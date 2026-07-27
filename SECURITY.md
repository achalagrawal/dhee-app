# Security Policy

## Reporting a vulnerability

**Please don't open a public issue.** Use GitHub's private reporting instead:

👉 **[Report a vulnerability](https://github.com/achalagrawal/dhee-app/security/advisories/new)**

That creates an advisory only the maintainer can see, so the problem can be
fixed before it's public. Expect a first response within a few days. If you
don't hear back, email <achalxyz@gmail.com> with `[dhee-security]` in the subject.

Please include what you'd need yourself: what the issue is, how to reproduce it,
and what an attacker could actually do with it.

## What's in scope

Dhee is a personal AI journal — the data it holds is unusually sensitive, so
anything touching **data isolation** is the highest priority:

- One user reading, writing, or inferring another user's threads, memories,
  or documents (missing auth checks in `convex/` functions are the main risk)
- Authentication or session bypass
- Prompt injection that causes the agent to leak another user's data or call
  tools it shouldn't
- Secrets exposed in the client bundle, logs, or error messages
- Dependency vulnerabilities with a demonstrated path to exploitation here

## What's out of scope

- Anything requiring physical access to an already-unlocked device
- Findings from automated scanners with no demonstrated impact
- Missing hardening headers on the marketing/legal pages with no exploit path
- Social engineering, spam, or denial of service by volume
- Vulnerabilities in Convex, Vercel, Expo, or OpenRouter themselves — report
  those to those vendors (we'll happily help you route it)

## Supported versions

Dhee ships continuously from `main`. Only the currently deployed version is
supported; there are no maintained release branches.

## For contributors

The most common way to introduce a security bug here is a Convex function that
forgets to scope a query to the calling user. Every query and mutation must
derive identity from the auth context — never from a client-supplied argument.
Backend tests use `asUser` from `convex/test.setup.ts`; a new backend feature
should include a test proving another user _can't_ reach the data.

CI runs with no secrets at all, and no GitHub Actions secrets are configured —
production credentials live only in Vercel. Please keep it that way: if a
workflow ever needs a secret, raise it in a PR discussion first.
