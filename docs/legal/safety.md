# Safety & limitations

<!-- internal:start -->

**Status: drafted from the design, awaiting review.** The structure and most of
the copy come from the `SAFETY` page in `mockup/project/Dhee Web.dc.html`. Two
things changed: the design's privacy paragraph describes a browser-local
prototype and is false about this app, and the design's crisis resources are
labelled "sample resources shown for demonstration" — real ones are used here
instead.

**Crisis resources verified 26 July 2026** against, in each case, the operator's
own site or the responsible ministry:

| Resource     | Checked against                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Tele-MANAS   | DGHS, Ministry of Health & Family Welfare — `dghs.mohfw.gov.in/national-mental-health-programme.php` |
| 988 Lifeline | `988lifeline.org`                                                                                    |
| Samaritans   | `samaritans.org`                                                                                     |
| Directories  | `befrienders.org` and `findahelpline.com`, both loaded and serving helpline finders                  |

**Re-check on a schedule, not when someone reports a wrong number.** A helpline
that has changed its number is worse than no helpline at all. See
[README.md](./README.md).

**7 August 2026 — three sections added** from
[#133](https://github.com/achalagrawal/dhee-app/issues/133), the web counterpart
of the six disclaimers the app now shows (`docs/build/specs/ai-disclaimers.md`).
"Reading the books is the study" names the model and says plainly that it was
not trained on the literature; "It is a trial version" and the new paragraph in
"It is not a private diary" match the in-app copy. That last one depends on the
improvement purpose added to the Privacy Policy on the same date — if that
purpose does not survive review, this paragraph comes out with it.

<!-- internal:end -->

_Last updated 7 August 2026._

---

Dhee is a tool for reflection. It is genuinely useful for thinking out loud —
and it has real limits worth being clear about.

## If you are in crisis

**If you are thinking about harming yourself, or you are in immediate danger,
contact your local emergency number or a crisis line now.** You deserve to talk
to a real person.

Dhee cannot help in an emergency. It cannot call anyone for you, no human is
monitoring your conversation, and nothing you write here reaches someone who can
act on it.

- **India** — Tele-MANAS: **14416** or **1800-89-14416**, free, 24×7, in around
  20 languages.
- **United States** — 988 Suicide & Crisis Lifeline: call or text **988**, free,
  24/7.
- **United Kingdom & Ireland** — Samaritans: **116 123**, free, 24/7.
- **Anywhere** — [Befrienders Worldwide](https://befrienders.org) and
  [Find A Helpline](https://findahelpline.com) both list crisis lines by
  country.

If none of those fit where you are, your local emergency number is the right
call. It always is.

## Dhee is not a professional

It is not a therapist, counsellor, doctor, lawyer, or financial adviser, and it
cannot diagnose or treat anything. For decisions with serious consequences,
treat it as a starting point for your own thinking — not a substitute for
qualified help.

## It can be wrong, or one-sided

Dhee generates its replies with a language model. It can miss context, misread
tone, state something confidently and be wrong, or reflect the blind spots of
what it was trained on. Weigh what it says. Disagree with it freely. You know
your life and it does not.

## Reading the books is the study — this is not

This is the limit that matters most, and it is the easiest one to forget,
because Dhee is fluent.

Dhee runs on a general-purpose language model — Claude Sonnet 5 at the time of
writing. **The model was not trained on Madhyasth Darshan.** The literature is
searched while it answers you and put in front of it, and what comes back is the
model reading those passages, in its own habits of thought. A different model, or
a later version of this one, would read the same passages somewhere slightly
else. So what Dhee gives you is _an_ interpretation, mixed, and never the śāstra
itself.

Which means the obvious thing: prompting Dhee and reading its answers is not
śāstrābhyās. It can point you at a page, hold a question open, put a definition
in front of you — and none of that is the study. **Aadmi aadmi se hi samjhega.**
Understanding takes place in the human being, in the reading and in conversation
with people who have done the reading. A tool cannot do that part, and this one
is at its best when it hands you back to the book and to the people.

## It is a trial version

Dhee is being tested. It will change, sometimes substantially, and it changes on
the strength of what people report — the thumbs under each reply are the fastest
route, and **privacy@dhee.app** is the slower, fuller one.

## It is not a private diary

Your conversations are stored on our servers, not only on your device — that is
what lets Dhee remember you between sessions. They are not protected health
information and they are not a confidential professional relationship. What you
write here does not have the legal protection a conversation with a doctor or a
lawyer would.

**We also read them.** Questions and replies are looked at by us to judge how
well Dhee is answering and to improve it. That is not a reason to stop using
Dhee for what it is for — it is a reason to leave out the specifics: names,
contact details, health and financial particulars, and anything about another
person they have not agreed to. An incognito conversation is never stored at
all, so there is nothing there to read.

What that means in practice, what is stored, who it is sent to, and how to
delete it are all in the [Privacy Policy](./privacy.md).

## It won't pretend to be human

Dhee is a tool. The relationships and the people in your life are the real
thing, and Dhee is at its best when it points you back toward them — not when
it stands in for them.

## Telling us something is wrong

If Dhee said something harmful, or handled a hard moment badly, we want to know:
**privacy@dhee.app**. It helps more than you would think.
