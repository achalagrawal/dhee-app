// Extra origins the Better Auth handler should trust, beyond SITE_URL.
//
// This exists for preview deployments. A Vercel preview is reachable at two
// hostnames — the stable per-branch alias (`*-git-<branch>-*.vercel.app`) and
// the immutable per-deployment URL that Vercel links from the PR comment — and
// `SITE_URL` can only name one of them. Whichever one a tester lands on has to
// be an allowed origin or the sign-in call fails CORS with nothing in the
// response to explain it. See scripts/vercel-build.mjs, which sets the var.
//
// The list ends up in `Access-Control-Allow-Origin`, so entries are parsed and
// reduced to their origin rather than passed through: a trailing path or a
// stray space would otherwise be reflected verbatim, and anything that isn't a
// URL at all is dropped instead of silently widening the allowlist.

export function parseOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => {
      try {
        return new URL(entry.trim()).origin;
      } catch {
        return null;
      }
    })
    .filter((origin): origin is string => origin !== null);
}
