import { convexTest } from "convex-test";
// Direct file path (not the package subpath) so Vite bypasses the package's
// `exports` field, which doesn't expose `./src/component/schema`.
import componentSchema from "../node_modules/@convex-dev/agent/src/component/schema";
import type { TestConvex } from "convex-test";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

// Shared harness for Convex backend tests. `convex-test` runs functions against
// an in-memory Convex runtime — no `convex dev` needed. See docs/build/README.md.
//
// NOTE: this file is `*.setup.ts`, not `*.test.ts`, so Vitest does not treat it
// as a suite (see `include` in vitest.config.ts).

// Our own function modules, minus test/setup files.
const modules = import.meta.glob([
  "./**/*.ts",
  "!./**/*.test.ts",
  "!./**/*.setup.ts",
]);

// The agent component's source modules, so functions that call into
// `components.agent` (createThread, saveMessage, getThreadMetadata) work.
const agentModules = import.meta.glob([
  "../node_modules/@convex-dev/agent/src/component/**/*.ts",
  "!../node_modules/@convex-dev/agent/src/component/**/*.test.ts",
]);

/** A convex-test instance with the agent component registered. */
export function initTest(): TestConvex<typeof schema> {
  const t = convexTest(schema, modules);
  t.registerComponent("agent", componentSchema, agentModules);
  return t;
}

/** Insert a bare user row and return its id. */
export async function createUser(
  t: TestConvex<typeof schema>,
): Promise<Id<"users">> {
  return await t.run(async (ctx) => await ctx.db.insert("users", {}));
}

/** Scope calls to a signed-in user. Convex Auth reads `userId` from the
 *  identity subject's first `|`-delimited segment. */
export function asUser(t: TestConvex<typeof schema>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|testsession` });
}
