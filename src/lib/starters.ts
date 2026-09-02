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
//
// Each mode holds a pool of eight to twelve, and the screen shows three of them,
// drawn at random. A returning person sees different questions each visit,
// which teaches the breadth of what can be asked here better than any fixed
// trio could. The draw is stable while they look at it (see `sampleStarters`).
//
// The test every question has to pass before it goes in a pool: the good
// answer changes the frame; it does not give tips.

export type ModeKey =
  | "relationships"
  | "parenting"
  | "decisions"
  | "mind"
  | "work"
  | "change-loss"
  | "big-questions"
  | "adhyayan";

// In the order the chips appear. Relationships and parenting first, because
// they are what most people arrive carrying. Adhyayan last: it is the one mode
// that speaks in the darshan's own vocabulary, and a newcomer who taps it sees
// unfamiliar territory and moves on — honestly told that depth exists here —
// while a student feels seen.
export const MODE_KEYS: readonly ModeKey[] = [
  "relationships",
  "parenting",
  "decisions",
  "mind",
  "work",
  "change-loss",
  "big-questions",
  "adhyayan",
] as const;

// Written out rather than built by concatenation, so a mode whose label was
// never added to i18n.ts is a type error here instead of an empty chip on
// someone's home screen.
const MODE_LABEL_KEYS = {
  relationships: "modeRelationships",
  parenting: "modeParenting",
  decisions: "modeDecisions",
  mind: "modeMind",
  work: "modeWork",
  "change-loss": "modeChangeLoss",
  "big-questions": "modeBigQuestions",
  adhyayan: "modeAdhyayan",
} as const satisfies Record<ModeKey, StringKey>;

/** The i18n key holding each mode's chip label. */
export const modeLabelKey = (mode: ModeKey): StringKey => MODE_LABEL_KEYS[mode];

type StarterSet = Record<ModeKey | "default", readonly string[]>;

// The English and Hindi pools are parallel in coverage, not word for word, and
// are sampled independently. The default pool is the storefront: every register
// represented, several of its questions borrowed from the modes.
const en: StarterSet = {
  default: [
    "Why does getting what I wanted stop feeling good so quickly?",
    "My father and I care about each other and still can't really talk. What's in the way?",
    "Is it possible to be deeply at peace and still be ambitious?",
    "I know exactly what I should do, and I still don't do it. What's going on?",
    "Why does every human being want respect?",
    "The same fight keeps repeating at home. What is it actually about?",
    "How much money would actually be enough for me?",
    'I did most things "right" and still feel empty. Where do I even start?',
    "I get angry with my child and then feel terrible. How do I break the loop?",
    "Is lasting contentment actually possible, or do people just get moments of it?",
  ],
  relationships: [
    "The same fight keeps repeating at home. What is it actually about?",
    "My sibling and I have become strangers with a shared history. Where do I begin?",
    "The love in my marriage has gone quiet. Is something wrong, or is this what years do?",
    "How much should I adjust for my parents when I disagree with how they see things?",
    "Someone I love keeps disappointing me. How much is fair to expect?",
    "I feel lonely even around people. Why?",
    "How do I repair things with someone I've quietly drifted from?",
    "Do I trust people for who they are, or for what they do for me?",
    "I gave a lot to someone and got little back. How do I stop keeping score?",
    "My in-laws and I see life completely differently. How do we live under one roof?",
    "A friendship that mattered ended without a real ending. How do I settle it inside?",
    "How do I stay kind to someone who has hurt me, without pretending it didn't happen?",
  ],
  parenting: [
    "My child barely talks to me anymore. What changed between us?",
    "How do I discipline my child without using fear?",
    "My child lies to me sometimes. What should I actually address — the lie, or the reason for it?",
    "I keep comparing my child to others, and I hate that I do. How do I stop?",
    "Screens are winning at home. Is the fight really about phones, or something else?",
    "I want my child to have values I don't fully live myself. Is that hypocrisy, or just parenting?",
    "How much of my child's future is my responsibility, and how much is theirs?",
    "My child asked me about death, and I had no answer. How do I answer honestly?",
    "What does my child actually need from me at this age — beyond marks and manners?",
    "I get angry with my child and then feel terrible. How do I break the loop?",
    "How do I raise a confident child without raising an entitled one?",
  ],
  decisions: [
    "How do I tell the difference between fear and genuine caution?",
    "Everyone I ask gives different advice. How do I know whose to trust, including my own?",
    "How do I decide something big when I can't know how it will turn out?",
    "I have two good options and can't take a step. How do I choose without regret?",
    "My mind keeps changing on this. What is that telling me?",
    "How do I say no without carrying guilt for days?",
    'Half my life runs on "what will people say." How do I decide from somewhere else?',
    "I made a choice years ago and still wonder about the other road. How do I make peace with it?",
    "When should I persist and when should I let go? How do I tell which one this is?",
  ],
  mind: [
    "I know exactly what I should do, and I still don't do it. What's going on?",
    "Why does one small comment ruin my whole day?",
    "I compare myself to others even when I'm doing fine. Why?",
    "How do I stop replaying a conversation in my head?",
    "Why do I reach for my phone the moment I'm free?",
    "My anger comes fast and I regret it later. Where does it actually start?",
    "I'm always slightly worried, even when nothing is wrong. What is that?",
    "Why is it so hard for me to simply rest?",
    "Jealousy embarrasses me, but it shows up anyway. What is it really about?",
    "Some nights my mind just won't stop. What does it want?",
  ],
  work: [
    "How much money would actually be enough for me?",
    "I'm successful and unfulfilled. What am I missing?",
    "My work feels pointless some days. Is the problem the work, or me?",
    "How do I care about my work without it becoming my whole identity?",
    "When is quitting wisdom, and when is it avoidance?",
    "I earn well and still feel insecure about money. Why doesn't it settle?",
    "Everyone around me is racing. Do I have to?",
    "What would make my work feel meaningful, and not just successful?",
    "I want to earn honestly in a world that doesn't always reward it. How do I hold that?",
  ],
  // The first four are the transitions; the sampler makes sure one of them is
  // always on screen, so the door to this mode never reads as grief alone.
  "change-loss": [
    "A chapter of my life is ending and I don't feel ready. How do I meet it?",
    "My children need me less and less now. What are my days for next?",
    "I'm not young anymore, and it's starting to show. How do I age without fear?",
    "My parents are getting old. How do I prepare — practically, and inside?",
    "How do I keep living normally while carrying a loss?",
    "Is it okay that I still feel this, a long time later?",
    "How do I be with someone who is grieving?",
    "I lost something that can't come back — a person, a time, a version of me. How do I go on?",
    "Why do I feel guilty for being happy again?",
    "A regret from years ago still visits me. What does it want from me?",
    "Someone close to me is seriously ill. How do I be with them — and with myself?",
    "I'm afraid of death, and my only strategy is not thinking about it. Is there another way?",
  ],
  // The gateway to adhyayan, phrased with none of its vocabulary. Curiosity
  // rather than a problem: the good answer to these is a picture, not advice.
  "big-questions": [
    "Why does every human being, everywhere, want respect?",
    "What's the difference between knowing about something and actually understanding it?",
    "Is human nature basically good? It doesn't always look like it.",
    "Is lasting contentment actually possible, or do people just get moments of it?",
    "Does everyone ultimately want the same thing, underneath everything?",
    'When we say "my body," who is the "me" that\'s saying it?',
    "Can a person truly change, or do we just learn to manage ourselves?",
    "Even people who lie want to be trusted. Why?",
    "Is there a way to know what's right, or is it all opinion in the end?",
    "What is a human being for? Not me specifically — any of us.",
    "Why does nature look so orderly, and human life so messy?",
  ],
  // For students already in adhyayan, on the English UI: the darshan's terms
  // romanised inside an English frame. The one pool where that vocabulary is
  // expected — these are the questions students actually carry.
  adhyayan: [
    "What's the difference between adhyayan and reading? How do I know whether what I'm doing is adhyayan at all?",
    "I can recite the paribhashas, but the vastu doesn't come into grasp. How do I get from the word to the meaning?",
    "How does one actually do manan? How is it different from ordinary thinking?",
    "Things feel logically consistent up to aabhas. How does one move toward sakshatkar?",
    "My understanding seems to grow, but it isn't showing up in how I live. How do adhyayan and jeena connect?",
    "Do I have a chaahat for samadhan, or an understanding of it? How do I check that in myself?",
    "Seeing jeevan and sharir as distinct still feels like imagination. What's the practice?",
    '"Coexistence is nitya vartaman" — my intellect accepts it, but it hasn\'t become hridayangam. What now?',
    "Where does living with nyaya begin — in my own family?",
    "How does the practice of mulyankan in relationships actually start?",
    "Can adhyayan happen alone, or is sangat essential?",
    "My understanding is incomplete. Should I speak of this to others, or wait until it's pramanit in me?",
  ],
};

// Written rather than translated. A starter has to sound like something a
// person would actually type, and a literal rendering of the English reads as
// a form field — which defeats the point of offering it.
//
// First person is kept gender-neutral where it costs nothing — the subjunctive
// (करूँ, लूँ, बैठूँ), मैंने with object agreement, or हम — so a starter does not
// read male by default. Never at the cost of sounding like something nobody
// would say: natural beats neutral when they conflict.
const hi: StarterSet = {
  default: [
    "जो चाहा था वो मिल भी जाए, तो अच्छा क्यों नहीं लगता ज़्यादा दिन?",
    "पिताजी और मैं एक-दूसरे की परवाह करते हैं, फिर भी खुलकर बात नहीं हो पाती। बीच में क्या है?",
    "क्या गहरे में शांत रहते हुए भी बड़े सपने रखे जा सकते हैं?",
    "मुझे साफ़ पता है क्या करना चाहिए, फिर भी हो नहीं पाता। ये क्या है?",
    "हर इंसान सम्मान क्यों चाहता है?",
    "घर में वही झगड़ा बार-बार होता है। असल बात क्या है?",
    "मेरे लिए कितना पैसा सचमुच काफ़ी होगा?",
    'सब कुछ "सही" किया, फिर भी भीतर खाली लगता है। शुरू कहाँ से करूँ?',
    "बच्चे पर गुस्सा आता है, फिर बहुत बुरा लगता है। यह चक्र कैसे टूटे?",
    "क्या स्थायी तृप्ति जैसी कोई चीज़ होती है, या बस कुछ पल मिलते हैं?",
  ],
  relationships: [
    "घर में वही झगड़ा बार-बार होता है। असल बात क्या है?",
    "भाई-बहन से रिश्ता अब बस औपचारिक रह गया है, जबकि बचपन साथ बीता। शुरुआत कहाँ से करूँ?",
    "शादी में प्रेम चुप-सा हो गया है। कुछ गड़बड़ है, या सालों के साथ ऐसा ही होता है?",
    "माता-पिता से सोच नहीं मिलती। कितना झुकना ठीक है?",
    "जिनसे प्रेम है वही बार-बार निराश करते हैं। कितनी अपेक्षा रखना ठीक है?",
    "लोगों के बीच रहकर भी अकेलापन क्यों लगता है?",
    "जिससे धीरे-धीरे दूरी बन गई, उससे रिश्ता फिर से कैसे जोड़ूँ?",
    "लोगों पर मेरा भरोसा किस पर टिका है — वे जो हैं उस पर, या जो वे मेरे लिए करते हैं उस पर?",
    "मैंने बहुत दिया और बदले में कम मिला। यह हिसाब-किताब मन से कैसे हटे?",
    "ससुराल वालों की और मेरी सोच बिल्कुल अलग है। एक घर में कैसे निभे?",
    "एक गहरी दोस्ती बिना किसी अंत के ख़त्म हो गई। मन में इसे कैसे समेटूँ?",
    "जिसने चोट पहुँचाई है, उसके साथ बिना दिखावे के अच्छा कैसे रहूँ?",
  ],
  parenting: [
    "बच्चा अब मुझसे खुलकर बात नहीं करता। हमारे बीच क्या बदल गया?",
    "बिना डर का सहारा लिए बच्चे को अनुशासन कैसे सिखाऊँ?",
    "बच्चा कभी-कभी झूठ बोलता है। असल में किस पर ध्यान दूँ — झूठ पर, या उसकी वजह पर?",
    "मन ही मन अपने बच्चे की तुलना दूसरों से होती रहती है, और यह मुझे ही अच्छा नहीं लगता। यह कैसे रुके?",
    "घर में मोबाइल जीत रहा है। लड़ाई सच में फ़ोन की है, या किसी और चीज़ की?",
    "बच्चे को वे मूल्य देने हैं जो ख़ुद मुझमें पूरे नहीं उतरे। यह दिखावा है या परवरिश?",
    "बच्चे के भविष्य की कितनी ज़िम्मेदारी मेरी है, और कितनी उसकी?",
    "बच्चे ने मौत के बारे में पूछा और मेरे पास जवाब नहीं था। सच्चाई से कैसे बताऊँ?",
    "इस उम्र में बच्चे को मुझसे असल में क्या चाहिए — नंबरों और तमीज़ के आगे?",
    "बच्चे पर गुस्सा आता है, फिर बहुत बुरा लगता है। यह चक्र कैसे टूटे?",
    "बच्चे में आत्मविश्वास आए, पर अकड़ नहीं — यह कैसे हो?",
  ],
  decisions: [
    "डर और सच्ची सावधानी में फ़र्क कैसे पहचानूँ?",
    "सब अलग-अलग सलाह देते हैं। किसकी मानूँ — और अपनी बात पर कब भरोसा करूँ?",
    "जिसका नतीजा पता ही नहीं चल सकता, वो बड़ा फ़ैसला कैसे लूँ?",
    "दो अच्छे रास्ते सामने हैं और क़दम नहीं उठ रहा। बिना पछतावे के कैसे चुनूँ?",
    "मेरा मन इस पर बार-बार बदल जाता है। यह क्या बताता है?",
    '"ना" कैसे कहूँ कि दिनों तक अपराध-बोध न रहे?',
    'आधी ज़िंदगी "लोग क्या कहेंगे" पर चलती है। फ़ैसले कहीं और से कैसे लूँ?',
    "सालों पहले एक राह चुनी थी, दूसरी राह अब भी याद आती है। इससे सुलह कैसे करूँ?",
    "कब डटे रहना समझदारी है और कब छोड़ देना? यह कैसे पहचानूँ?",
  ],
  mind: [
    "मुझे साफ़ पता है क्या करना चाहिए, फिर भी हो नहीं पाता। ये क्या है?",
    "किसी की एक छोटी-सी बात पूरा दिन क्यों बिगाड़ देती है?",
    "सब ठीक चल रहा हो तब भी दूसरों से तुलना मन में चलती रहती है। क्यों?",
    "कोई बातचीत मन में बार-बार चलती रहती है — इसे कैसे रोकूँ?",
    "ज़रा-सा खाली हुआ नहीं कि हाथ फ़ोन पर चला जाता है। ऐसा क्यों?",
    "गुस्सा झट से आ जाता है और बाद में पछतावा होता है। यह शुरू कहाँ से होता है?",
    "कुछ भी ग़लत न हो तब भी हल्की-सी चिंता लगी रहती है। यह क्या है?",
    "सचमुच का आराम करना इतना कठिन क्यों है?",
    "ईर्ष्या पर शर्म आती है, फिर भी वह आ ही जाती है। असल में यह किस बारे में है?",
    "कुछ रातों को मन रुकता ही नहीं। वह चाहता क्या है?",
  ],
  work: [
    "मेरे लिए कितना पैसा सचमुच काफ़ी होगा?",
    "मैं सफल हूँ, पर तृप्त नहीं। क्या छूट रहा है?",
    "कभी-कभी काम बेमतलब लगता है। दिक्कत काम में है या मुझमें?",
    "काम की परवाह करूँ, पर वही मेरी पूरी पहचान न बन जाए — यह कैसे हो?",
    "छोड़ देना कब समझदारी है, और कब बचकर निकलना?",
    "कमाई अच्छी है, फिर भी पैसे को लेकर असुरक्षा बनी रहती है। यह शांत क्यों नहीं होती?",
    "आस-पास सब दौड़ रहे हैं। क्या मुझे भी दौड़ना ज़रूरी है?",
    "काम सिर्फ़ सफल नहीं, सार्थक कब लगेगा?",
    "ईमानदारी से कमाने की ठानी है, पर दुनिया हमेशा इसका साथ नहीं देती। इसे कैसे निभाऊँ?",
  ],
  "change-loss": [
    "ज़िंदगी का एक अध्याय ख़त्म हो रहा है और मन तैयार नहीं। इसका सामना कैसे करूँ?",
    "बच्चों को अब मेरी उतनी ज़रूरत नहीं रही। अब मेरे दिन किसके लिए हों?",
    "उम्र अब दिखने लगी है। ढलती उम्र से बिना डरे कैसे मिलूँ?",
    "माता-पिता बूढ़े हो रहे हैं। बाहर की और भीतर की — दोनों तैयारी कैसे करूँ?",
    "एक खोने का बोझ लिए हुए रोज़ का जीवन कैसे चलाऊँ?",
    "इतना समय बीत जाने पर भी यह अब तक महसूस होता है — क्या यह ठीक है?",
    "जो शोक में है, उसके पास कैसे बैठूँ?",
    "जो लौट नहीं सकता — कोई इंसान, कोई समय, अपना ही पुराना रूप — उसे खोकर आगे कैसे बढ़ूँ?",
    "फिर से ख़ुश होने पर अपराध-बोध क्यों होता है?",
    "सालों पुराना एक पछतावा अब भी लौट-लौट कर आता है। वह मुझसे क्या चाहता है?",
    "कोई अपना गंभीर रूप से बीमार है। उसके साथ — और अपने साथ — कैसे रहूँ?",
    "मौत से डर लगता है, और बचाव बस यही है कि उसके बारे में सोचूँ ही नहीं। कोई और रास्ता है?",
  ],
  "big-questions": [
    "हर इंसान, हर जगह, सम्मान क्यों चाहता है?",
    "किसी चीज़ के बारे में जानने और उसे सचमुच समझने में क्या फ़र्क है?",
    "क्या इंसान मूल रूप से अच्छा है? देखने में तो हमेशा ऐसा नहीं लगता।",
    "क्या स्थायी तृप्ति जैसी कोई चीज़ होती है, या बस कुछ पल मिलते हैं?",
    "क्या गहरे में सब इंसान एक ही चीज़ चाहते हैं?",
    'जब हम कहते हैं "मेरा शरीर", तो कहने वाला "मैं" कौन है?',
    "क्या इंसान सचमुच बदल सकता है, या हम बस ख़ुद को सँभालना सीख लेते हैं?",
    "झूठ बोलने वाला भी चाहता है कि उस पर भरोसा किया जाए। ऐसा क्यों?",
    "सही-ग़लत जानने का कोई पक्का तरीक़ा है, या अंत में सब राय ही है?",
    "इंसान है किसलिए? मैं नहीं — कोई भी इंसान।",
    "प्रकृति में इतनी व्यवस्था दिखती है और इंसान की ज़िंदगी में इतनी उलझन। ऐसा क्यों?",
  ],
  adhyayan: [
    "अध्ययन और पढ़ने में क्या फ़र्क है? मुझे कैसे पता चले कि जो हो रहा है वह अध्ययन है?",
    "परिभाषाएँ याद हो जाती हैं, पर वस्तु पकड़ में नहीं आती। शब्द से अर्थ तक कैसे पहुँचूँ?",
    "मनन कैसे करें? मनन और सामान्य सोच-विचार में क्या अंतर है?",
    "आभास तक तो बात तर्क-संगत लगती है। साक्षात्कार की ओर आगे कैसे बढ़े?",
    "समझ बढ़ती दिख रही है, पर जीने में नहीं उतर रही। अध्ययन और जीने का सम्बन्ध कैसे बने?",
    "मुझमें समाधान की चाहत है या समझ — यह फ़र्क अपने में कैसे जाँचूँ?",
    "जीवन और शरीर को अलग-अलग देखना अभी कल्पना जैसा लगता है। इसका अभ्यास क्या हो?",
    "सह-अस्तित्व नित्य वर्तमान है — यह बुद्धि में बैठता है, पर हृदयंगम नहीं होता। क्या करूँ?",
    "परिवार में न्याय पूर्वक जीने की शुरुआत कहाँ से करूँ?",
    "संबंधों में मूल्यांकन का अभ्यास कैसे शुरू होता है?",
    "क्या अध्ययन अकेले हो सकता है, या संग-साथ अनिवार्य है?",
    "अभी समझ अधूरी है। ऐसे में दूसरों से इस बात को कहूँ या पहले स्वयं में प्रमाणित होने की प्रतीक्षा करूँ?",
  ],
};

const BY_LANGUAGE: Record<Language, StarterSet> = { en, hi };

/** How many of a pool are on screen at once. */
export const SAMPLE_SIZE = 3;

// A mode whose pool has a lighter front: a draw from it always includes one of
// the first `n` questions. Change & loss is the case — a random three from
// that pool can land all-grief, and one transition question keeps the door
// open without touching the pool.
const ANCHORED_FRONT: Partial<Record<ModeKey, number>> = { "change-loss": 4 };

/**
 * The whole pool for a mode, in authored order. `undefined` means no mode is
 * selected, which is the default pool — each question from a different
 * direction, so the screen says "anything of this kind belongs here" rather
 * than steering.
 */
export function starterPool(
  lang: Language,
  mode: ModeKey | undefined,
): readonly string[] {
  const set = BY_LANGUAGE[lang];
  return mode ? set[mode] : set.default;
}

/** A seed for `sampleStarters`: a fresh one each time it is asked for. */
export function newSeed(): number {
  return Math.floor(Math.random() * 0x100000000);
}

// Deterministic, so the same seed always draws the same three. That is what
// keeps the sample still while someone is looking at it: the screen holds a
// seed, and re-renders, the keyboard, and a tab switch all leave it alone. A
// new draw is a new seed — on arriving at the screen, or on choosing a chip.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * The questions to show: `SAMPLE_SIZE` of the pool, distinct, chosen by
 * `seed`. The same seed gives the same draw.
 */
export function sampleStarters(
  lang: Language,
  mode: ModeKey | undefined,
  seed: number,
): readonly string[] {
  const pool = starterPool(lang, mode);
  const random = mulberry32(seed);
  // A partial Fisher–Yates over the indices: the first SAMPLE_SIZE positions
  // end up holding a uniform draw without replacement.
  const order = pool.map((_, i) => i);
  const count = Math.min(SAMPLE_SIZE, order.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (order.length - i));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const picked = order.slice(0, count);

  const front = mode ? ANCHORED_FRONT[mode] : undefined;
  if (front && !picked.some((i) => i < front)) {
    picked[count - 1] = Math.floor(random() * front);
  }

  return picked.map((i) => pool[i]!);
}
