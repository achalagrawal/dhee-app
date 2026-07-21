import { createThread } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { buildSystemPrompt, dhee } from "./agents/dhee";

// Dev-only smoke test. Runs one full agent turn — model call, corpus tool
// use, and the plain-language rule — and reports what happened:
//
//   npx convex run dev:smokeTest '{"prompt":"..."}'
//
// Worth running after changing CHAT_MODEL, since a bad slug or a model that
// ignores the tools both surface here rather than in the app.

export const smokeTest = internalAction({
  args: { prompt: v.optional(v.string()) },
  returns: v.object({
    text: v.string(),
    toolsCalled: v.array(v.string()),
    finishReason: v.string(),
  }),
  handler: async (ctx, { prompt }) => {
    const threadId = await createThread(ctx, components.agent);
    const result = await dhee.generateText(
      ctx,
      { threadId },
      {
        prompt:
          prompt ??
          "I got the promotion I wanted and felt nothing. What's wrong with me?",
        system: buildSystemPrompt(""),
      },
    );

    const toolsCalled = result.steps
      .flatMap((step) => step.toolCalls ?? [])
      .map((call) => call.toolName);

    return {
      text: result.text,
      toolsCalled,
      finishReason: result.finishReason,
    };
  },
});
