// The Convex *site* origin, derived from the API origin.
//
// A deployment answers on two hosts: `<name>.convex.cloud` for the client API,
// and `<name>.convex.site` for HTTP routes — which is where Better Auth's
// handler is mounted (convex/http.ts). Both are normally handed to the build as
// separate env vars, but a preview deployment's hostname is generated per
// branch, so only `EXPO_PUBLIC_CONVEX_URL` can be injected (by `convex deploy
// --cmd-url-env-var-name`). This recovers the other one.
//
// Only the cloud pairing is derivable. A local backend splits the two across
// ports rather than hostnames (3210 and 3211) and there is nothing in the URL
// to key off, so that case returns undefined and the caller falls back to the
// explicit env var `pnpm convex:dev` writes into `.env.local`.

export function convexSiteUrl(
  convexUrl: string | undefined,
): string | undefined {
  if (!convexUrl) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(convexUrl);
  } catch {
    return undefined;
  }
  // Suffix match on the parsed hostname, not the raw string: a host merely
  // ending in those characters is not a Convex deployment.
  if (!parsed.hostname.endsWith(".convex.cloud")) return undefined;
  parsed.hostname = parsed.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  return parsed.origin;
}
