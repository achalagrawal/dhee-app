import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, action, mutation } from "./_generated/server";
import { TRANSCRIBE_FALLBACK_MODEL, TRANSCRIBE_MODEL } from "./config";
import { DOMAIN_VOCABULARY, transcribeAudio } from "./lib/transcribe";
import { requireUserId } from "./users";

// Voice input: someone speaks into the composer instead of typing, and the
// words land in the message box for them to read and fix before sending.
// See docs/build/specs/dictation.md.
//
// The audio travels the way a photo does — the client POSTs it to a signed
// upload URL, then names the storage id here — and is deleted as soon as it
// has been transcribed, whatever happened. Nothing keeps a recording of
// anyone's voice: not storage, not a table, not the ledger, which records
// only that a transcription happened and what it cost.

/** About five minutes of the browser's Opus audio, with room to spare. */
export const MAX_CLIP_BYTES = 8 * 1024 * 1024;

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const vTranscribeResult = v.union(
  v.object({ ok: v.literal(true), text: v.string() }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal("not-audio"),
      v.literal("too-long"),
      v.literal("nothing-heard"),
      v.literal("failed"),
    ),
  }),
);

async function recordUsage(
  ctx: ActionCtx,
  userId: Id<"users">,
  model: string,
  costUsd: number | undefined,
  inputTokens: number | undefined,
) {
  try {
    await ctx.runMutation(internal.usage.record, {
      kind: "transcription",
      model,
      provider: "openrouter",
      promptTokens: inputTokens ?? 0,
      completionTokens: 0,
      ...(costUsd === undefined ? {} : { costUsd }),
      userId,
    });
  } catch (error) {
    console.error("transcription ledger write failed", error);
  }
}

/**
 * Turns an uploaded clip into text, then deletes the clip.
 *
 * Refusals come back as a reason rather than a throw, so the composer can say
 * what happened in the person's language. Only audio is ever read or deleted
 * here: a storage id that names anything else — a photo attachment, an
 * avatar — is refused and left alone.
 */
export const transcribe = action({
  args: {
    storageId: v.id("_storage"),
  },
  returns: vTranscribeResult,
  handler: async (ctx, { storageId }) => {
    const userId = await requireUserId(ctx);
    const blob = await ctx.storage.get(storageId);
    if (!blob) return { ok: false as const, reason: "failed" as const };
    if (
      !blob.type.startsWith("audio/") &&
      !blob.type.startsWith("video/webm")
    ) {
      return { ok: false as const, reason: "not-audio" as const };
    }
    try {
      if (blob.size > MAX_CLIP_BYTES) {
        return { ok: false as const, reason: "too-long" as const };
      }
      const apiKey = process.env.OPENROUTER_API_KEY ?? "";
      const filename = `clip.${extensionFor(blob.type)}`;
      // No language hint: people switch between Hindi and English mid
      // sentence, and every candidate did best left to detect it.
      const attempt = (model: string) =>
        transcribeAudio({
          audio: blob,
          filename,
          model,
          apiKey,
          prompt: DOMAIN_VOCABULARY.join(", "),
        });
      let model = TRANSCRIBE_MODEL;
      let result;
      try {
        result = await attempt(model);
      } catch (error) {
        console.error(
          `${model} failed; trying ${TRANSCRIBE_FALLBACK_MODEL}`,
          error,
        );
        model = TRANSCRIBE_FALLBACK_MODEL;
        result = await attempt(model);
      }
      await recordUsage(ctx, userId, model, result.costUsd, result.inputTokens);
      return result.text
        ? { ok: true as const, text: result.text }
        : { ok: false as const, reason: "nothing-heard" as const };
    } catch (error) {
      console.error("transcription failed", error);
      return { ok: false as const, reason: "failed" as const };
    } finally {
      await ctx.storage.delete(storageId);
    }
  },
});

export function extensionFor(contentType: string): string {
  const type = contentType.split(";")[0]!.trim();
  switch (type) {
    case "audio/webm":
    case "video/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/aac":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    default:
      return "webm";
  }
}
