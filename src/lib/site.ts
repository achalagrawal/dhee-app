// The canonical site: where the app sends people, for links it hands out and
// pages it opens.
//
// `EXPO_PUBLIC_SITE_URL` is the override for the window where `dhee.app` is
// not yet pointed at the deployment and the site is only reachable at the
// `*.vercel.app` origin.
//
// The build scripts that generate crawler-facing HTML need the same value
// before any of this is compiled, so they keep their own copy of this line in
// scripts/lib/meta.mjs. If one moves, move both.
export const site = (
  process.env.EXPO_PUBLIC_SITE_URL ?? "https://dhee.app"
).replace(/\/$/, "");
