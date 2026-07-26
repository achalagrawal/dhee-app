// Is this backend someone's local `convex dev --local`, or a cloud deployment?
//
// Three behaviours key off the answer, and all of them are the kind that must
// never leak into production: widening the OAuth redirect allowlist to Expo Go
// (lib/redirect.ts), logging sign-in codes in the clear (auth.ts), and skipping
// the SES send when a new developer hasn't been given AWS keys (email.ts).
//
// Always an exact hostname match on a parsed URL, never a substring test —
// `https://127.0.0.1.evil.example` contains "127.0.0.1" as text and is not
// loopback at all.

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLoopback(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}
