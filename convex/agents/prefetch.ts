import type { ModelMessage } from "ai";
import { lexicalSearchText, lookupExactOnly, semanticSearchText } from "../md";
import { isEmpty, parseEnvelope } from "../lib/corpusRecovery";
import type { RouteDecision } from "./router";

// The first round of lookups, run by the app before the model starts.
//
// On the 2026-11-28 prod export a reply spent most of its time in tool
// rounds: each one a whole model call (3.7 s on DeepSeek V4.1, 7 s on Sonnet
// 5) to decide what to look up, then about a second of lookups. The first
// round is predictable — search the books for the message, look up the
// darshan terms in it — so the app runs it itself, in parallel with Auto's
// routing, and hands the results to the model with the question. A model that
// finds what it needs answers in its first step; one that doesn't looks up
// only what is missing.
//
// What to fetch can't wait for the question's kind (that would put routing
// and lookups back in series), so everything plausible is fetched, and the
// kind then decides which of it the model sees. The lookups are on Dhee's own
// corpus server and cost nothing per call.

type Kind = RouteDecision["kind"] | undefined;

export type PrefetchPlan = {
  /** A meaning search for the message itself. */
  search?: string;
  /** Darshan terms in the message, looked up exactly. */
  lookups: string[];
  /** A word or quoted line to find word for word. */
  exact?: string;
};

export type PrefetchResult = {
  tool: "searchWisdom" | "lookupDefinition" | "searchExactPhrase";
  input: Record<string, unknown>;
  output: string;
};

/** Kinds where book passages don't help the answer, so none are shown. */
const NO_PREFETCH = new Set<string>([
  "acknowledgement",
  "translation",
  "drafting",
  "practical",
  "short-follow-up",
  "refine-message",
  "crisis",
  "attachment",
]);

// Everyday words that are never worth a lexicon lookup. The lookup is exact
// and cheap, so this only has to keep the obvious noise out.
const STOPWORDS = new Set(
  `क्या कैसे क्यों कब कहाँ कहां कौन किस किसी कोई कुछ सब सभी यह वह ये वो इस उस इन उन है हैं था थी थे हो होता होती होते होना होने हुआ हुई और या तो भी ही नहीं ना मत में से को का की के पर तक लिए साथ बारे एक दो मैं मेरा मेरी मेरे मुझे हम हमारा हमारी हमें आप आपका आपकी आपके तुम उनका उनकी उनके इसका इसकी इसके उसका उसकी उसके जो जिस जिसे जब तब अब फिर बहुत ज़्यादा ज्यादा कम सकता सकती सकते रहा रही रहे करना करने करता करती करते किया की गई गया गए बताइए बताएं बताओ बताये समझाइए समझाएं समझाओ कृपया मतलब अर्थ बात चाहिए लगता लगती`.split(
    /\s+/,
  ),
);

// Darshan terms people write in Roman script, mapped to the lexicon's
// spelling. Looking up the Devanagari form is far more reliable than the
// lexicon's own romanisations, which match only one spelling each.
const ROMAN_TERMS: Record<string, string> = {
  sahastitva: "सहअस्तित्व",
  "sah-astitva": "सहअस्तित्व",
  sahastitv: "सहअस्तित्व",
  astitva: "अस्तित्व",
  vyavastha: "व्यवस्था",
  samadhan: "समाधान",
  samadhaan: "समाधान",
  samriddhi: "समृद्धि",
  samridhi: "समृद्धि",
  abhay: "अभय",
  jeevan: "जीवन",
  jivan: "जीवन",
  jagriti: "जागृति",
  jagruti: "जागृति",
  anubhav: "अनुभव",
  nyay: "न्याय",
  nyaya: "न्याय",
  dharma: "धर्म",
  dharm: "धर्म",
  satya: "सत्य",
  sukh: "सुख",
  vishwas: "विश्वास",
  vishvas: "विश्वास",
  sambandh: "संबंध",
  sanskar: "संस्कार",
  sanskaar: "संस्कार",
  manaviyata: "मानवीयता",
  manaviya: "मानवीयता",
  chetna: "चेतना",
  bhram: "भ्रम",
  paripurnata: "परिपूर्णता",
  akhand: "अखंड",
  sarvabhaum: "सार्वभौम",
  vyavahar: "व्यवहार",
  karuna: "करुणा",
  prem: "प्रेम",
  sneh: "स्नेह",
  mamta: "ममता",
  mulya: "मूल्य",
  moolya: "मूल्य",
  patrata: "पात्रता",
  swabhav: "स्वभाव",
  svabhav: "स्वभाव",
  sanyam: "संयम",
};

const MAX_LOOKUPS = 5;
const MAX_SEARCH_CHARS = 500;

function contentWords(text: string): string[] {
  return (text.match(/[ऀ-ॿ]+/g) ?? [])
    .map((w) => w.replace(/[।॥]/g, ""))
    .filter((w) => [...w].length >= 3 && !STOPWORDS.has(w));
}

function quotedSpan(text: string): string | undefined {
  const match = text.match(/[“"‘']([^“”"‘’']{2,160})[”"’']/);
  if (!match) return undefined;
  const span = match[1]!.trim();
  const words = span.split(/\s+/).length;
  return words >= 1 && words <= 12 ? span : undefined;
}

/** What to fetch for a message. Null when there is nothing worth fetching. */
export function planPrefetch(text: string): PrefetchPlan | null {
  const message = text.trim();
  if ([...message.replace(/\s/g, "")].length < 4) return null;

  const devanagari = contentWords(message);
  const roman = (message.toLowerCase().match(/[a-z][a-z-]+/g) ?? [])
    .map((w) => ROMAN_TERMS[w])
    .filter((w): w is string => Boolean(w));
  const lookups = [...new Set([...devanagari, ...roman])].slice(0, MAX_LOOKUPS);

  // Exact search only where it tends to find something: a quoted line, or a
  // message that is a single term ("पात्रता क्या है?").
  const exact =
    quotedSpan(message) ??
    (devanagari.length === 1 && message.length <= 60
      ? devanagari[0]
      : undefined);

  return {
    search: [...message].slice(0, MAX_SEARCH_CHARS).join(""),
    lookups,
    ...(exact ? { exact } : {}),
  };
}

/** Which parts of a prefetch the model sees, for a question of this kind. */
export function keepFor(kind: Kind) {
  if (kind && NO_PREFETCH.has(kind)) {
    return { search: false, lookups: false, exact: false };
  }
  if (kind === "personal") {
    // A life question needs perspective, not a glossary: the meaning search
    // only. The reply decides whether a passage belongs in it at all.
    return { search: true, lookups: false, exact: false };
  }
  if (kind === "find-text") {
    return { search: true, lookups: false, exact: true };
  }
  return { search: true, lookups: true, exact: true };
}

const MAX_RESULT_CHARS = 8000;

/** The results the model is shown: kept for this kind, and not empty. */
export function shownResults(
  results: PrefetchResult[],
  kind: Kind,
): PrefetchResult[] {
  const keep = keepFor(kind);
  return results.filter((r) => {
    const wanted =
      (r.tool === "searchWisdom" && keep.search) ||
      (r.tool === "lookupDefinition" && keep.lookups) ||
      (r.tool === "searchExactPhrase" && keep.exact);
    return wanted && !isEmpty(parseEnvelope(r.output));
  });
}

/**
 * The note that carries a prefetch to the model, placed right after the
 * person's message. Null when nothing kept found anything.
 */
export function prefetchNote(
  results: PrefetchResult[],
  kind: Kind,
): ModelMessage | null {
  const shown = shownResults(results, kind);
  if (shown.length === 0) return null;
  const body = shown
    .map(
      (r) =>
        `Result of ${r.tool}(${JSON.stringify(r.input)}):\n${r.output.slice(0, MAX_RESULT_CHARS)}`,
    )
    .join("\n\n");
  return {
    role: "user",
    content: `[A note from the Dhee app, not from the person — do not mention it in your reply.] Before you started, the app ran these lookups for this message. Treat them exactly as results of your own tool calls: you may quote and cite what is here. If they are enough to answer well, answer now without searching again. If one specific thing is missing, look up only that — and make all the lookups you still need at once, in one round.\n\n${body}`,
  };
}

/** Gives up on whatever hasn't come back by then; the reply can't wait. */
const PREFETCH_TIMEOUT_MS = 3000;

async function settle<T>(promise: Promise<T>): Promise<T | null> {
  return await promise.catch(() => null);
}

/**
 * Runs a plan's lookups in parallel. Never throws: a lookup that fails or is
 * slow is left out, and the model searches for itself as before.
 */
export async function runPrefetch(
  plan: PrefetchPlan | null,
): Promise<PrefetchResult[]> {
  if (!plan) return [];
  const jobs: Array<Promise<PrefetchResult | null>> = [];
  if (plan.search) {
    const query = plan.search;
    jobs.push(
      settle(
        semanticSearchText({ query }).then((output) => ({
          tool: "searchWisdom" as const,
          input: { query },
          output,
        })),
      ),
    );
  }
  for (const word of plan.lookups) {
    jobs.push(
      settle(
        lookupExactOnly(word).then((output) => ({
          tool: "lookupDefinition" as const,
          input: { word },
          output,
        })),
      ),
    );
  }
  if (plan.exact) {
    const query = plan.exact;
    jobs.push(
      settle(
        lexicalSearchText({ query }).then((output) => ({
          tool: "searchExactPhrase" as const,
          input: { query },
          output,
        })),
      ),
    );
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), PREFETCH_TIMEOUT_MS);
  });
  const done = await Promise.all(
    jobs.map((job) => Promise.race([job, timeout])),
  );
  clearTimeout(timer);
  return done.filter((r): r is PrefetchResult => r !== null);
}

/**
 * Inserts the note after the person's message and before anything the reply
 * has already produced — the agent's own ordering, with one message added.
 */
export function withPrefetchNote(
  parts: {
    search: ModelMessage[];
    recent: ModelMessage[];
    inputMessages: ModelMessage[];
    inputPrompt: ModelMessage[];
    existingResponses: ModelMessage[];
  },
  note: ModelMessage | null,
): ModelMessage[] {
  return [
    ...parts.search,
    ...parts.recent,
    ...parts.inputMessages,
    ...parts.inputPrompt,
    ...(note ? [note] : []),
    ...parts.existingResponses,
  ];
}
