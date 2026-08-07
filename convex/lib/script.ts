// Which script a person is writing in, and the instruction that holds Dhee to
// the right language for it.
//
// The system prompt already asks for a reply in the language the person used.
// That instruction alone is not enough: it sits a long way into a large prompt,
// and the corpus tools return dense Devanagari that pulls the model's output
// with them. So the observation is made here, from the message, and re-asserted
// on every single turn.
//
// Restating it every turn is the whole mechanism, because the failure this
// fixes is self-reinforcing. Once a thread has answered in the wrong language,
// the model starts matching its own previous replies instead of the person's
// messages, and every later turn inherits the mistake. Someone can ask one
// question in Hinglish and their next five in English and still get Hindi back.
// Only a correction that arrives fresh each turn, after the history, breaks it.
//
// What "the right language" means here:
//
//   Devanagari in     -> Hindi in Devanagari
//   Hinglish in       -> Hindi in Devanagari   (not romanised Hindi)
//   English in        -> English
//   another script in -> that script
//
// The Hinglish row is a product decision rather than a technical one, and it
// changed once: replying in romanised Hindi was tried and reads worse than
// either language written properly. Someone typing Hindi in Roman letters is
// usually short of a Devanagari keyboard, not short of the ability to read one.
//
// A preference, not a cage. A term keeping its own script inside a reply is
// fine and often the honest word; what this prevents is answering someone in a
// language they did not write to you in.

/** Scripts we can name. `latin` covers English and romanised Indian languages. */
export type ReplyScript =
  | "latin"
  | "devanagari"
  | "gujarati"
  | "bengali"
  | "gurmukhi"
  | "tamil"
  | "telugu"
  | "kannada"
  | "malayalam"
  | "odia";

const RANGES: { script: ReplyScript; re: RegExp }[] = [
  { script: "devanagari", re: /[ऀ-ॿ]/g },
  { script: "gujarati", re: /[઀-૿]/g },
  { script: "bengali", re: /[ঀ-৿]/g },
  { script: "gurmukhi", re: /[਀-੿]/g },
  { script: "tamil", re: /[஀-௿]/g },
  { script: "telugu", re: /[ఀ-౿]/g },
  { script: "kannada", re: /[ಀ-೿]/g },
  { script: "malayalam", re: /[ഀ-ൿ]/g },
  { script: "odia", re: /[଀-୿]/g },
];

const LATIN = /[A-Za-z]/g;

// A couple of Sanskrit terms dropped into an otherwise Roman-script message is
// not a request for a Devanagari reply — someone writing "what does समाधान
// mean?" wants an English answer. So a non-Latin script has to carry a real
// share of the letters before it wins, rather than merely appearing.
const MIN_SHARE = 0.3;

function count(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

/**
 * The script a reply should be written in, or undefined when there is nothing
 * to go on — an empty message, digits, or a photo with no caption. Undefined
 * means "say nothing about script", which leaves the base instruction in
 * charge; it never means latin.
 */
export function detectReplyScript(text: string): ReplyScript | undefined {
  const source = text.trim();
  if (!source) return undefined;

  const latin = count(source, LATIN);
  let best: { script: ReplyScript; n: number } | undefined;
  let indic = 0;
  for (const { script, re } of RANGES) {
    const n = count(source, re);
    indic += n;
    if (n > 0 && (best === undefined || n > best.n)) best = { script, n };
  }

  const letters = latin + indic;
  if (letters === 0) return undefined;
  if (best && best.n / letters >= MIN_SHARE) return best.script;
  return latin > 0 ? "latin" : undefined;
}

const NAMES: Record<ReplyScript, string> = {
  latin: "the Roman alphabet",
  devanagari: "Devanagari",
  gujarati: "the Gujarati script",
  bengali: "the Bengali script",
  gurmukhi: "Gurmukhi",
  tamil: "the Tamil script",
  telugu: "the Telugu script",
  kannada: "the Kannada script",
  malayalam: "the Malayalam script",
  odia: "the Odia script",
};

/**
 * The line appended to the system prompt for this turn.
 *
 * Note what this does and does not decide. Detection here is of *script*, which
 * a Unicode range settles exactly. Whether Roman letters are carrying English
 * or Hindi is a judgement about *language*, and a short message — two romanised
 * Hindi words with no function words in them — defeats any marker list you
 * care to write. So the split is deliberate: this states the policy and what
 * was observed, and leaves the one genuinely ambiguous call to the model, which
 * is reliable at it.
 *
 * The Roman-script branch carries two rules that exist for two different bugs:
 *
 *   - Romanised Hindi is answered in Devanagari, not in Roman. Hinglish output
 *     reads worse than either language written properly, and someone typing
 *     Hindi in Roman is usually doing it for want of a keyboard rather than
 *     because Devanagari is hard for them to read.
 *   - Judge from *this* message rather than from the reply before it. Without
 *     that, one Hinglish turn pins the whole thread: the model starts matching
 *     its own last answer, so a later question in plain English keeps coming
 *     back in Hindi. That is a real failure, not a hypothetical one.
 */
export function replyScriptInstruction(script: ReplyScript): string {
  if (script === "latin") {
    return [
      `This person wrote to you in ${NAMES.latin}. Which language that is decides your reply, so read this message on its own terms:`,
      ``,
      `- If they wrote **English**, reply in English.`,
      `- If they wrote **Hindi in Roman letters** — Hinglish — reply in **Hindi in Devanagari**. Do not answer in romanised Hindi: half-transliterated Hindi reads worse than either language written properly.`,
      ``,
      `Decide from the message above, not from what you said last turn. If an earlier reply in this conversation was in Hindi and they have now written to you in English, answer in English — your own previous replies are not evidence of what they want.`,
    ].join("\n");
  }
  return `This person wrote to you in ${NAMES[script]}. Reply in ${NAMES[script]} — do not switch them to another script, including romanising it.`;
}
