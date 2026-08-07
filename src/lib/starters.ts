import type { Language, StringKey } from "./i18n";

// Topic modes and the questions offered under each.
//
// Kept out of i18n.ts on purpose. That file's own note says every string in it
// is "user-facing chrome, not content" — these are the opposite: they are
// written questions, the closest thing in the app to authored material, and
// they change for editorial reasons rather than when a label needs rewording.
//
// Why they exist at all: the home screen's only affordance is an empty box, and
// an empty box asks the person to already know how to put a life question into
// words. That is precisely the skill someone is short of on the day they first
// open something like this. A starter is not decoration — it is the difference
// between arriving with a question and arriving with a feeling.
//
// The questions are deliberately specific and a little uncomfortable ("I did
// most things right and still feel empty") rather than tidy prompts ("Tell me
// about purpose"). A generic suggestion gets a generic conversation; a specific
// one gives permission to bring the real thing, even when the person then goes
// on to type something else entirely — which is the outcome to hope for.

export type ModeKey =
  "decisions" | "relationships" | "purpose" | "grief" | "work" | "everyday";

export const MODE_KEYS: readonly ModeKey[] = [
  "decisions",
  "relationships",
  "purpose",
  "grief",
  "work",
  "everyday",
] as const;

// Written out rather than built by concatenation, so a mode whose label was
// never added to i18n.ts is a type error here instead of an empty chip on
// someone's home screen.
const MODE_LABEL_KEYS = {
  decisions: "modeDecisions",
  relationships: "modeRelationships",
  purpose: "modePurpose",
  grief: "modeGrief",
  work: "modeWork",
  everyday: "modeEveryday",
} as const satisfies Record<ModeKey, StringKey>;

/** The i18n key holding each mode's chip label. */
export const modeLabelKey = (mode: ModeKey): StringKey => MODE_LABEL_KEYS[mode];

type StarterSet = Record<ModeKey | "default", readonly string[]>;

const en: StarterSet = {
  default: [
    "How do I repair things with someone I've quietly drifted from?",
    "I did most things 'right' and still feel empty. Where do I even start?",
    "How do I sit with a loss that doesn't seem to lift?",
  ],
  decisions: [
    "I have two good options and I'm paralyzed. How do I choose without regret?",
    "How do I tell the difference between fear and genuine caution?",
    "I keep changing my mind. What does that tell me?",
  ],
  relationships: [
    "Someone I love keeps disappointing me. How much should I expect?",
    "I feel lonely even around people. Why?",
  ],
  purpose: [
    "How do I know if my work actually matters to me?",
    "Everyone talks about 'purpose' — what if I just don't feel one?",
    "How do I live meaningfully without a grand plan?",
  ],
  grief: [
    "How do I keep living normally when I'm carrying a loss?",
    "Is it okay that I still feel this a long time later?",
    "How do I be with someone who's grieving?",
  ],
  work: [
    "I'm successful and unfulfilled. What am I missing?",
    "How do I care about my job without it becoming my whole identity?",
    "When is it wisdom to quit, and when is it avoidance?",
  ],
  everyday: [
    "Why do small annoyances hit me harder than they should?",
    "How do I stop replaying a conversation in my head?",
    "How do I actually rest?",
  ],
};

// Written rather than translated. A starter has to sound like something a
// person would actually type, and a literal rendering of the English reads as
// a form field — which defeats the point of offering it.
const hi: StarterSet = {
  default: [
    "जिससे धीरे-धीरे दूरी बन गई, उससे रिश्ता फिर से कैसे जोड़ूँ?",
    "सब कुछ 'सही' किया, फिर भी भीतर खाली लगता है। शुरू कहाँ से करूँ?",
    "जो खोना हल्का ही नहीं होता, उसके साथ कैसे रहूँ?",
  ],
  decisions: [
    "दो अच्छे रास्ते सामने हैं और मैं जड़ हो गया हूँ। बिना पछतावे के कैसे चुनूँ?",
    "डर और सच्ची सावधानी में फ़र्क कैसे पहचानूँ?",
    "मैं बार-बार मन बदलता रहता हूँ। यह क्या बताता है?",
  ],
  relationships: [
    "जिनसे प्रेम है वही बार-बार निराश करते हैं। कितनी अपेक्षा रखना ठीक है?",
    "लोगों के बीच रहकर भी अकेलापन क्यों लगता है?",
  ],
  purpose: [
    "कैसे जानूँ कि मेरा काम सचमुच मेरे लिए मायने रखता है?",
    "सब 'उद्देश्य' की बात करते हैं — अगर मुझे कोई महसूस ही न हो तो?",
    "बिना किसी बड़ी योजना के अर्थपूर्ण कैसे जिऊँ?",
  ],
  grief: [
    "एक खोने का बोझ लिए हुए रोज़ का जीवन कैसे चलाऊँ?",
    "इतना समय बीत जाने पर भी यह अब तक महसूस होता है — क्या यह ठीक है?",
    "जो शोक में है, उसके पास कैसे बैठूँ?",
  ],
  work: [
    "मैं सफल हूँ, पर तृप्त नहीं। क्या छूट रहा है?",
    "काम की परवाह करूँ, पर वही मेरी पूरी पहचान न बन जाए — यह कैसे हो?",
    "छोड़ देना कब समझदारी है, और कब बचकर निकलना?",
  ],
  everyday: [
    "छोटी-छोटी बातें मुझे ज़रूरत से ज़्यादा क्यों चुभती हैं?",
    "कोई बातचीत मन में बार-बार चलती रहती है — इसे कैसे रोकूँ?",
    "सचमुच का आराम कैसे करूँ?",
  ],
};

const BY_LANGUAGE: Record<Language, StarterSet> = { en, hi };

/**
 * The questions to offer. `undefined` means no mode is selected, which shows
 * the default set — each question from a different direction, so the screen
 * says "anything of this kind belongs here" rather than steering.
 */
export function startersFor(
  lang: Language,
  mode: ModeKey | undefined,
): readonly string[] {
  const set = BY_LANGUAGE[lang];
  return mode ? set[mode] : set.default;
}
