import { defineConfig } from "vitest/config";

// Convex backend tests run against `convex-test`, an in-memory implementation
// of the Convex runtime — no `convex dev` process required. The edge-runtime
// environment matches Convex's V8 isolate more closely than jsdom/node.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
