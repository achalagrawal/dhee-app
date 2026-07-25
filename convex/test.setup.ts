import type { MessageDoc } from "@convex-dev/agent";
import { convexTest } from "convex-test";
// Direct file path (not the package subpath) so Vite bypasses the package's
// `exports` field, which doesn't expose `./src/component/schema`.
import componentSchema from "../node_modules/@convex-dev/agent/src/component/schema";
import type { TestConvex } from "convex-test";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

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

/** Write a finished assistant reply straight into the agent component, the
 *  way a completed `streamReply` would have left it. This is how tests build
 *  a real exchange without the model ever being called. */
export async function seedReply(
  t: TestConvex<typeof schema>,
  userId: Id<"users">,
  threadId: string,
  text: string,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.runMutation(components.agent.messages.addMessages, {
      threadId,
      userId,
      agentName: "Dhee",
      messages: [
        { message: { role: "assistant", content: text }, status: "success" },
      ],
    });
  });
}

/** A full exchange: the user turn through the real `sendMessage` (so all its
 *  bookkeeping runs), the reply seeded directly. */
export async function seedExchange(
  t: TestConvex<typeof schema>,
  userId: Id<"users">,
  threadId: string,
  prompt: string,
  reply: string,
): Promise<void> {
  await asUser(t, userId).mutation(api.chat.sendMessage, { threadId, prompt });
  await seedReply(t, userId, threadId, reply);
}

/** The thread's message docs, oldest first. */
export async function threadMessages(
  t: TestConvex<typeof schema>,
  threadId: string,
): Promise<MessageDoc[]> {
  const { page } = await t.run(
    async (ctx) =>
      await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
        threadId,
        order: "asc",
        paginationOpts: { cursor: null, numItems: 100 },
      }),
  );
  return page;
}
