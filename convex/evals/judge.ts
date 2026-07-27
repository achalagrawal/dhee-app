import { generateObject } from "ai";
import { z } from "zod";
import { languageModel } from "../agents/config";
import { CHAT_MODEL } from "../config";

// A second model scoring the qualities a regex cannot reach.
//
// convex/evals/checks.ts decides whether a rule was broken outright — a term
// leaked, a page was cited, the script switched. Those are the checks that
// carry the regression signal, because they are binary and objective. But the
// two rules the product actually turns on are not like that. "Perspective, not
// lecture" and "widen their frame by even one degree" cannot be pattern
// matched, and a harness that measured only what is easy to measure would
// quietly redefine quality as "no forbidden words".
//
// So this exists, with two limits stated up front:
//
// It is the noisiest thing in the harness. The judge is the same
// non-deterministic model being judged, so its scores wobble on their own,
// on top of the wobble in the replies. Read a score as a direction, never as a
// measurement, and never let a one-point move decide anything — that is what
// `--repeats 3` and the side-by-side replies are for.
//
// It never sees the system prompt. Show a judge the instructions and it grades
// compliance with them rather than the reply a person would actually receive,
// which makes a prompt that says the right things score well even when the
// reply is poor. It sees what the person saw, plus the mode.

export const JUDGE_MODEL = CHAT_MODEL;

// Plain `z.number()`, with the range stated only in the description.
//
// Anthropic's structured output rejects `minimum`/`maximum` on an integer
// property: "[Anthropic] output_config.format.schema: For 'integer' type,
// properties maximum, minimum are not supported". `.min(1).max(5)` emits them,
// which is obvious — but so does a bare `.int()`, because Zod 4 renders it as
// `{type:"integer", minimum:-9007199254740991, maximum:9007199254740991}`.
// Dropping the explicit bounds is not enough; `.int()` has to go too.
//
// The bounds are enforced by `clamp` on the way out instead, which is where
// they belonged anyway: a score outside the scale is a judge that misread the
// rubric, not a run that should fail.
const scale = (what: string) =>
  z
    .number()
    .describe(
      `${what} Score from 1 to 5, where 1 is a clear failure, 3 is acceptable and 5 is excellent.`,
    );

const clamp = (n: number, lo: number) =>
  Math.max(lo, Math.min(5, Math.round(n)));

const judgeSchema = z.object({
  perspectiveNotLecture: scale(
    "Does this read like a thoughtful older friend rather than a teacher? Advice stacked in a list, moralising, or explaining at the person all score low.",
  ),
  widenedTheFrame: scale(
    "Does the reply see the situation from higher up than the person was standing when they asked, and go to the root rather than the surface they presented? A reply that resolves what looked like a dilemma by widening the frame scores high. Restating their question back in nicer words, or answering only the surface, scores low. Note that this is about depth of seeing, not length — four sentences can score 5, and a long reply that never leaves the person's own framing scores 2.",
  ),
  warmth: scale(
    "Does it feel like it was written by someone who cares, unhurried and human, rather than assembled?",
  ),
  answeredAtDepthAsked: scale(
    "Did it answer the question actually asked? A practical question gets its practical answer first and plainly; one added line of depth on a small question is right, a sermon on it is not. Score low for a reply that leads with what it cannot do, or that comes back with nothing because a fact was out of reach — there is always something to say from a wider view. Score low too for inventing a fact it could not have, or for depth reached for to sound deep. A text question fobbed off with a platitude also scores low.",
  ),
  lensAsLensNotDoctrine: z
    .number()
    .describe(
      "Only when a tradition lens is named: does the reply draw on that framing while staying open, or does it preach it as the truth? Preaching, converting, or treating the tradition as settled fact scores low, on the same 1 to 5 scale. Use 0 when no lens is in play.",
    ),
  rationale: z
    .string()
    .describe(
      "One or two sentences on the lowest score you gave, naming the specific thing in the reply that cost it. No praise, no summary of the reply.",
    ),
});

export type JudgeScores = z.infer<typeof judgeSchema>;

const SYSTEM = `You are reviewing replies from an app called Dhee — an assistant grounded in Madhyasth Darshan, the co-existential darshan set down by A. Nagraj. Dhee is meant to be warm and unhurried, and to answer from a higher vantage point than the one the question was asked from: seeing the whole, going to the root, saying the thing that makes a dilemma stop being one. Not a teacher, not a therapist, not an advice engine, and not a preacher for the darshan either.

Score what is actually in front of you. You are not checking compliance with any instruction set, and you have not been shown one. You are judging whether this is a reply a thoughtful person would be glad to receive.

Be willing to use the low end. A reply that is fluent, well organised and says nothing the person could not have told themselves is a 2, not a 4. Grade inflation makes this whole exercise worthless.`;

/**
 * Score one reply.
 *
 * Throws on failure rather than returning null. An earlier version swallowed
 * the error, which made a judge that was broken look exactly like a judge that
 * was switched off — the run reported a judge model in its header and not one
 * score in its body. The caller catches this into a per-case warning, so a
 * broken judge costs opinions and is visible, but never loses the replies and
 * checks that were measured fine.
 */
export async function judgeReply(input: {
  question: string;
  reply: string;
  traditions: string[];
  studyMode: boolean;
}): Promise<JudgeScores | null> {
  if (!input.reply.trim()) return null;

  const { object } = await generateObject({
    model: languageModel,
    schema: judgeSchema,
    system: SYSTEM,
    prompt: [
      input.traditions.length
        ? `The person has named this as their framing: ${input.traditions.join(", ")}.`
        : `The person has named no particular tradition or framing.`,
      input.studyMode
        ? `They have also opted into study mode, so quoting a source and naming a book and page is allowed here, and a longer answer is allowed.`
        : `Ordinary mode: sources are not volunteered unless asked for, everyday language is preferred over the darshan's own Sanskrit vocabulary, and brevity is expected — though depth is expected with it.`,
      ``,
      `They asked:`,
      input.question,
      ``,
      `Dhee replied:`,
      input.reply,
    ].join("\n"),
  });
  return {
    ...object,
    perspectiveNotLecture: clamp(object.perspectiveNotLecture, 1),
    widenedTheFrame: clamp(object.widenedTheFrame, 1),
    warmth: clamp(object.warmth, 1),
    answeredAtDepthAsked: clamp(object.answeredAtDepthAsked, 1),
    // 0 is meaningful here: "no lens was in play", which the report skips.
    lensAsLensNotDoctrine: clamp(object.lensAsLensNotDoctrine, 0),
    rationale: object.rationale.slice(0, 400),
  };
}
