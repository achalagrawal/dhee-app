# Privacy Policy

<!-- internal:start -->

**Status: complete draft, awaiting legal review.** Written by engineering from
what the code actually does. Every value is filled in and the text is ready to
publish as written — but it has not been reviewed by a lawyer, and it should
not go live until it has. See [README.md](./README.md) for the traceability map
back to the repo and the work that still has to happen outside these documents.

<!-- internal:end -->

_Last updated 26 July 2026._

---

## The short version

Dhee is for private reflection, and it is built to hold your trust. We collect
as little as we can, and we do not sell your data.

Two things are worth knowing before you read further, because they surprise
people:

1. **Your conversations live on our servers**, not only on your device. That is
   what lets Dhee remember you between sessions and across devices.
2. **Dhee draws conclusions about you** from what you write — what you seem to
   value, what you are hoping for, what you keep returning to — and keeps them.
   Every one of those conclusions is visible to you, and you can edit or delete
   any of them.

## Who we are

Dhee is run by **Achal Agrawal**, an individual in India — not a company. "We"
throughout this policy means him. For anything here, including a complaint,
write to **privacy@dhee.app**.

Under India's Digital Personal Data Protection Act, 2023, he is the **Data
Fiduciary** for the personal data described here, and you are the **Data
Principal**. He is also the Grievance Officer; the details are at the end of
this policy.

## What we collect

**Your account.** Your email address, and — if you sign in with Google — the
name, email address, and profile photo Google gives us. We copy the photo into
our own storage so it keeps working after Google's link expires.

**Your profile.** The name you want Dhee to call you, your preferred language,
and a profile photo if you upload one.

**Your conversations.** Every message you send and every reply Dhee gives, held
on our servers until you delete them. Also a short title and one-sentence
summary of each conversation, generated automatically so your history is
navigable, and which conversations you have starred or pinned.

**What Dhee understands about you.** See [What Dhee infers](#what-dhee-infers-about-you)
below — this is its own category, and the most important one to understand.

**Your feedback.** If you rate a reply with a thumbs up or down, we store that
rating against the message.

We do not run analytics or advertising trackers in the app. We do not collect
your contacts, your location, or your browsing outside Dhee.

## Where your data goes

Dhee is not a closed box. Answering you means sending your words to other
services. Here is all of it:

| What                                                                                         | Goes to                                                                                                | Why                                                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Your messages, conversation history, profile, and everything Dhee has learned about you      | **Convex** — our application database and file storage                                                 | Storing and serving the app                                          |
| The text of your messages, and the plain-language summary of what Dhee understands about you | **OpenRouter**, which routes it to the model that writes Dhee's replies (currently Anthropic's Claude) | Generating each reply                                                |
| A short search query derived from what you asked                                             | The **corpus service at `md-mcp.achal.xyz`**                                                           | Looking up perspective from the source texts Dhee is grounded in     |
| Recent messages from a conversation                                                          | The same model provider, in a separate background request                                              | Working out what to remember about you, and titling the conversation |
| Your email address, and a six-digit code                                                     | **Amazon SES**                                                                                         | Sending your sign-in code                                            |
| Your Google account details, if you use Google sign-in                                       | **Google**                                                                                             | Signing you in                                                       |
| The web app itself                                                                           | **Vercel**                                                                                             | Hosting the website and app bundle                                   |

We do not attach your name, email address, or account identifier to the
requests we send to the model provider or to the corpus service. What those
requests do contain is the text you wrote — so if you type your own name or
someone else's into a message, it goes with it.

Dhee is built and run from India, and most of these services operate outside
India too, so your data crosses borders to reach them. Indian law permits this
except to countries the government has restricted. If you are in the EEA or the
UK, see [If you are in Europe or the UK](#if-you-are-in-europe-or-the-uk).

## Why we are allowed to do each of these things

Everything above is done for one of three reasons, and it is worth being
precise about which:

**To give you what you asked for.** Holding your account, storing your
conversations, sending your words to a model so a reply comes back, looking
things up in the corpus, and keeping the picture of you that makes Dhee more
than a stateless chatbot. This is the service itself: without it there is no
product to use. In European terms, performance of our contract with you.

**Because you chose to tell us.** People bring Dhee grief, distress, faith,
relationships, and doubt. In European law some of that is "special category"
data, and the only sound basis for handling it is your explicit consent. You
give that when you sign up, having been told plainly what Dhee does with what
you write; you can withdraw it at any time by deleting the material, clearing
what Dhee remembers, or closing your account. Withdrawing does not undo what
was already done, and it means Dhee can no longer be the thing it is meant to
be for you.

**To keep the service standing up.** Rate limits, abuse prevention, security,
and diagnosing failures. A legitimate interest, and a narrow one: it never
extends to reading conversations for curiosity, marketing, or profiling you for
anyone else's benefit.

We do not sell your data, we do not share it for advertising, and we make no
automated decision about you that has a legal or similarly significant effect.
Dhee does build a picture of you — that is the point of it — and you can read
and delete every part of that picture.

## Sending your words to a model

Dhee cannot answer you without showing your message to a language model. There
is no version of this product where that does not happen.

What we send to a provider we send in order to get one reply back. Those
requests are then handled under that provider's own terms, which you can read
for yourself: they are the same terms any developer using them gets, and we
have no private arrangement that widens them.

If we ever use what you write for anything beyond answering you — including to
train or tune a model — that is a new purpose, not a quiet extension of this
one. We will say so in this policy and tell you in the app before it starts,
as set out in [Changes to this policy](#changes-to-this-policy).

## If you are in Europe or the UK

Anyone can use Dhee, from anywhere, which means the GDPR and the UK GDPR apply
to people using it from those places even though we are in India. This section
is for you.

**Who is responsible.** Achal Agrawal, in India, is the controller. There is no
data protection officer: this is one person, and that person is the one you will
reach at privacy@dhee.app.

**Why we process, and on what basis.** As set out just above: contract for the
service itself, your explicit consent for the sensitive things you choose to
write, and a narrow legitimate interest in keeping the service secure and
standing up. Giving us your email address is necessary to hold an account —
without it there is nowhere to send your sign-in code and no account to sign in
to. Everything else you give us is optional.

**Where your data goes.** To India, where Dhee is run, and to the providers
listed above, which operate in several countries. India has no European
adequacy decision, so these transfers rest on the safeguards available under
Chapter V of the GDPR and its UK equivalent. Write to us if you want to know
what applies to a specific provider.

**How long we keep it.** Until you delete it or close your account — see
[How long we keep things](#how-long-we-keep-things).

**Your rights.** Access, rectification, erasure, restriction of processing,
portability, objection to processing based on legitimate interests, and
withdrawal of consent at any time. Much of this you can do yourself in the app,
immediately and without asking us; for the rest, write to us. We will not charge
you for it and we will not make it difficult.

**Complaining.** If we get it wrong, tell us first — but you have the right to
complain to your national data protection authority in the EEA, or to the
Information Commissioner's Office in the UK, without going through us at all.

**Children.** Dhee is 18+, which is stricter than either regime requires.

## Looking things up in the source texts

Dhee's answers are grounded in a corpus of philosophical texts, held on a
separate service. When your question touches on meaning, relationships,
purpose, suffering, values, or a decision — which is most of the time — Dhee
sends a short search query to that service, phrased in plain language from what
you asked. That query can carry the substance of your situation, even though it
does not carry your identity.

This happens in incognito conversations too.

## What Dhee infers about you

This deserves its own section, because it is a stronger claim than "we store
your messages."

Every few turns, Dhee reads back over a recent stretch of the conversation and
writes down what seems durably true about you: the questions you are living
with, what you appear to value, what you are hoping for, patterns in how you
respond, and which ideas have landed with you. These are **inferences** — Dhee's
conclusions about who you are — not just a copy of what you typed. They are
kept, and they quietly shape every later reply.

Two commitments make this something we are willing to build:

**You can see all of it.** Every inference lives in a row you can read on the
"Dhee's understanding of you" screen. Nothing is held about you in a form you
cannot look at. Each row is marked as either something you stated or something
Dhee concluded, so you can tell the difference.

**You can delete any of it.** Edit a row, delete a row, or clear the lot. What
Dhee sees on your next message is rebuilt from those rows each time, so a
deletion takes effect immediately rather than lingering in some accumulated
summary.

We also instruct the model that writes these notes never to record health
conditions or diagnoses, political views, sexual orientation, financial
specifics, the names of employers or organisations you deal with, or contact
details of any kind — and to write nothing at all when in doubt.

It **may** record the first names of people in your personal life — family, a
partner, close friends — so that Dhee can speak about them the way you do. The
categories above stay excluded for those people too: that your brother is
called Arun may be recorded; anything about his health is not.

Those are instructions to a model, not hard filters, which is exactly why the
screen that shows you every row exists. If you find something there that should
not be, delete it, and please tell us.

## Sensitive topics

People bring Dhee tender things: grief, strained relationships, doubt, distress.
We treat that seriousness with care, and we have designed the memory layer to
avoid recording the most sensitive of it.

Be clear about what Dhee is not. **Dhee is not a medical or crisis service.**
Your conversations here are **not protected health information** and **not a
confidential professional relationship** — there is no doctor-patient,
therapist-client, or lawyer-client privilege over anything you write. If you are
in danger, contact your local emergency number or a crisis line.

## Incognito conversations

An incognito conversation is not saved. No thread, no messages, no title, and
nothing added to what Dhee understands about you. Close it and it is gone.

It is still sent to the model to generate a reply, and it still reaches the
corpus service for lookups. Incognito means "not kept by us", not "not sent
anywhere."

## Your choices and your rights

In the app, today, you can:

- read everything Dhee has concluded about you, and edit or delete any of it;
- clear everything Dhee has learned in one action;
- delete a single conversation, or all of them;
- change your name, photo, and language, or clear them;
- sign out.

Deleting conversations and clearing what Dhee remembers are deliberately
separate choices, so you can do one without the other.

Under the Digital Personal Data Protection Act, 2023, you also have the right to
a summary of the personal data we hold and how we process it, the right to
correction and erasure, the right to nominate someone to exercise your rights if
you die or become incapacitated, and the right to complain to us and then to the
Data Protection Board of India. Write to us for anything the app does not
already let you do yourself — including closing your account, which we handle by
request today rather than with a button.

Closing an account is a real deletion, not a flag: the profile and its photo,
every conversation, and every inference are removed along with the account.

## How long we keep things

We keep your conversations and your profile until you delete them or ask us to
close your account; we do not expire them on a timer. Sign-in codes are stored
hashed, expire in fifteen minutes, and stop working after three wrong guesses.
Once you delete a conversation or an inference, it is removed from our database
rather than flagged as hidden. Deleted data may persist for a short while in
routine backups before those age out.

## Keeping it safe

Your session is held in your device's secure storage on mobile, and in browser
storage on the web. Sign-in codes are never stored in readable form. Every
query the app makes is scoped to your account: our backend resolves who you are
on each request and refuses to return another person's conversation.

No service is perfectly secure, and we will not pretend otherwise. If a breach
affects your personal data, we will notify you and the Data Protection Board as
the Act requires.

## Children

Dhee is for adults. You must be **18 or older** to use it. We do not knowingly
collect personal data from children, and we have no way to obtain the verifiable
parental consent Indian law requires for anyone under 18. If you believe a child
has an account, write to us and we will delete it.

## Changes to this policy

We will update this policy as Dhee changes. If a change materially affects how
we handle your data, we will tell you in the app before it takes effect rather
than quietly reposting the page.

## Contact and grievances

Questions, requests, or complaints: **Achal Agrawal**, India —
**privacy@dhee.app**. A postal address is not published here; if you need one
for a formal notice, ask at that address and we will give it to you.

He is also the Grievance Officer for the purposes of the Act. We will
acknowledge your grievance within **three working days** and resolve it within
**thirty days**. If you are not satisfied with our response, you may complain to
the Data Protection Board of India — and if you are in the EEA or the UK, to
your own supervisory authority instead.
