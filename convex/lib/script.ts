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
//   another language  -> that language, in its own script
//   in Roman letters
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
 * The Roman-script branch carries three rules. Two exist for two different
 * bugs; the third closes the gap they would otherwise leave:
 *
 *   - Romanised Hindi is answered in Devanagari, not in Roman. Hinglish output
 *     reads worse than either language written properly, and someone typing
 *     Hindi in Roman is usually doing it for want of a keyboard rather than
 *     because Devanagari is hard for them to read.
 *   - Any other Indian language typed in Roman letters is answered in that
 *     language, in its own script. Without this line the two above read as an
 *     exhaustive list, and romanised Gujarati — which shares a lot of
 *     vocabulary with Hindi — gets answered in Devanagari Hindi, a language
 *     the person did not write.
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
      `- If they wrote **another Indian language in Roman letters** — Gujarati, Marathi, Tamil, or any other — reply in that language, in its own script, for the same reason. Do not answer them in Hindi.`,
      ``,
      `Decide from the message above, not from what you said last turn. If an earlier reply in this conversation was in Hindi and they have now written to you in English, answer in English — your own previous replies are not evidence of what they want.`,
    ].join("\n");
  }
  return `This person wrote to you in ${NAMES[script]}. Reply in ${NAMES[script]} — do not switch them to another script, including romanising it.`;
}
