import type { MessageDoc } from "@convex-dev/agent";
import { convexTest } from "convex-test";
// Direct file path (not the package subpath) so Vite bypasses the package's
// `exports` field, which doesn't expose `./src/component/schema`.
import componentSchema from "../node_modules/@convex-dev/agent/src/component/schema";
import type { TestConvex } from "convex-test";
import { api, components } from "./_generated/api";
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

// Stands in for the Better Auth component's user `_id`, which is what arrives
// as the JWT subject in production. Derived from our own row id so `asUser`
// can build an identity without a second database read — the same trick the
// Convex Auth harness used with its `userId|session` subject.
const testAuthId = (userId: Id<"users">) => `auth:${userId}`;

/** Insert a user row and return its id.
 *
 *  The tests never register the auth component. `requireUserId` resolves an
 *  identity by reading our own `by_auth_id` index (see users.ts), so a row
 *  plus a matching identity is the whole of what "signed in" means here. */
export async function createUser(
  t: TestConvex<typeof schema>,
  overrides: { email?: string; name?: string } = {},
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      // Patched immediately below; the real id isn't known until insert.
      authId: "",
      email: overrides.email ?? `${crypto.randomUUID()}@example.test`,
      name: overrides.name,
      createdAt: Date.now(),
    });
    await ctx.db.patch(userId, { authId: testAuthId(userId) });
    return userId;
  });
}

/** Scope calls to a signed-in user. */
export function asUser(t: TestConvex<typeof schema>, userId: Id<"users">) {
  return t.withIdentity({ subject: testAuthId(userId) });
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
