// Which script a person is writing in, and the instruction that holds Dhee to
// it.
//
// The system prompt already asks for a reply in the language and script the
// person used. That instruction alone is not enough: it sits a long way into a
// large prompt, and the corpus tools return dense Devanagari that pulls the
// model's output the same way. The failure it produces is specific — someone
// writes Hindi in Roman letters and gets Devanagari back — and once it happens
// the thread's own history keeps it happening, because the model then matches
// its previous replies rather than the person's messages.
//
// So the script is decided here, from the message, and re-asserted on every
// turn. Being restated each turn is the point: it means a thread that drifted
// once is corrected on the next turn rather than staying drifted.
//
// A preference, not a cage — the same shape as the plain-language rule. A
// Devanagari term inside a Roman-script reply is fine and often the honest
// word; what this prevents is answering in a script the person did not use.

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
 * The line appended to the system prompt for this turn. Written as an
 * observation plus a rule, because the model follows a stated fact about the
 * person better than a bare imperative — and it names the Hinglish case
 * outright, since that is the one that goes wrong.
 */
export function replyScriptInstruction(script: ReplyScript): string {
  if (script === "latin") {
    return `This person wrote to you in ${NAMES.latin}. Reply in ${NAMES.latin}, whatever language they are writing — if they wrote Hindi in Roman letters, answer in Hindi in Roman letters. Do not answer in Devanagari. Individual terms may keep their own script where that is the honest word, but the reply itself stays in the script they used.`;
  }
  return `This person wrote to you in ${NAMES[script]}. Reply in ${NAMES[script]} — do not switch them to another script, including romanising it.`;
}
