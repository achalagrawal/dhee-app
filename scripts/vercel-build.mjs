// The Vercel build. Deploys the Convex backend, then builds the web bundle
// against it — `npx convex deploy --cmd` does both in one pass, running the
// build with the deployment's URL already in the environment.
//
// Production is unchanged by this file: one `convex deploy` against the
// deployment the production `CONVEX_DEPLOY_KEY` names.
//
// Previews are why this is a script rather than a line in vercel.json. With a
// *preview* deploy key, `convex deploy` provisions a backend of its own named
// after the git branch (it reads `VERCEL_GIT_COMMIT_REF` — so the
// `--preview-name` below targets the same one), and two things have to happen
// that a single command can't express:
//
//   1. The fresh backend has no data, so `seed:demo` runs against it.
//   2. Better Auth needs to know where the app is being served from, and that
//      is only knowable here. `SITE_URL` gets the stable per-branch alias —
//      it's the origin people are redirected back to, and it survives further
//      pushes — while `EXTRA_TRUSTED_ORIGINS` picks up the immutable
//      per-deployment URL that Vercel links from the PR comment, so a tester
//      arriving by either hostname can sign in. Both are read per request, so
//      setting them after the push is in time.
//
// Set DRY_RUN=1 to print the commands instead of running them.

import { spawnSync } from "node:child_process";

const dryRun = process.env.DRY_RUN === "1";
const isPreview = process.env.VERCEL_ENV === "preview";

function run(command, args) {
  const shown = args.map((arg) => (arg.includes(" ") ? `'${arg}'` : arg));
  console.log(`$ ${command} ${shown.join(" ")}`);
  if (dryRun) return;
  // No shell: every argument is passed through as-is, so `--cmd 'pnpm
  // build:web'` needs no quoting and a branch name can't be interpreted.
  const { status, error } = spawnSync(command, args, { stdio: "inherit" });
  if (error) throw error;
  if (status !== 0) process.exit(status ?? 1);
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set — expected on a Vercel preview build.`);
    process.exit(1);
  }
  return value;
}

run("npx", [
  "convex",
  "deploy",
  "--cmd",
  "pnpm build:web",
  "--cmd-url-env-var-name",
  "EXPO_PUBLIC_CONVEX_URL",
  // Ignored when the target is a production deployment.
  ...(isPreview ? ["--preview-run", "seed:demo"] : []),
]);

if (isPreview) {
  const branch = required("VERCEL_GIT_COMMIT_REF");
  const setEnv = (name, value) =>
    run("npx", ["convex", "env", "set", "--preview-name", branch, name, value]);

  setEnv("SITE_URL", `https://${required("VERCEL_BRANCH_URL")}`);
  setEnv("EXTRA_TRUSTED_ORIGINS", `https://${required("VERCEL_URL")}`);
}
