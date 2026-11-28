import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { classifierModel } from "../agents/config";
import {
  type RouteKind,
  classifyWith,
  classifyWithDecisions,
  routeTurn,
} from "../agents/router";

// Auto's router, run over a batch of messages, for checking it against
// hand-labelled questions before changing CLASSIFIER_SYSTEM or the kinds.
//
//   npx convex run evals/routing:classify '{"items":[{"id":"1","text":"…"}]}'
//
// Returns the decision for each item and nothing else; scoring against labels
// happens wherever the labels live. Labelled real questions must not be
// committed — they are people's words.
export const classify = internalAction({
  args: {
    items: v.array(
      v.object({
        id: v.string(),
        text: v.string(),
        previousText: v.optional(v.string()),
      }),
    ),
    concurrency: v.optional(v.number()),
    /** An OpenRouter slug to try in ROUTER_MODEL's place. */
    model: v.optional(v.string()),
    /** Use the Decisions API (e.g. Jev) with `model` instead of chat. */
    decisions: v.optional(v.boolean()),
    /** For decisions: how sure it must be that a turn is light. */
    minLightProbability: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      id: v.string(),
      tier: v.string(),
      kind: v.string(),
      by: v.string(),
      ms: v.number(),
    }),
  ),
  handler: async (
    _ctx,
    { items, concurrency, model, decisions, minLightProbability },
  ) => {
    const classify = decisions
      ? classifyWithDecisions({
          model: model ?? "typesafe/jev-1.14",
          apiKey: process.env.OPENROUTER_API_KEY ?? "",
          ...(minLightProbability !== undefined ? { minLightProbability } : {}),
        })
      : classifyWith(classifierModel(model));
    const out: Array<{
      id: string;
      tier: string;
      kind: RouteKind | string;
      by: string;
      ms: number;
    }> = [];
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const item = items[next++]!;
        const started = Date.now();
        const decision = await routeTurn(
          {
            text: item.text,
            hasImage: false,
            ...(item.previousText ? { previousText: item.previousText } : {}),
            deepTier: "reflective",
          },
          classify,
        );
        out.push({ id: item.id, ...decision, ms: Date.now() - started });
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency ?? 8, items.length) }, worker),
    );
    return out;
  },
});
