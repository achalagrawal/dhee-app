import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { detectsCrisis } from "../lib/crisis";
import type { AnsweringTier } from "./models";

// Auto: which model answers this turn, decided per message.
//
// Why it exists. The 2026-11-28 usage review hand-labelled 600 questions:
// about half were things a cheap model does well — what a word means, where
// something is written, "ok, thanks", a short draft or translation — and the
// rest needed real thought: explaining or comparing ideas, someone's own life,
// long multi-part study questions. On Sonnet 5 every one of them cost about
// the same ($0.08), because the resent prompt dominates; on DeepSeek alone the
// deep half broke (12% of replies empty or in markup) or came back as walls of
// quotation. Auto sends each kind where it goes well.
//
// How it decides, cheapest first:
//
//   1. Rules that need no model: a crisis goes deep (the safety net should
//      never be the cheap path), a photo goes deep (DeepSeek reads no images),
//      and a bare acknowledgement stays light.
//   2. A small classifier call on the background model — a few hundred
//      tokens, a fraction of a cent, about a second. Rules alone misread
//      Hindi, Hinglish and the short follow-up whose weight is all in the
//      turn before it.
//   3. If the classifier fails or is slow, the turn goes where the previous
//      turn went, or light if there was none. A routing hiccup must never cost
//      a reply.
//
// A short follow-up stays on the previous turn's model: "and in the second
// book?" after a deep answer needs the same depth, and staying on one model
// keeps its prompt cache warm.

export type RouteKind =
  | "acknowledgement"
  | "term-lookup"
  | "find-text"
  | "translation"
  | "drafting"
  | "practical"
  | "short-follow-up"
  | "concept"
  | "comparison"
  | "personal"
  | "multi-part-study"
  | "refine-message";

export const ROUTE_KINDS: readonly RouteKind[] = [
  "acknowledgement",
  "term-lookup",
  "find-text",
  "translation",
  "drafting",
  "practical",
  "short-follow-up",
  "concept",
  "comparison",
  "personal",
  "multi-part-study",
  "refine-message",
] as const;

/** Light kinds answer on Quick; deep ones on the deep tier. */
const LIGHT: ReadonlySet<RouteKind> = new Set([
  "acknowledgement",
  "term-lookup",
  "find-text",
  "translation",
  "drafting",
  "practical",
]);

export type RouteDecision = {
  tier: AnsweringTier;
  kind: RouteKind | "crisis" | "attachment" | "fallback";
  by: "rule" | "classifier" | "fallback";
};

export type RouteInput = {
  /** What the person wrote this turn. */
  text: string;
  /** Whether this turn carries a photo. */
  hasImage: boolean;
  /** The person's previous message in this thread, if any, for follow-ups. */
  previousText?: string;
  /** Where the previous turn in this thread went, if it was routed. */
  previousTier?: AnsweringTier;
  /** The tier deep turns go to: Reflective where it is available. */
  deepTier: AnsweringTier;
};

// "ok", "thanks", "धन्यवाद", "ठीक है", 🙏 — a whole message of nothing but
// acknowledgement. Anything with a question in it is not one.
const ACK =
  /^(?:ok(?:ay)?|k|thanks?(?: you)?|thank u|ty|got it|great|nice|good|cool|sure|yes|no|hmm+|ji|haan|han|accha|achha|theek(?: hai)?|thik(?: hai)?|dhanyavaad|dhanyawad|shukriya|धन्यवाद|शुक्रिया|ठीक(?: है)?|अच्छा|हाँ|जी|बहुत अच्छा|नमस्ते|प्रणाम|🙏|👍|❤️|\s|[.!।,])+$/iu;

/** Rule-based routing: a decision when the message settles it alone. */
export function routeByRules(input: RouteInput): RouteDecision | null {
  if (detectsCrisis(input.text)) {
    return { tier: input.deepTier, kind: "crisis", by: "rule" };
  }
  if (input.hasImage) {
    return { tier: input.deepTier, kind: "attachment", by: "rule" };
  }
  const text = input.text.trim();
  if (text.length > 0 && text.length <= 40 && ACK.test(text)) {
    return { tier: "quick", kind: "acknowledgement", by: "rule" };
  }
  return null;
}

// Length guards on the classifier's answer, measured against the 600 labelled
// questions. The classifier called many long, substantive messages a "short
// follow-up" or an "acknowledgement" — a page of someone's own analysis
// ending in "I agree" — and those were most of its risky misses (deep
// questions sent light): 88 of them, down to 29 with these two guards.
/** Longer than this, a message is not a short follow-up or a bare thanks. */
export const SHORT_MAX_CHARS = 200;
/** Longer than this, a message goes deep whatever it is, translation aside. */
export const LONG_MIN_CHARS = 800;

/** Where a classified kind goes. */
export function tierForKind(
  kind: RouteKind,
  input: Pick<RouteInput, "previousTier" | "deepTier"> & { text?: string },
): AnsweringTier {
  const length = input.text?.trim().length ?? 0;
  if (
    (kind === "short-follow-up" || kind === "acknowledgement") &&
    length > SHORT_MAX_CHARS
  ) {
    return input.deepTier;
  }
  if (length > LONG_MIN_CHARS && kind !== "translation") return input.deepTier;
  if (kind === "short-follow-up") return input.previousTier ?? "quick";
  return LIGHT.has(kind) ? "quick" : input.deepTier;
}

export const CLASSIFIER_SYSTEM = `You sort messages sent to Dhee, an assistant for students of Madhyasth Darshan (a philosophy by A. Nagraj, with books in Hindi). You do not answer them. Pick the one kind that fits the person's latest message best.

- acknowledgement: thanks, ok, a greeting, nothing asked
- term-lookup: what one word or term means, its definition (paribhasha), a single short fact
- find-text: where something is written, which book or page, read out a specific page or line
- translation: translate given text, with nothing else asked
- drafting: write or tidy a short practical text — a message, invitation, schedule, post — that needs no deep explanation
- practical: an everyday practical question with a plain answer (time, a recipe, how to do a task)
- short-follow-up: a one-line continuation that only makes sense with the previous message ("and the second one?", "explain more", "give an example")
- concept: explain how an idea of the darshan works, why something is so, what it means for living
- comparison: compare or relate several concepts, terms, or views
- personal: the person's own life, feelings, relationships, decisions, struggles
- multi-part-study: a long or multi-part study request — explain fully, summarise a chapter, prepare questions, trace a term across books
- refine-message: rewrite or refine a message so it expresses the darshan's understanding properly

When torn between a light kind and a deep one, choose the deep one.`;

const classifierSchema = z.object({
  kind: z.enum(ROUTE_KINDS as unknown as [RouteKind, ...RouteKind[]]),
});

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function classifierPrompt(input: RouteInput): string {
  const previous = input.previousText?.trim()
    ? `Their previous message:\n"""${clip(input.previousText.trim(), 600)}"""\n\n`
    : "";
  return `${previous}Their latest message:\n"""${clip(input.text.trim(), 1500)}"""`;
}

/** How long the classifier may take before the turn goes on without it. */
export const CLASSIFIER_TIMEOUT_MS = 4000;

export type ClassifierUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
};

/**
 * The route for a turn. `classify` is injected so tests can stand in for the
 * model; production passes `classifyWith(backgroundModel)`.
 */
export async function routeTurn(
  input: RouteInput,
  classify: (input: RouteInput) => Promise<RouteKind>,
): Promise<RouteDecision> {
  const ruled = routeByRules(input);
  if (ruled) return ruled;
  try {
    const kind = await classify(input);
    return {
      tier: tierForKind(kind, input),
      kind,
      by: "classifier",
    };
  } catch (error) {
    console.warn("auto routing classifier failed; using fallback", error);
    return {
      tier: input.previousTier ?? "quick",
      kind: "fallback",
      by: "fallback",
    };
  }
}

/** A classifier on `model`, reporting its token usage to `onUsage`. */
export function classifyWith(
  model: LanguageModel,
  onUsage?: (usage: ClassifierUsage, providerMetadata: unknown) => void,
) {
  return async (input: RouteInput): Promise<RouteKind> => {
    const { object, usage, providerMetadata } = await generateObject({
      model,
      system: CLASSIFIER_SYSTEM,
      prompt: classifierPrompt(input),
      schema: classifierSchema,
      abortSignal: AbortSignal.timeout(CLASSIFIER_TIMEOUT_MS),
      maxRetries: 0,
    });
    onUsage?.(usage, providerMetadata);
    return object.kind;
  };
}
