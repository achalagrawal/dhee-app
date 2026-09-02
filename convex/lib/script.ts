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
  { script: "devanagari", re: /[ऀ-ॿ]/ },
  { script: "gujarati", re: /[઀-૿]/ },
  { script: "bengali", re: /[ঀ-৿]/ },
  { script: "gurmukhi", re: /[਀-੿]/ },
  { script: "tamil", re: /[஀-௿]/ },
  { script: "telugu", re: /[ఀ-౿]/ },
  { script: "kannada", re: /[ಀ-೿]/ },
  { script: "malayalam", re: /[ഀ-ൿ]/ },
  { script: "odia", re: /[଀-୿]/ },
];

// Only letters count. Digits, dandas, and punctuation belong to a script's
// block without saying anything about what the person is writing in — "१२३"
// or a lone "।" is not a Devanagari message — and matras and viramas are marks
// on a letter rather than letters, so counting them would let one Devanagari
// word outweigh three English ones.
const LETTER = /\p{L}/u;
const LATIN = /\p{Script=Latin}/u;

// Something in quotation marks is being asked *about*, not written *in*. A
// study question that quotes a whole line of the corpus — "what does 'जीवन ही
// ज्ञान है' mean?" — is a Roman-script question and wants a Roman-script
// answer, however much Devanagari the quotation carries.
const QUOTED = /["“”„«»][^"“”„«»]*["“”„«»]|‘[^’]*’|`[^`]*`/g;

// A non-Latin script wins only when it carries the message: most of the words,
// not most of the letters, and by a clear margin. "kya ye sahi hai: व्यवस्था"
// is a Roman-script question about one Devanagari word; "मुझे अपनी job में
// satisfaction नहीं मिलता" is Hindi with two English words in it. When the two
// are close to even, Roman wins, because someone who has written a substantial
// part of their message in Roman letters can read a reply in them — and the
// base instruction still asks for their language.
const MIN_SHARE = 0.7;

/** Which script a single word is written in, by its letters. */
function wordScript(word: string): ReplyScript | undefined {
  const tally = new Map<ReplyScript, number>();
  for (const ch of word) {
    if (!LETTER.test(ch)) continue;
    const script = LATIN.test(ch)
      ? "latin"
      : RANGES.find(({ re }) => re.test(ch))?.script;
    if (!script) continue;
    tally.set(script, (tally.get(script) ?? 0) + 1);
  }
  return leader(tally)?.script;
}

function leader<K>(
  tally: Map<K, number>,
): { script: K; n: number } | undefined {
  let best: { script: K; n: number } | undefined;
  for (const [script, n] of tally) {
    if (best === undefined || n > best.n) best = { script, n };
  }
  return best;
}

function scriptsOfWords(text: string): ReplyScript[] {
  const scripts: ReplyScript[] = [];
  for (const word of text.split(/\s+/)) {
    const script = wordScript(word);
    if (script) scripts.push(script);
  }
  return scripts;
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

  // Judge the person's own words first; fall back to the whole message when
  // the quotation is all there is.
  let words = scriptsOfWords(source.replace(QUOTED, " "));
  if (words.length === 0) words = scriptsOfWords(source);
  if (words.length === 0) return undefined;

  const tally = new Map<ReplyScript, number>();
  for (const script of words) tally.set(script, (tally.get(script) ?? 0) + 1);
  const latin = tally.get("latin") ?? 0;
  tally.delete("latin");
  const best = leader(tally);

  if (best && best.n / words.length >= MIN_SHARE) return best.script;
  if (latin > 0) return "latin";
  return best?.script;
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
