import type {
  LanguageModelV3Content,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import type { LanguageModelMiddleware } from "ai";

// Keeps a model's own control markup out of what people read.
//
// DeepSeek writes its tool calls in a markup of its own —
// `<｜DSML｜ invoke name="readPage">…` — and when it cannot make a real call
// it sometimes writes that markup as text instead. On the 2026-11-28 prod
// export it reached people as "random symbols" at the end of a reply. Every
// one of its special tokens opens with `<｜` (a full-width bar), sometimes
// with a zero-width space between, which never begins anything a person would
// want to read. So text is cut at the first such opening: what came before it
// is the answer, and everything after it is markup.
//
// The stream filter holds back a trailing `<` (or `<` plus a zero-width space)
// until the next delta shows whether a marker follows, so a marker split
// across two deltas is still caught.

const MARKER = /<​?｜/;

/** `text` up to the first special-token opening, or all of it. */
export function cutAtSpecialToken(text: string): {
  text: string;
  cut: boolean;
} {
  const match = MARKER.exec(text);
  return match
    ? { text: text.slice(0, match.index).trimEnd(), cut: true }
    : { text, cut: false };
}

/** How many trailing characters might be the start of a marker. */
function heldBack(text: string): number {
  if (text.endsWith("<​")) return 2;
  if (text.endsWith("<")) return 1;
  return 0;
}

export function stripSpecialTokensStream(): TransformStream<
  LanguageModelV3StreamPart,
  LanguageModelV3StreamPart
> {
  const state = new Map<string, { pending: string; cut: boolean }>();
  return new TransformStream({
    transform(part, controller) {
      if (part.type === "text-delta") {
        const s = state.get(part.id) ?? { pending: "", cut: false };
        state.set(part.id, s);
        if (s.cut) return;
        const { text, cut } = cutAtSpecialToken(s.pending + part.delta);
        if (cut) {
          s.cut = true;
          s.pending = "";
          if (text) controller.enqueue({ ...part, delta: text });
          return;
        }
        const hold = heldBack(text);
        s.pending = text.slice(text.length - hold);
        const emit = text.slice(0, text.length - hold);
        if (emit) controller.enqueue({ ...part, delta: emit });
        return;
      }
      if (part.type === "text-end") {
        const s = state.get(part.id);
        if (s && !s.cut && s.pending) {
          controller.enqueue({
            type: "text-delta",
            id: part.id,
            delta: s.pending,
          });
        }
        state.delete(part.id);
      }
      controller.enqueue(part);
    },
  });
}

function cleanContent(content: LanguageModelV3Content[]) {
  return content.map((part) =>
    part.type === "text"
      ? { ...part, text: cutAtSpecialToken(part.text).text }
      : part,
  );
}

export const stripSpecialTokens: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();
    return { ...result, content: cleanContent(result.content) };
  },
  wrapStream: async ({ doStream }) => {
    const { stream, ...rest } = await doStream();
    return { stream: stream.pipeThrough(stripSpecialTokensStream()), ...rest };
  },
};
