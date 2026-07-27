import { useEffect, useState } from "react";

// The gap between "Google says yes" and "Convex says authenticated".
//
// Web sign-in doesn't come back with a session in hand. Better Auth's callback
// redirects to `${SITE_URL}/?ott=<token>` and ConvexBetterAuthProvider trades
// that one-time token for a session *after* the app has mounted — verify, then
// getSession, then convex.token, three round trips on top of a cold load of the
// bundle. For those two or three seconds Convex auth reports `isLoading: false,
// isAuthenticated: false`, which is exactly what a signed-out visitor looks
// like, so the router sends the person back to the screen they just came from.
//
// Nothing here makes the exchange faster. It makes the app stop claiming the
// sign-in failed while it's still happening.

/** Better Auth's cross-domain plugin names the handoff token `ott`. */
const TOKEN_PARAM = "ott";

// Long enough for the three round trips on a slow connection, short enough that
// a token that will never verify — expired, already spent, tampered with —
// doesn't strand someone on a spinner. Falling back to sign-in is the correct
// end state for those; it just must not be the *first* thing we do.
const HANDOFF_TIMEOUT_MS = 12_000;

/** Does this URL carry a session handoff back from an OAuth provider? */
export function hasHandoffToken(href: string): boolean {
  try {
    return new URL(href).searchParams.has(TOKEN_PARAM);
  } catch {
    return false;
  }
}

// Read once, at module load. The provider strips the parameter with
// `history.replaceState` as soon as its effect runs, so by the time any screen
// renders the URL no longer says where the person came from — this module has
// to have looked first. Native has no URL to read; `signInWithGoogle` resolving
// is its equivalent signal, and sign-in.tsx handles that directly.
const arrivedFromOAuth =
  typeof window !== "undefined" && hasHandoffToken(window.location?.href ?? "");

/**
 * True while a web OAuth sign-in is still being exchanged for a session.
 *
 * Consult it only on the unauthenticated path: once the session lands,
 * `<Authenticated>` takes over and this stops mattering.
 */
export function useOAuthHandoff(): boolean {
  const [pending, setPending] = useState(arrivedFromOAuth);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), HANDOFF_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  return pending;
}
