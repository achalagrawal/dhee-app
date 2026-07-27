# Spec: Continue with Google (OAuth)

**Epic:** 10 — Auth & onboarding
**Status when written:** ⬜ (rewritten for Better Auth — see specs/auth-foundation.md)

## Mockup reference

- File: `mockup/project/Dhee.dc.html`
- Section: `<!-- ===== AUTH MODAL ===== -->`, the `authChoose` step, around line 1672.
- What it looks like: a full-width dark button — `background: var(--text)`,
  `color: var(--bg)`, `border-radius: 12px`, `padding: 13px`, 15px/600 label —
  with a circular white "G" badge (18px) to the left of "Continue with Google".
  It sits **above** the email input, separated from it by a hairline "or"
  divider (`var(--border)` rules either side, 12.5px `var(--text-faint)` label).

We render it on the existing full-screen `sign-in.tsx`, not a modal — "Auth as
modal" is a separate 🟡 row in the tracker.

## Behavioral contract

- The Google button is the first thing on the sign-in screen; email is the
  fallback below the "or".
- Pressing it disables both paths (shared `busy`) so a person can't start an
  email code mid-OAuth.
- **Web:** the tab navigates to Google. On return, the `?code=` in the URL is
  consumed automatically and the person lands signed in.
- **Native:** a system browser sheet opens over the app. On success it closes
  and the app continues; on dismiss the screen returns to idle with no error —
  cancelling is not a failure.
- **The wait after Google says yes is never shown as a signed-out screen.**
  Coming back from Google is not the same as being signed in: the session
  arrives through a one-time token (`${SITE_URL}/?ott=…`) that the Convex
  provider exchanges over three round trips once the app has mounted, and for
  those seconds Convex auth is indistinguishable from signed out. `SigningIn`
  holds that gap on both platforms — the sign-in screen's own wordmark and
  tagline over "Signing you in…" — so the router never bounces someone back to
  the button they just pressed. `src/lib/oauth-return.ts` reads the token from
  the URL at module load, before the provider strips it, and times the wait out
  after 12s so a token that will never verify still ends at sign-in.
- Any genuine failure shows the same `somethingWentWrong` copy the email path
  uses. The Google error is never surfaced raw.
- A person who signed in with email OTP and later uses Google **with the same
  address** lands in the same account — Better Auth links accounts by verified
  email for providers listed in `trustedProviders`, and Google's email is
  verified. **This is the one behaviour that must be checked live before the
  row goes green.**
- First Google sign-in seeds the profile: their Google name prefills the
  onboarding name field (still editable) and their Google photo becomes their
  avatar. Neither is required — a missing name or photo just leaves the field
  empty, and a failed photo fetch never blocks sign-in.

### Not in this feature

Guest mode ("Maybe later"), the terms + "not a medical or crisis service"
footer, and the modal treatment. Each is its own ⬜ row in Epic 10.

## Backend contract

- `convex/auth.ts` — Google is a `socialProviders.google` entry on `betterAuth`,
  with `account.accountLinking.trustedProviders: ["google"]` so a code sign-in
  and a Google sign-in on the same verified address land in one account.
  Profile seeding is no longer an auth callback: the `triggers.user.onCreate`
  hook inserts the `users` mirror row plus the `profiles` stub and schedules
  the avatar import.
- `convex/lib/redirect.ts` — `resolveRedirect(redirectTo, { siteUrl, convexSiteUrl })`,
  a pure function so it's testable without a deployment. Allows relative paths,
  `SITE_URL`-prefixed absolute URLs, and `dhee://`; allows `exp://` only when
  `convexSiteUrl` is loopback (Expo Go in dev); throws otherwise. Prefix
  matching against an explicit list — a loose check here is an open redirect
  that leaks the OAuth `code`.
- `convex/users.ts`:
  - `importOAuthAvatar` (`internalAction`, args `{ userId, url }`) — fetch the
    image, `ctx.storage.store()` it, hand the id to the mutation below. Errors
    are logged and swallowed.
  - `setAvatarForUser` (`internalMutation`, args `{ userId, storageId }`) — the
    userId-taking sibling of `setAvatar`, which reads `ctx.auth` and so can't be
    reused from a scheduled action. Deletes the previous photo, same as `setAvatar`.
- Schema changes: none. `authTables` already stores `name`/`email`/`image` on
  `users`, and `profiles.avatarId` already exists.

### Tests (write first) — `convex/auth.test.ts`

`convex-test` can't drive a real OAuth roundtrip, so these cover our own logic:

- `resolveRedirect` allows `/onboarding`, a `SITE_URL`-prefixed URL, and
  `dhee://auth`; **rejects `https://evil.example`** and rejects `exp://` when
  `convexSiteUrl` is not loopback.
- First Google sign-in creates a `profiles` row carrying the Google name with
  `onboarded: false`, and schedules `users.importOAuthAvatar` — asserted against
  `_scheduled_functions`, never run.
- `completeOnboarding` afterwards flips `onboarded` and keeps `avatarId`.
- An email-OTP sign-in creates no stub and schedules nothing.

## UI wiring

- `src/lib/oauth.ts` (new) — `signInWithGoogle(signIn)`, holding the platform
  split: web calls `signIn("google")` and lets the provider navigate; native
  passes `redirectTo` from `Linking.createURL("/")`, opens the returned URL with
  `WebBrowser.openAuthSessionAsync`, parses `code` out of the result with
  `Linking.parse` (RN's `URL` is incomplete), and calls `signIn("google", { code })`.
- `app/sign-in.tsx` — the button + divider above the email input.
- `app/onboarding.tsx` — seed the `name` field from `currentProfile().name`.
- `src/lib/i18n.ts` — `continueWithGoogle`, `or` in `en` and `hi`.
- New dependency: `expo-web-browser`. `expo-auth-session` is **not** needed —
  `Linking.createURL` from the already-installed `expo-linking` builds the same
  redirect URI, including Expo Go's `exp://` form.
- Replaces stub: no — this control doesn't exist in the app yet.

## Deployment setup

One Google **Web application** OAuth client covers all platforms: the browser
hits Convex's HTTP endpoint and Convex exchanges the code server-side, so no
secret ships in the app bundle. Authorized redirect URI per deployment is
`${CONVEX_SITE_URL}/api/auth/callback/google`. Deployment env vars:
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `SITE_URL` (documented in `README.md`).

## Verification

- [ ] Backend tests green (`vitest`).
- [ ] Visual check in preview browser matches mockup (screenshot attached to PR).
- [ ] Native flow checked once in the iOS simulator.
- [ ] Flip status in `FEATURES.md`.
