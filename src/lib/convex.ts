import { ConvexReactClient } from "convex/react";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_URL is not set. Run `pnpm convex:dev` once to populate .env.local.",
  );
}

export const convex = new ConvexReactClient(url, {
  unsavedChangesWarning: false,
});

// Session storage moved to the Better Auth client (src/lib/auth-client.ts),
// which owns the SecureStore/cookie split per platform.
