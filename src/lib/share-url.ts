// Where a shared conversation lives: <site>/s/<slug>.
//
// The canonical site is the same one the legal pages use (see site.ts), but
// the web build prefers whatever origin it is actually being served from. A
// Vercel preview answers on a per-branch hostname that `EXPO_PUBLIC_SITE_URL`
// cannot name, and a link minted there has to open on that deployment rather
// than on production, where the share row does not exist.
import { site } from "./site";

/** Pure half, so the origin rules are testable without a browser. */
export function shareUrl(slug: string, origin?: string | null): string {
  const base = (origin ?? site).replace(/\/$/, "");
  return `${base}/s/${slug}`;
}

// Deliberately not `Platform.OS === "web"`: importing react-native here would
// pull Flow-typed source into the Vitest run and cost this module its test.
// React Native defines a `window`, so the http check is what distinguishes a
// real browser origin from the shim.
function browserOrigin(): string | null {
  const origin =
    typeof window === "undefined" ? undefined : window.location?.origin;
  return origin?.startsWith("http") ? origin : null;
}

/** The link to hand out for `slug`, on whichever platform this is. */
export function shareLinkFor(slug: string): string {
  return shareUrl(slug, browserOrigin());
}
