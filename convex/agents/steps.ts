import type { LanguageModel, ModelMessage } from "ai";

// How a reply's step budget ends: a warning as it runs low, and a last step
// that has to be an answer.
//
// Why this is more than `toolChoice: "none"` on the last step. On the
// 2026-11-28 prod export, 14 of DeepSeek's 115 replies since it became the
// default were broken, and 13 of those had spent all twelve steps, making 25
// to 40 lookups on the way. On the last step DeepSeek ignored `"none"`: it
// either made a real tool call anyway (the turn ended with nothing written),
// or wrote the call out as text — `<｜DSML｜ invoke name="readPage">…`, the
// "random symbols" people complained about. A model that can still see tools
// and a history full of tool calls keeps reaching for them.
//
// So for models reached through OpenRouter the last step sends no tools at
// all, and the turn so far is rewritten as plain text: what was looked up and
// what came back. With no tool schema and no tool-call parts there is nothing
// to imitate. Two steps before that, the model is told how many lookups it has
// left, so most turns start writing before the budget is spent.
//
// Claude (Reflective) is left exactly as it was. `toolChoice: "none"` works
// there, and rewriting its history would cost it both its prompt cache and
// its thinking, which Sonnet 5.5 checks against the conversation it came from
// (see convex/agents/config.ts). An inserted message mid-turn is a risk to
// that check too, so it gets no warning either.

/** A note in the person's turn that is from the app, never from them. */
function appNote(text: string): ModelMessage {
  return {
    role: "user",
    content: `[A note from the Dhee app, not from the person — do not mention it in your reply.] ${text}`,
  };
}

export const FINAL_STEP_NOTE =
  "You have no lookups left. Answer the person's message now, in full, from what you have already read and what you understand. Write only the answer — no tool calls, no markup, no mention of searching.";

export function lowBudgetNote(stepsLeft: number): string {
  const lookups =
    stepsLeft === 1 ? "one more lookup step" : `${stepsLeft} more lookup steps`;
  return `You have ${lookups}, then you must answer. Stop searching unless one specific gap remains, and get ready to write the answer from what you have.`;
}

/** Whether a model is Claude on Anthropic's API (or wraps it). */
export function isAnthropicModel(model: LanguageModel | undefined): boolean {
  return (
    typeof model === "object" &&
    model !== null &&
    "provider" in model &&
    String(model.provider).startsWith("anthropic")
  );
}

// A tool's output can be a whole page of corpus text. The last step only
// needs enough of each to write from, and twelve steps of DeepSeek's parallel
// lookups can be forty of them.
const MAX_RESULT_CHARS = 4000;

function clip(text: string): string {
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}\n[…cut for length]`
    : text;
}

type ToolOutput =
  | { type: "text" | "error-text"; value: string }
  | { type: "json" | "error-json"; value: unknown }
  | { type: "execution-denied"; reason?: string }
  | { type: "content"; value: Array<{ type: string; text?: string }> };

function outputText(output: unknown): string {
  const o = output as ToolOutput | undefined;
  if (!o || typeof o !== "object") return "";
  switch (o.type) {
    case "text":
    case "error-text":
      return o.value;
    case "json":
    case "error-json":
      return JSON.stringify(o.value);
    case "execution-denied":
      return `(not run${o.reason ? `: ${o.reason}` : ""})`;
    case "content":
      return o.value
        .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
        .join("\n");
    default:
      return "";
  }
}

function callLine(toolName: string, input: unknown): string {
  return `You called ${toolName}(${JSON.stringify(input ?? {})}).`;
}

/**
 * The conversation with every tool call and tool result rewritten as plain
 * text, and all reasoning dropped. Text the model already wrote is kept as is.
 *
 * Tool results become a user-role message of their own, labelled as lookup
 * results, because that is the only role left that can carry them once there
 * are no tool messages.
 */
export function flattenToolHistory(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      if (typeof message.content === "string") {
        out.push(message);
        continue;
      }
      const lines: string[] = [];
      for (const part of message.content) {
        if (part.type === "text" && part.text.trim()) lines.push(part.text);
        else if (part.type === "tool-call")
          lines.push(callLine(part.toolName, part.input));
      }
      if (lines.length) {
        out.push({ role: "assistant", content: lines.join("\n\n") });
      }
    } else if (message.role === "tool") {
      const results = message.content.flatMap((part) =>
        part.type === "tool-result"
          ? [`Result of ${part.toolName}:\n${clip(outputText(part.output))}`]
          : [],
      );
      if (results.length) {
        out.push({
          role: "user",
          content: `[Lookup results, from the Dhee app — not written by the person.]\n\n${results.join("\n\n")}`,
        });
      }
    } else {
      out.push(message);
    }
  }
  return out;
}

/**
 * The conversation with tool calls, tool results and reasoning removed —
 * what `excludeToolMessages` does for earlier turns, for a list that already
 * has them in.
 */
export function withoutToolParts(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const message of messages) {
    if (message.role === "tool") continue;
    if (message.role === "assistant" && typeof message.content !== "string") {
      const content = message.content.filter((part) => part.type === "text");
      if (content.length) out.push({ ...message, content });
      continue;
    }
    out.push(message);
  }
  return out;
}

/** The messages for an answer that has to come without tools. */
export function answerOnlyMessages(messages: ModelMessage[]): ModelMessage[] {
  return [...flattenToolHistory(messages), appNote(FINAL_STEP_NOTE)];
}

type StepInput = {
  stepNumber: number;
  model?: LanguageModel;
  messages?: ModelMessage[];
};

/**
 * `prepareStep` for a budget of `steps`: warns two steps and one step before
 * the end, and makes the last step an answer. `stepNumber` counts from 0, so
 * the last step is `steps - 1`.
 */
export function stepGuard(steps: number) {
  return ({ stepNumber, model, messages }: StepInput) => {
    const last = steps - 1;
    if (isAnthropicModel(model) || !messages) {
      return stepNumber >= last ? { toolChoice: "none" as const } : {};
    }
    if (stepNumber >= last) {
      return {
        toolChoice: "none" as const,
        activeTools: [] as never[],
        messages: answerOnlyMessages(messages),
      };
    }
    const stepsLeft = last - stepNumber;
    if (stepsLeft <= 2) {
      return { messages: [...messages, appNote(lowBudgetNote(stepsLeft))] };
    }
    return {};
  };
}
