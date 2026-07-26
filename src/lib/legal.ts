// Where the published Privacy Policy and Terms of Use live.
//
// They are static HTML generated from `docs/legal/*.md` by `pnpm build:legal`
// and served by the web deployment (see `vercel.json`), not routes in this app
// — the web build is `output: "single"`, so an in-app route would hand a
// crawler an empty shell. Google's OAuth verification reads the privacy policy
// URL that way, and so does an app-store review.
//
// Native has no local copy of either document, so both platforms open the same
// canonical URLs. `EXPO_PUBLIC_SITE_URL` is the override for the window where
// `dhee.app` is not yet pointed at the deployment and the pages are only
// reachable at the `*.vercel.app` origin.
const site = (process.env.EXPO_PUBLIC_SITE_URL ?? "https://dhee.app").replace(
  /\/$/,
  "",
);

export const legalUrls = {
  privacy: `${site}/privacy`,
  terms: `${site}/terms`,
  safety: `${site}/safety`,
} as const;
