# Spec: Auth foundation on Better Auth

**Epic:** 10 — Auth & onboarding
**Status when written:** 🟡 (replaces a working `@convex-dev/auth` setup)

This is infrastructure, not a mockup feature. It replaces the auth library
underneath the existing sign-in screen; the screen's behaviour is unchanged
except that "Continue with Google" becomes possible.

## Why

`@convex-dev/auth` is on `0.0.94` — actively maintained, but a `0.0.x` line
commits to no API stability, and Convex's own labs effort is behind Better Auth.
The decision was taken _before_ writing Google OAuth rather than after, because
building the same feature twice on two providers is the expensive path. The
prior Convex Auth work is preserved on the `google-oauth-convex-auth` branch.

Better Auth was chosen over Clerk on one point: **it stores user records in our
own Convex deployment**, so the seven `v.id("users")` foreign keys in
`schema.ts` survive, and a person who forks this repo still needs no
third-party account to run it.

## Architecture decision: the app does not query the component to authorize

The component owns `user`, `session`, `account`, `verification`, `twoFactor`,
`rateLimit`, and `jwks` tables. We keep **our own `users` table** alongside it,
populated by `triggers.user.onCreate`.

`requireUserId` therefore reads only `ctx.auth.getUserIdentity()` and looks up
our own table by index — it never calls into the component. This matters:

- All ~25 call sites of `requireUserId` are unchanged.
- `convex-test` needs no component registration; `asUser` stays a fake identity
  plus a row, so the suite stays in-memory and fast.
- The component stays at the edges: HTTP routes and triggers only.

`identity.subject` is the component's user `_id` (confirmed in the component's
`create-client.ts`, which looks the user up by `_id: identity.subject`).

## Backend contract

- `convex/convex.config.ts` — `app.use(betterAuth)`.
- `convex/schema.ts` — drop `...authTables`. Add:
  ```ts
  users: defineTable({
    authId: v.string(), // component user _id, arrives as the JWT subject
    email: v.string(),
    name: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_auth_id", ["authId"])
    .index("by_email", ["email"]);
  ```
  The seven `userId: v.id("users")` foreign keys are untouched.
- `convex/auth.ts` — `createClient<DataModel>(components.betterAuth, { triggers, authFunctions })`,
  exporting `onCreate`/`onUpdate`/`onDelete` from `authComponent.triggersApi()`.
  `createAuth(ctx)` configures `emailOTP`, `google`, `expo`, and `convex` plugins.
- `convex/users.ts` — `requireUserId` maps subject → `Id<"users">`;
  `seedProfileFromOAuth` moves into `triggers.user.onCreate`.
- `convex/http.ts` — `authComponent.registerRoutes(http, createAuth)`.
- `convex/email.ts` — SES v2 HTTP API via `aws4fetch`, replacing nodemailer.
  `"use node"` disappears from the codebase entirely.
- `convex/devEmail.ts` — `sesCheck` replaces `smtpCheck`; SES v2 GetAccount is
  read-only, so it proves the credentials and reports sandbox status without
  mailing anyone.
- Deleted: `convex/EmailOTP.ts`, `authTables`, `nodemailer`, `@types/nodemailer`,
  `@convex-dev/auth`, `@auth/core`, `@oslojs/crypto`.

### Tests (write first)

- `resolveRedirect` — ported unchanged from the Convex Auth branch; it is a pure
  function and its open-redirect guard is provider-independent.
- `requireUserId` — throws when unauthenticated; resolves the right
  `Id<"users">` for a known `authId`; throws for an identity with no row.
- **Account linking** — a `user` trigger firing twice for the same email must
  not create two `users` rows. This is the regression Convex Auth handled for
  us and Better Auth must be configured to handle.
- Profile seeding — first sign-in with a name/image creates the `profiles` stub
  and schedules `users.importOAuthAvatar`, asserted against
  `_scheduled_functions`, never run.

## Environment variables

New: `BETTER_AUTH_SECRET`, `SITE_URL` (already present), `AWS_REGION`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (IAM, **not** SES SMTP creds).
Retired: `JWT_PRIVATE_KEY`, `JWKS`, `EMAIL_HOST`, `EMAIL_PORT`,
`EMAIL_USERNAME`, `EMAIL_PASSWORD`.

## Open questions to resolve against a live deployment

These cannot be settled by `convex-test`, which never runs the component's HTTP
surface. Each needs one `npx convex dev` run:

1. **Account linking semantics.** Better Auth's `account.accountLinking` must be
   configured to link a Google sign-in to an existing email-OTP user with the
   same verified address. Verify with two real sign-ins before trusting it.
2. **Native deep-link redirect.** `@better-auth/expo` has its own
   `trustedOrigins` handling. Confirm whether `convex/lib/redirect.ts` is still
   load-bearing or now duplicates the plugin; do not delete it until then.
3. **JWKS / OIDC route.** `registerRoutes` mounts
   `/.well-known/openid-configuration`; confirm `auth.config.ts` points at the
   right issuer and that Convex validates the token.

## Verification

- [ ] `pnpm typecheck`, `pnpm test`, `pnpm format:check` green.
- [ ] Email OTP round trip against a real deployment.
- [ ] Google sign-in on web and on a native build.
- [ ] Same-email linking produces one account, not two.
- [ ] Flip Epic 10 rows in `FEATURES.md`.
