# Spec: Starter questions v2 — pools, sampled per render

**Epic:** 1 — App shell & navigation (row: _Home topic modes + per-mode starter questions_)
**Status when written:** ✅ (v1 shipped in #136; this revises it)

> Authored spec, kept verbatim below. Implementation notes follow at the end.

Spec for changes to `src/lib/starters.ts` (and touching `src/lib/i18n.ts` for chip labels).
Builds on PR #136. The mechanism there (modes + chips + tap-to-send, hidden once the
composer has text) stays. What changes: the mode set, the labels, and — the main thing —
each mode now holds a **pool** of questions and the UI shows a **sample of 3**.

## Behaviour changes

1. **Sample 3 per render.** Each mode (and the default) holds 8–12 questions. When a mode
   is shown, pick 3 at random without replacement. Stability rule: the sample must not
   change while the person is looking at it — re-renders, keyboard open/close, tab
   switches must show the same 3. Re-sample on: app open / new session, tapping the same
   chip again (deselect → reselect), or an explicit refresh affordance if one exists.
   A returning user seeing different questions each visit is the point — it teaches the
   breadth of what can be asked here better than any fixed trio.

2. **Mode changes.**
   - `everyday` → renamed `mind` (chip: EN "Mind", HI "मन"). Broader: emotions,
     habits of attention, restlessness — not just daily annoyances.
   - `grief` → renamed `change-loss` (chip: EN "Change & loss", HI "बदलाव"). "Grief"
     as a chip is too grim a door. The pool keeps the grief questions — the people who
     need them really need them — but widens to transitions: aging, children growing up,
     parents growing old, chapters ending. The softer register is carried by the mix,
     not by removing anything.
   - **New mode `parenting`** (chip: EN "Parenting", HI "परवरिश"). Split out of
     relationships. Likely the most-tapped chip; the parent–child questions moved here
     from the relationships pool.
   - `purpose` → **removed as a mode**. Its questions are split between `work` and the
     new `big-questions`.
   - `work` → chip becomes EN "Work & money", HI "काम और पैसा". Money questions are new
     and important — no other app answers "how much is enough" non-trivially.
   - **New mode `big-questions`** (chip: EN "Big questions", HI "बड़े सवाल"). This is the
     adhyayan gateway, phrased with zero MD vocabulary. Curiosity-framed, not
     problem-framed: the good answer to these is a picture, not advice.
   - **New mode `adhyayan`** (chip: "अध्ययन" in both languages — untranslated on the EN
     UI too; the word itself is the signal, and translating it would defeat the point).
     This is the one mode where MD vocabulary is allowed and expected: it exists for
     people already in adhyayan, and its questions are the ones students actually carry.
     Position: **last chip**. A newcomer who taps it sees unfamiliar territory and moves
     on — which is honest; it signals that depth exists here. A student feels seen.
     (Later refinement, not now: surface or highlight this chip based on the user model —
     `conceptsTouched` already knows who is engaging with MD material.)
   - Final chip order: relationships, parenting, decisions, mind, work, change-loss,
     big-questions, adhyayan. (Relationships and parenting first — they are what most
     people arrive carrying.)

3. **i18n keys.** Add/rename chip label keys accordingly (`modeParenting`, `modeMind`,
   `modeChangeLoss`, `modeWorkMoney` or reuse `modeWork`, `modeBigQuestions`,
   `modeAdhyayan`; drop `modePurpose`, `modeEveryday`, `modeGrief`). `modeAdhyayan` has
   the same value ("अध्ययन") in both languages.

3a. **Register implication of the adhyayan mode — check `DHEE_INSTRUCTIONS`.** The
prompt's plain-language rule ("never MD terminology") was written for the general
user. A person who _asks_ in MD terms — which is what tapping an adhyayan starter
does — should be answered in MD terms; a plain-language reply to "साक्षात्कार कैसे
होता है?" would be absurd. If the current instruction is unconditional, soften it to:
match the user's vocabulary — plain language by default, MD terminology when the
user's own message uses it. This is the same shape as the script rule from #136
(mirror the person, not the corpus), so if a per-turn mechanism is ever needed it can
ride the same infrastructure — but try the prompt-level fix first; the model matching
an MD-vocabulary user message is a much easier ask than resisting Devanagari drift
was. The `MODE_LABEL_KEYS` written-out-not-concatenated
pattern and its type error protection stay.

4. **Keep the editorial comment block** at the top of `starters.ts` (the "an empty box
   asks the person to already know how to put a life question into words" note). Update
   it to mention the pool-and-sample design and the test each question must pass:
   _the good answer changes the frame; it does not give tips._

5. **Hindi is written, not translated** (existing rule — keep the comment). One addition:
   prefer gender-neutral first person where it costs nothing — subjunctive forms
   (करूँ, लूँ, बैठूँ are neutral), मैंने + object-agreement past, or हम — so a starter
   doesn't read male-by-default. Don't contort a question to achieve this; natural beats
   neutral when they conflict.

## The pools

Counts below: default 10, relationships 12, parenting 11, decisions 9, mind 10, work 9,
change-loss 12, big-questions 11, adhyayan 12 — same counts in both languages. The Hindi and English pools are
parallel in coverage but not word-for-word; sample independently per language.

### default (EN) — the storefront; every register represented

1. Why does getting what I wanted stop feeling good so quickly?
2. My father and I care about each other and still can't really talk. What's in the way?
3. Is it possible to be deeply at peace and still be ambitious?
4. I know exactly what I should do, and I still don't do it. What's going on?
5. Why does every human being want respect?
6. The same fight keeps repeating at home. What is it actually about?
7. How much money would actually be enough for me?
8. I did most things "right" and still feel empty. Where do I even start?
9. I get angry with my child and then feel terrible. How do I break the loop?
10. Is lasting contentment actually possible, or do people just get moments of it?

### default (HI)

1. जो चाहा था वो मिल भी जाए, तो अच्छा क्यों नहीं लगता ज़्यादा दिन?
2. पिताजी और मैं एक-दूसरे की परवाह करते हैं, फिर भी खुलकर बात नहीं हो पाती। बीच में क्या है?
3. क्या गहरे में शांत रहते हुए भी बड़े सपने रखे जा सकते हैं?
4. मुझे साफ़ पता है क्या करना चाहिए, फिर भी हो नहीं पाता। ये क्या है?
5. हर इंसान सम्मान क्यों चाहता है?
6. घर में वही झगड़ा बार-बार होता है। असल बात क्या है?
7. मेरे लिए कितना पैसा सचमुच काफ़ी होगा?
8. सब कुछ "सही" किया, फिर भी भीतर खाली लगता है। शुरू कहाँ से करूँ?
9. बच्चे पर गुस्सा आता है, फिर बहुत बुरा लगता है। यह चक्र कैसे टूटे?
10. क्या स्थायी तृप्ति जैसी कोई चीज़ होती है, या बस कुछ पल मिलते हैं?

### relationships (EN)

1. The same fight keeps repeating at home. What is it actually about?
2. My sibling and I have become strangers with a shared history. Where do I begin?
3. The love in my marriage has gone quiet. Is something wrong, or is this what years do?
4. How much should I adjust for my parents when I disagree with how they see things?
5. Someone I love keeps disappointing me. How much is fair to expect?
6. I feel lonely even around people. Why?
7. How do I repair things with someone I've quietly drifted from?
8. Do I trust people for who they are, or for what they do for me?
9. I gave a lot to someone and got little back. How do I stop keeping score?
10. My in-laws and I see life completely differently. How do we live under one roof?
11. A friendship that mattered ended without a real ending. How do I settle it inside?
12. How do I stay kind to someone who has hurt me, without pretending it didn't happen?

### relationships (HI) — रिश्ते

1. घर में वही झगड़ा बार-बार होता है। असल बात क्या है?
2. भाई-बहन से रिश्ता अब बस औपचारिक रह गया है, जबकि बचपन साथ बीता। शुरुआत कहाँ से करूँ?
3. शादी में प्रेम चुप-सा हो गया है। कुछ गड़बड़ है, या सालों के साथ ऐसा ही होता है?
4. माता-पिता से सोच नहीं मिलती। कितना झुकना ठीक है?
5. जिनसे प्रेम है वही बार-बार निराश करते हैं। कितनी अपेक्षा रखना ठीक है?
6. लोगों के बीच रहकर भी अकेलापन क्यों लगता है?
7. जिससे धीरे-धीरे दूरी बन गई, उससे रिश्ता फिर से कैसे जोड़ूँ?
8. लोगों पर मेरा भरोसा किस पर टिका है — वे जो हैं उस पर, या जो वे मेरे लिए करते हैं उस पर?
9. मैंने बहुत दिया और बदले में कम मिला। यह हिसाब-किताब मन से कैसे हटे?
10. ससुराल वालों की और मेरी सोच बिल्कुल अलग है। एक घर में कैसे निभे?
11. एक गहरी दोस्ती बिना किसी अंत के ख़त्म हो गई। मन में इसे कैसे समेटूँ?
12. जिसने चोट पहुँचाई है, उसके साथ बिना दिखावे के अच्छा कैसे रहूँ?

### parenting (EN)

1. My child barely talks to me anymore. What changed between us?
2. How do I discipline my child without using fear?
3. My child lies to me sometimes. What should I actually address — the lie, or the reason for it?
4. I keep comparing my child to others, and I hate that I do. How do I stop?
5. Screens are winning at home. Is the fight really about phones, or something else?
6. I want my child to have values I don't fully live myself. Is that hypocrisy, or just parenting?
7. How much of my child's future is my responsibility, and how much is theirs?
8. My child asked me about death, and I had no answer. How do I answer honestly?
9. What does my child actually need from me at this age — beyond marks and manners?
10. I get angry with my child and then feel terrible. How do I break the loop?
11. How do I raise a confident child without raising an entitled one?

### parenting (HI) — परवरिश

1. बच्चा अब मुझसे खुलकर बात नहीं करता। हमारे बीच क्या बदल गया?
2. बिना डर का सहारा लिए बच्चे को अनुशासन कैसे सिखाऊँ?
3. बच्चा कभी-कभी झूठ बोलता है। असल में किस पर ध्यान दूँ — झूठ पर, या उसकी वजह पर?
4. मन ही मन अपने बच्चे की तुलना दूसरों से होती रहती है, और यह मुझे ही अच्छा नहीं लगता। यह कैसे रुके?
5. घर में मोबाइल जीत रहा है। लड़ाई सच में फ़ोन की है, या किसी और चीज़ की?
6. बच्चे को वे मूल्य देने हैं जो ख़ुद मुझमें पूरे नहीं उतरे। यह दिखावा है या परवरिश?
7. बच्चे के भविष्य की कितनी ज़िम्मेदारी मेरी है, और कितनी उसकी?
8. बच्चे ने मौत के बारे में पूछा और मेरे पास जवाब नहीं था। सच्चाई से कैसे बताऊँ?
9. इस उम्र में बच्चे को मुझसे असल में क्या चाहिए — नंबरों और तमीज़ के आगे?
10. बच्चे पर गुस्सा आता है, फिर बहुत बुरा लगता है। यह चक्र कैसे टूटे?
11. बच्चे में आत्मविश्वास आए, पर अकड़ नहीं — यह कैसे हो?

### decisions (EN)

1. How do I tell the difference between fear and genuine caution?
2. Everyone I ask gives different advice. How do I know whose to trust, including my own?
3. How do I decide something big when I can't know how it will turn out?
4. I have two good options and can't take a step. How do I choose without regret?
5. My mind keeps changing on this. What is that telling me?
6. How do I say no without carrying guilt for days?
7. Half my life runs on "what will people say." How do I decide from somewhere else?
8. I made a choice years ago and still wonder about the other road. How do I make peace with it?
9. When should I persist and when should I let go? How do I tell which one this is?

### decisions (HI) — निर्णय

1. डर और सच्ची सावधानी में फ़र्क कैसे पहचानूँ?
2. सब अलग-अलग सलाह देते हैं। किसकी मानूँ — और अपनी बात पर कब भरोसा करूँ?
3. जिसका नतीजा पता ही नहीं चल सकता, वो बड़ा फ़ैसला कैसे लूँ?
4. दो अच्छे रास्ते सामने हैं और क़दम नहीं उठ रहा। बिना पछतावे के कैसे चुनूँ?
5. मेरा मन इस पर बार-बार बदल जाता है। यह क्या बताता है?
6. "ना" कैसे कहूँ कि दिनों तक अपराध-बोध न रहे?
7. आधी ज़िंदगी "लोग क्या कहेंगे" पर चलती है। फ़ैसले कहीं और से कैसे लूँ?
8. सालों पहले एक राह चुनी थी, दूसरी राह अब भी याद आती है। इससे सुलह कैसे करूँ?
9. कब डटे रहना समझदारी है और कब छोड़ देना? यह कैसे पहचानूँ?

### mind (EN)

1. I know exactly what I should do, and I still don't do it. What's going on?
2. Why does one small comment ruin my whole day?
3. I compare myself to others even when I'm doing fine. Why?
4. How do I stop replaying a conversation in my head?
5. Why do I reach for my phone the moment I'm free?
6. My anger comes fast and I regret it later. Where does it actually start?
7. I'm always slightly worried, even when nothing is wrong. What is that?
8. Why is it so hard for me to simply rest?
9. Jealousy embarrasses me, but it shows up anyway. What is it really about?
10. Some nights my mind just won't stop. What does it want?

### mind (HI) — मन

1. मुझे साफ़ पता है क्या करना चाहिए, फिर भी हो नहीं पाता। ये क्या है?
2. किसी की एक छोटी-सी बात पूरा दिन क्यों बिगाड़ देती है?
3. सब ठीक चल रहा हो तब भी दूसरों से तुलना मन में चलती रहती है। क्यों?
4. कोई बातचीत मन में बार-बार चलती रहती है — इसे कैसे रोकूँ?
5. ज़रा-सा खाली हुआ नहीं कि हाथ फ़ोन पर चला जाता है। ऐसा क्यों?
6. गुस्सा झट से आ जाता है और बाद में पछतावा होता है। यह शुरू कहाँ से होता है?
7. कुछ भी ग़लत न हो तब भी हल्की-सी चिंता लगी रहती है। यह क्या है?
8. सचमुच का आराम करना इतना कठिन क्यों है?
9. ईर्ष्या पर शर्म आती है, फिर भी वह आ ही जाती है। असल में यह किस बारे में है?
10. कुछ रातों को मन रुकता ही नहीं। वह चाहता क्या है?

### work (EN) — Work & money

1. How much money would actually be _enough_ for me?
2. I'm successful and unfulfilled. What am I missing?
3. My work feels pointless some days. Is the problem the work, or me?
4. How do I care about my work without it becoming my whole identity?
5. When is quitting wisdom, and when is it avoidance?
6. I earn well and still feel insecure about money. Why doesn't it settle?
7. Everyone around me is racing. Do I have to?
8. What would make my work feel meaningful, and not just successful?
9. I want to earn honestly in a world that doesn't always reward it. How do I hold that?

### work (HI) — काम और पैसा

1. मेरे लिए कितना पैसा सचमुच _काफ़ी_ होगा?
2. मैं सफल हूँ, पर तृप्त नहीं। क्या छूट रहा है?
3. कभी-कभी काम बेमतलब लगता है। दिक्कत काम में है या मुझमें?
4. काम की परवाह करूँ, पर वही मेरी पूरी पहचान न बन जाए — यह कैसे हो?
5. छोड़ देना कब समझदारी है, और कब बचकर निकलना?
6. कमाई अच्छी है, फिर भी पैसे को लेकर असुरक्षा बनी रहती है। यह शांत क्यों नहीं होती?
7. आस-पास सब दौड़ रहे हैं। क्या मुझे भी दौड़ना ज़रूरी है?
8. काम सिर्फ़ सफल नहीं, सार्थक कब लगेगा?
9. ईमानदारी से कमाने की ठानी है, पर दुनिया हमेशा इसका साथ नहीं देती। इसे कैसे निभाऊँ?

### change-loss (EN) — Change & loss

1. A chapter of my life is ending and I don't feel ready. How do I meet it?
2. My children need me less and less now. What are my days for next?
3. I'm not young anymore, and it's starting to show. How do I age without fear?
4. My parents are getting old. How do I prepare — practically, and inside?
5. How do I keep living normally while carrying a loss?
6. Is it okay that I still feel this, a long time later?
7. How do I be with someone who is grieving?
8. I lost something that can't come back — a person, a time, a version of me. How do I go on?
9. Why do I feel guilty for being happy again?
10. A regret from years ago still visits me. What does it want from me?
11. Someone close to me is seriously ill. How do I be with them — and with myself?
12. I'm afraid of death, and my only strategy is not thinking about it. Is there another way?

### change-loss (HI) — बदलाव

1. ज़िंदगी का एक अध्याय ख़त्म हो रहा है और मन तैयार नहीं। इसका सामना कैसे करूँ?
2. बच्चों को अब मेरी उतनी ज़रूरत नहीं रही। अब मेरे दिन किसके लिए हों?
3. उम्र अब दिखने लगी है। ढलती उम्र से बिना डरे कैसे मिलूँ?
4. माता-पिता बूढ़े हो रहे हैं। बाहर की और भीतर की — दोनों तैयारी कैसे करूँ?
5. एक खोने का बोझ लिए हुए रोज़ का जीवन कैसे चलाऊँ?
6. इतना समय बीत जाने पर भी यह अब तक महसूस होता है — क्या यह ठीक है?
7. जो शोक में है, उसके पास कैसे बैठूँ?
8. जो लौट नहीं सकता — कोई इंसान, कोई समय, अपना ही पुराना रूप — उसे खोकर आगे कैसे बढ़ूँ?
9. फिर से ख़ुश होने पर अपराध-बोध क्यों होता है?
10. सालों पुराना एक पछतावा अब भी लौट-लौट कर आता है। वह मुझसे क्या चाहता है?
11. कोई अपना गंभीर रूप से बीमार है। उसके साथ — और अपने साथ — कैसे रहूँ?
12. मौत से डर लगता है, और बचाव बस यही है कि उसके बारे में सोचूँ ही नहीं। कोई और रास्ता है?

### big-questions (EN)

1. Why does every human being, everywhere, want respect?
2. What's the difference between knowing _about_ something and actually understanding it?
3. Is human nature basically good? It doesn't always look like it.
4. Is lasting contentment actually possible, or do people just get moments of it?
5. Does everyone ultimately want the same thing, underneath everything?
6. When we say "my body," who is the "me" that's saying it?
7. Can a person truly change, or do we just learn to manage ourselves?
8. Even people who lie want to be trusted. Why?
9. Is there a way to know what's right, or is it all opinion in the end?
10. What is a human being _for_? Not me specifically — any of us.
11. Why does nature look so orderly, and human life so messy?

### big-questions (HI) — बड़े सवाल

1. हर इंसान, हर जगह, सम्मान क्यों चाहता है?
2. किसी चीज़ के _बारे में_ जानने और उसे सचमुच समझने में क्या फ़र्क है?
3. क्या इंसान मूल रूप से अच्छा है? देखने में तो हमेशा ऐसा नहीं लगता।
4. क्या स्थायी तृप्ति जैसी कोई चीज़ होती है, या बस कुछ पल मिलते हैं?
5. क्या गहरे में सब इंसान एक ही चीज़ चाहते हैं?
6. जब हम कहते हैं "मेरा शरीर", तो कहने वाला "मैं" कौन है?
7. क्या इंसान सचमुच बदल सकता है, या हम बस ख़ुद को सँभालना सीख लेते हैं?
8. झूठ बोलने वाला भी चाहता है कि उस पर भरोसा किया जाए। ऐसा क्यों?
9. सही-ग़लत जानने का कोई पक्का तरीक़ा है, या अंत में सब राय ही है?
10. इंसान है _किसलिए_? मैं नहीं — कोई भी इंसान।
11. प्रकृति में इतनी व्यवस्था दिखती है और इंसान की ज़िंदगी में इतनी उलझन। ऐसा क्यों?

### adhyayan (HI) — अध्ययन

1. अध्ययन और पढ़ने में क्या फ़र्क है? मुझे कैसे पता चले कि जो हो रहा है वह अध्ययन है?
2. परिभाषाएँ याद हो जाती हैं, पर वस्तु पकड़ में नहीं आती। शब्द से अर्थ तक कैसे पहुँचूँ?
3. मनन कैसे करें? मनन और सामान्य सोच-विचार में क्या अंतर है?
4. आभास तक तो बात तर्क-संगत लगती है। साक्षात्कार की ओर आगे कैसे बढ़े?
5. समझ बढ़ती दिख रही है, पर जीने में नहीं उतर रही। अध्ययन और जीने का सम्बन्ध कैसे बने?
6. मुझमें समाधान की चाहत है या समझ — यह फ़र्क अपने में कैसे जाँचूँ?
7. जीवन और शरीर को अलग-अलग देखना अभी कल्पना जैसा लगता है। इसका अभ्यास क्या हो?
8. सह-अस्तित्व नित्य वर्तमान है — यह बुद्धि में बैठता है, पर हृदयंगम नहीं होता। क्या करूँ?
9. परिवार में न्याय पूर्वक जीने की शुरुआत कहाँ से करूँ?
10. संबंधों में मूल्यांकन का अभ्यास कैसे शुरू होता है?
11. क्या अध्ययन अकेले हो सकता है, या संग-साथ अनिवार्य है?
12. अभी समझ अधूरी है। ऐसे में दूसरों से इस बात को कहूँ या पहले स्वयं में प्रमाणित होने की प्रतीक्षा करूँ?

### adhyayan (EN) — अध्ययन (romanized MD terms in an English frame; for students on the EN UI)

1. What's the difference between adhyayan and reading? How do I know whether what I'm doing is adhyayan at all?
2. I can recite the paribhashas, but the vastu doesn't come into grasp. How do I get from the word to the meaning?
3. How does one actually do manan? How is it different from ordinary thinking?
4. Things feel logically consistent up to aabhas. How does one move toward sakshatkar?
5. My understanding seems to grow, but it isn't showing up in how I live. How do adhyayan and jeena connect?
6. Do I have a chaahat for samadhan, or an understanding of it? How do I check that in myself?
7. Seeing jeevan and sharir as distinct still feels like imagination. What's the practice?
8. "Coexistence is nitya vartaman" — my intellect accepts it, but it hasn't become hridayangam. What now?
9. Where does living with nyaya begin — in my own family?
10. How does the practice of mulyankan in relationships actually start?
11. Can adhyayan happen alone, or is sangat essential?
12. My understanding is incomplete. Should I speak of this to others, or wait until it's pramanit in me?

Optional, only if cheap: for `change-loss`, bias the sample so at least one of the 3
comes from the first four questions (the transition ones). A random 3 from this pool can
still land all-grief; one guaranteed lighter question keeps the mode's door open without
touching the pool. If it complicates the sampler, skip it — pool composition already does
most of the work.

## Tests worth adding

- Sampling returns exactly 3, all distinct, all from the requested mode+language pool.
- Sampling is deterministic given a seed / stable within a session (however stability
  is implemented — snapshot the mechanism, not the RNG).
- Every mode key has a pool of ≥ 8 in both languages (guards future additions).
- Every mode key has a chip label key in i18n (the existing type-level guard should
  already catch this once `MODE_LABEL_KEYS` is updated).
- MD vocabulary appears **only** in the `adhyayan` pool — invert the earlier denylist
  idea: for every other mode, a small denylist (e.g. अध्ययन, जागृति, सहअस्तित्व, समाधान,
  साक्षात्कार, न्याय as standalone terms, plus their romanized forms for EN pools) keeps
  the "plain language at the door" rule honest as pools grow; for the adhyayan pool the
  same test asserts nothing, since MD terms are the point there.

## Implementation notes

- **3a needed no prompt change.** `DHEE_INSTRUCTIONS`' plain-language section was already conditional: "When someone writes to you _in_ these terms, meet them there — they know the words." So an adhyayan starter is answered in the darshan's vocabulary by the existing rule, and the persona fingerprints did not move.
- **Stability mechanism:** `sampleStarters(lang, mode, seed)` is a pure function of a numeric seed (a small seeded PRNG, partial Fisher–Yates). The home screen holds the seed in state: fresh on mount (arriving at the screen), fresh again whenever a chip is _chosen_ (so deselect → reselect redraws), untouched by re-renders, the keyboard, or tab switches. No persistence: a returning visit is meant to draw anew.
- **Change & loss bias** is implemented: a draw with none of the first four questions swaps its last pick for one of them, seeded.
- **Emphasis markers dropped** from the authored text (`*enough*`, `*about*`, `*for*`, `*काफ़ी*`, `*बारे में*`, `*किसलिए*`). A starter is sent as the person's own message and the asterisks would sit in their bubble.
- **Chip labels not given by the spec:** relationships → EN "Relationships" / HI "रिश्ते", decisions → EN "Decisions" / HI "निर्णय", following the noun style of the new labels and the spec's own section headers.
- **Tests** (`src/lib/starters.test.ts`): everything in "Tests worth adding", plus no-markdown and no-duplicates-within-a-pool. The vocabulary denylist is the spec's list, matched as standalone words in both scripts.
