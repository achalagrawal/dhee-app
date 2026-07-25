// Detecting that someone may be in danger.
//
// This runs server-side, in `chat.sendMessage`, so it applies to every client
// and every path rather than only the one screen that remembers to call it.
// The design put the same check in the browser, which incognito and any
// non-standard client would have skipped.
//
// Two deliberate choices, both from docs/build/specs/chat-loop.md and #19:
//
// 1. HIGH RECALL, NOT HIGH PRECISION. "This job is killing me" will match.
//    That is the intended trade: the consequence of a false positive is a card
//    offering a phone number to someone who did not need it, and the
//    consequence of a false negative is missing someone who did. Do not tune
//    this toward silence.
//
// 2. NOT ENGLISH-ONLY. The app ships Hindi, and an English-only list is worse
//    than none at all for a Hindi-speaking person in trouble, because it looks
//    like coverage while catching nothing. Devanagari and Roman-script Hindi
//    are both here, since people write Hinglish in either.
//
// This is a keyword net, not a classifier. It is meant to be obvious and
// auditable rather than clever — anyone should be able to read the list and
// add a phrasing they have heard.

const ENGLISH = [
  "kill myself",
  "killing myself",
  "suicid", // suicide, suicidal
  "end my life",
  "end it all",
  "take my own life",
  "want to die",
  "wanna die",
  "wish i was dead",
  "wish i were dead",
  "better off dead",
  "better off without me",
  "no reason to live",
  "nothing to live for",
  "don't want to live",
  "dont want to live",
  "do not want to live",
  "self harm",
  "self-harm",
  "selfharm",
  "hurt myself",
  "harm myself",
  "cut myself",
];

// Devanagari. Stems rather than whole sentences, so inflections still match.
const HINDI = [
  "आत्महत्या", // suicide
  "खुदकुशी", // suicide
  "ख़ुदकुशी",
  // Stems stop before the verb ending so chahta / chahti / chahiye all match.
  "मरना चाह", // want to die
  "मर जाऊं", // let me die
  "मर जाऊँ",
  "मर जाना चाह",
  "जीना नहीं चाह", // don't want to live / shouldn't live
  "जीना नही चाह",
  "जीने का मन नहीं",
  "जीने की इच्छा नहीं",
  "खुद को मार", // kill myself
  "ख़ुद को मार",
  "अपने आप को मार",
  "जान दे द", // take my own life
  "जान देने",
  "खुद को नुकसान", // harm myself
  "ख़ुद को नुकसान",
  "जीने का कोई मतलब नहीं", // no reason to live
  "सब खत्म कर द", // end it all
  "सब ख़त्म कर द",
];

// Roman-script Hindi. Spelling varies a lot, so these are short stems.
const HINGLISH = [
  "atmahatya",
  "aatmahatya",
  "khudkushi",
  "khudkhushi",
  "marna chah", // marna chahta / chahti / chahiye
  "mar jau",
  "mar jaun",
  "mar jana chah",
  "jeena nahi chah",
  "jeena nahin chah",
  "jina nahi chah",
  "jeene ka mann nahi",
  "jeene ki ichha nahi",
  "khud ko maar",
  "khud ko marna",
  "apne aap ko maar",
  "jaan de du",
  "jaan de dun",
  "jaan dene",
  "khud ko nuksan",
  "jeene ka koi matlab nahi",
];

const PHRASES = [...ENGLISH, ...HINDI, ...HINGLISH];

/**
 * Whether a message suggests the person may be in danger.
 *
 * Pure and synchronous so it can be unit-tested without a database, and so the
 * phrase list stays the only thing anyone has to review.
 */
export function detectsCrisis(text: string): boolean {
  const haystack = text.toLowerCase();
  return PHRASES.some((phrase) => haystack.includes(phrase));
}
