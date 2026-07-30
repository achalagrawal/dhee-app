// Tidying what the corpus search tools hand back, and putting a ceiling under
// how large a single passage may be.
//
// Read the ordering here carefully, because it was got wrong once. This began
// as a cost measure — a tool result is re-sent on every later step of a turn,
// so search payloads look like an obvious lever. They are not a good one:
//
//   - The corpus service already returns tightly bounded excerpts. There is
//     barely any tail to cut, so a budget low enough to save meaningfully is
//     also low enough to cut the *typical* passage, not the outliers.
//   - Most of those re-sent tokens are cache reads at a tenth of the price, so
//     the money actually at stake is small.
//   - And the risk is asymmetric. A result is ranked as a whole passage, not
//     sentence by sentence, so the line that answers the question may sit
//     anywhere in it — including the end. Trimming the tail can remove exactly
//     the clause that mattered, on a corpus where a term's precise sense is
//     load-bearing. "It can call readPage for the rest" is no answer: the model
//     has to notice it needs more, and it cannot notice what it never saw.
//
// So this no longer trims to save tokens. What it does:
//
//   - drops fields the model never reads (free, no judgement involved), and
//   - caps a single passage at a size far above anything the service returns
//     today, so a change upstream cannot put an entire chapter into the prompt.
//
// In normal operation the cap does nothing at all. If you are tempted to lower
// it for cost, measure what it actually saves against the ledger first — the
// levers worth pulling are the number of steps a turn spends and the uncached
// first call of each turn, both of which dwarf this.
//
// When the cap does fire it cuts at a sentence boundary. A passage cut
// mid-clause reads as a complete thought that says something other than what
// the source says, which is worse than one that is visibly shorter.

/**
 * Ceiling on a single passage, in characters.
 *
 * Deliberately far above what the corpus service returns in practice: this is a
 * guard against an upstream change, not a budget. If it starts firing on
 * ordinary searches, that is a signal the service changed — investigate that
 * rather than lowering this.
 */
export const PASSAGE_CHAR_BUDGET = 2400;

/** Fields on a result that the model never reads. `score` is ranker exhaust. */
const DROPPED_FIELDS = ["score"] as const;

const SENTENCE_END = /[।.!?॥]\s/g;

/**
 * Cut to the last sentence boundary at or before `budget`, falling back to a
 * word boundary, then to a hard cut. Returns the text unchanged when it already
 * fits.
 */
export function trimToSentence(text: string, budget: number): string {
  if (text.length <= budget) return text;

  const window = text.slice(0, budget);
  let cut = -1;
  for (const match of window.matchAll(SENTENCE_END)) {
    cut = match.index + match[0].length;
  }
  // Only honour a sentence boundary that leaves a usable passage; one that
  // lands in the first fifth means the passage has no early full stop, and
  // truncating there would throw away most of what was retrieved.
  if (cut > budget * 0.2) return text.slice(0, cut).trimEnd();

  const space = window.lastIndexOf(" ");
  return (space > budget * 0.2 ? window.slice(0, space) : window).trimEnd();
}

type Envelope = {
  results?: unknown;
  [key: string]: unknown;
};

/**
 * Shorten the passages in a search envelope, in place of the raw JSON string
 * the MCP server returned.
 *
 * Total lack of trust in the input is deliberate: this sits between a remote
 * server and the model, so anything that isn't the envelope shape we expect is
 * passed through untouched rather than mangled. A search whose result we can't
 * parse should still reach the model as whatever it was.
 */
export function capPassages(
  raw: string,
  budget: number = PASSAGE_CHAR_BUDGET,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (typeof parsed !== "object" || parsed === null) return raw;

  const envelope = parsed as Envelope;
  if (!Array.isArray(envelope.results)) return raw;

  let trimmedAny = false;
  const results = envelope.results.map((entry) => {
    if (typeof entry !== "object" || entry === null) return entry;
    const result = { ...(entry as Record<string, unknown>) };
    for (const field of DROPPED_FIELDS) delete result[field];

    const text = result.text;
    if (typeof text !== "string" || text.length <= budget) return result;

    const kept = trimToSentence(text, budget);
    // Only claim to have trimmed if something actually came off; a passage
    // whose first sentence runs past the budget can come back unchanged.
    if (kept.length < text.length) {
      trimmedAny = true;
      result.text = kept;
      result.truncated = true;
    }
    return result;
  });

  const out: Envelope = { ...envelope, results };
  if (trimmedAny) {
    // Only ever present when the ceiling actually fired, which should be never
    // in normal operation — so it is written to be unmistakable when it does
    // appear, and to tell the model exactly how to recover the missing text.
    out.note =
      "A passage exceeded the size limit and was cut short at a sentence boundary; those are flagged `truncated`. Anything after the cut is missing, so call readPage with that result's book_id and page_no before relying on its wording or drawing a conclusion from it.";
  }
  return JSON.stringify(out);
}
