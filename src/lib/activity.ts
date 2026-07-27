import { t, type Language } from "./i18n";

// What Dhee is doing while it works, read off the message it is streaming.
//
// The agent puts a `tool-<name>` part into the UI message for every tool call —
// with the model's own input, and a `state` that says how far along it is — and
// those parts stream to the client with the text deltas. So the whole account
// of a turn is already on screen's doorstep; this module is just the reading of
// it. No query, no round-trip, no backend change. See
// docs/build/specs/chat-loop.md §3.
//
// Kept free of React and react-native so it can be tested directly.

/** What a tool is doing, in the terms a person cares about. */
export type ActivityKind =
  "search" | "phrase" | "paribhasha" | "page" | "books" | "toc" | "other";

export type Activity = {
  /** The tool call this came from; stable for the life of the turn. */
  id: string;
  kind: ActivityKind;
  /** What is being looked at — the query, the term, the page number. */
  detail?: string;
  /** Whether its result has come back. */
  done: boolean;
};

// The shape we need from a UIMessage part. Structural rather than imported so
// the tests don't have to construct the agent's full part union — every real
// `UIMessage["parts"][number]` satisfies it.
export type MessagePart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  input?: unknown;
};

// Tool names are Dhee's own (convex/tools/md.ts). A name we don't recognize
// still gets a line, because saying nothing while something runs is the bug
// this whole module exists to fix — it just gets the generic one.
const KIND_BY_TOOL: Record<string, ActivityKind> = {
  searchWisdom: "search",
  searchExactPhrase: "phrase",
  lookupDefinition: "paribhasha",
  readPage: "page",
  listBooks: "books",
  readBookToc: "toc",
};

// Long enough to recognize your own question in, short enough for one line.
const DETAIL_MAX = 48;

function toolNameOf(part: MessagePart): string | null {
  if (part.type === "dynamic-tool") return part.toolName ?? null;
  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null;
}

// The input arrives as streamed JSON fragments and is only set once the whole
// object parses, so "not there yet" is the normal early state, not an error.
function detailOf(kind: ActivityKind, input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const fields = input as Record<string, unknown>;
  const raw =
    kind === "paribhasha"
      ? fields.word
      : kind === "page"
        ? fields.pageNo
        : kind === "search" || kind === "phrase"
          ? fields.query
          : undefined;
  const text =
    typeof raw === "number"
      ? String(raw)
      : typeof raw === "string"
        ? raw.trim()
        : "";
  if (!text) return undefined;
  return text.length > DETAIL_MAX
    ? `${text.slice(0, DETAIL_MAX).trimEnd()}…`
    : text;
}

/**
 * The tool calls of one assistant turn, oldest first.
 *
 * Parts already arrive deduped by `toolCallId` (`combineUIMessages` merges the
 * step messages of a turn), but a call is matched by id here anyway: a trail
 * that shows the same search twice reads as Dhee going in circles.
 */
export function activityTrail(parts: readonly MessagePart[]): Activity[] {
  const trail: Activity[] = [];
  const seen = new Map<string, number>();
  for (const part of parts) {
    const tool = toolNameOf(part);
    if (!tool || !part.toolCallId) continue;
    const kind = KIND_BY_TOOL[tool] ?? "other";
    const activity: Activity = {
      id: part.toolCallId,
      kind,
      detail: detailOf(kind, part.input),
      // `input-error` finalizes as `output-error`; either way nothing more is
      // coming, so both count as finished rather than hanging forever.
      done: part.state === "output-available" || part.state === "output-error",
    };
    const at = seen.get(part.toolCallId);
    const previous = at === undefined ? undefined : trail[at];
    if (at === undefined || !previous) {
      seen.set(part.toolCallId, trail.length);
      trail.push(activity);
    } else {
      // Later parts carry the fuller picture: an input that has finished
      // parsing, or an output that has landed. Neither the detail nor the
      // result is ever given back, though — a turn's parts come from two
      // places at once (the saved step messages and the live stream), and a
      // part from the thinner of the two must not walk a finished step back to
      // running.
      trail[at] = {
        ...previous,
        ...activity,
        detail: activity.detail ?? previous.detail,
        done: activity.done || previous.done,
      };
    }
  }
  return trail;
}

/** The step Dhee is on, or null when everything so far has come back. */
export function activeActivity(trail: readonly Activity[]): Activity | null {
  return trail.find((a) => !a.done) ?? null;
}

/**
 * One line for one step, in the person's language.
 *
 * Two forms per kind: with the detail and without. The detail is the model's
 * input, which streams in as JSON fragments — so the generic form is what shows
 * until the whole thing parses, rather than half a word inside quotes.
 */
export function activityText(lang: Language, activity: Activity): string {
  const { kind, detail } = activity;
  switch (kind) {
    case "search":
      return detail
        ? t(lang, "actSearchingFor").replace("%s", detail)
        : t(lang, "actSearching");
    case "phrase":
      return detail
        ? t(lang, "actPhraseFor").replace("%s", detail)
        : t(lang, "actPhrase");
    case "paribhasha":
      return detail
        ? t(lang, "actParibhashaFor").replace("%s", detail)
        : t(lang, "actParibhasha");
    case "page":
      return detail
        ? t(lang, "actReadingPageNo").replace("%s", detail)
        : t(lang, "actReadingPage");
    case "books":
      return t(lang, "actBooks");
    case "toc":
      return t(lang, "actToc");
    default:
      return t(lang, "actWorking");
  }
}
