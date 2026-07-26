import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

// Tells Convex how to validate the JWTs Better Auth issues. The component
// holds the signing keys in its own `jwks` table and serves the public set
// from this deployment, so there is no keypair to generate or store — the
// `JWT_PRIVATE_KEY` / `JWKS` variables the Convex Auth setup needed are gone.
//
// `getAuthConfigProvider` also accepts a static `jwks` string to save a
// database read per token validation. Not worth the extra env var at this
// scale; revisit if auth latency ever shows up in a trace.
export default {
  providers: [getAuthConfigProvider()],
};
