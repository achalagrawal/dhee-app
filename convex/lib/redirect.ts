// Where Convex Auth is allowed to send someone after an OAuth sign-in.
//
// This is the security-critical half of Google sign-in: the redirect carries
// the OAuth `code`, so anything we allow here is somewhere an attacker could
// have that code delivered. Convex Auth's default (relative paths and SITE_URL)
// is exactly right for web but rejects the deep link native needs, so we widen
// it by the smallest amount that makes Expo work — and by exact origin/scheme
// match, never a substring test.

import { isLoopback } from "./backend";

// Must match `expo.scheme` in app.json.
const APP_SCHEME = "dhee:";

// Expo Go serves the app over exp:// from whatever LAN address the dev machine
// has, which we can't know ahead of time. Allowing that in production would be
// an open redirect, so it's permitted only when the backend itself is loopback
// — i.e. someone's local `convex dev`.
const EXPO_GO_SCHEME = "exp:";

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function resolveRedirect(
  redirectTo: string,
  env: { siteUrl?: string; convexSiteUrl?: string },
): string {
  // Relative paths and bare query strings stay on whatever origin served the
  // app, so they're safe by construction. "//host" is not relative — it's
  // protocol-relative — and falls through to the parsed checks below.
  if (redirectTo.startsWith("?")) return redirectTo;
  if (redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    return redirectTo;
  }

  let parsed: URL;
  try {
    parsed = new URL(redirectTo);
  } catch {
    throw new Error(`Redirect to ${redirectTo} is not allowed.`);
  }

  if (parsed.protocol === APP_SCHEME) return redirectTo;

  if (parsed.protocol === EXPO_GO_SCHEME && isLoopback(env.convexSiteUrl)) {
    return redirectTo;
  }

  // Origin comparison, not startsWith: "https://dhee.app.evil.example" has
  // SITE_URL as a text prefix but is a different site entirely.
  const siteOrigin = env.siteUrl ? originOf(env.siteUrl) : null;
  if (siteOrigin !== null && parsed.origin === siteOrigin) return redirectTo;

  throw new Error(`Redirect to ${redirectTo} is not allowed.`);
}
