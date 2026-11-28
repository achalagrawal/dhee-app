# Spec: Dictation (mic)

**Epic:** 12 — Voice & dictation (with the composer row in Epic 2)
**Status when written:** ⬜ (the mic button has been hidden since #97)

People asked for it directly: questions to Dhee are long — a situation at
home, a passage they are stuck on — and typing them on a phone, often in
Hindi, is the slowest part of asking. They want to speak the question and
send it, the way dictation works in other assistants.

This ships **dictation**: speak, and the words land in the message box to read
and fix before sending. Spoken replies (voice mode) are a different feature
and stay hidden.

## Mockup reference

- File: `mockup/project/Dhee.dc.html`, composer row around line 337: a 40px
  bordered circle with the mic glyph, between voice mode and Send; it fills
  with the accent and pulses while dictating.
- Deviation: while recording, the row shows **cancel (×), a red dot with the
  clock, and a Done (✓) button** in place of the pulsing mic. The mockup's
  toggle assumes words stream into the box as you speak; ours arrive when you
  stop, so the row has to say "recording" and offer a way out without sending
  the clip.

## Behavioral contract

- Tap the mic → the browser asks for the microphone the first time → the
  clock starts. Tap ✓ to finish, × to throw the clip away.
- On ✓ the clip uploads and the row shows "Writing it down…"; the text then
  **adds to** what is already typed (a space, or straight on after a newline)
  and the box keeps focus. Nothing is sent on its own.
- A clip stops itself at five minutes.
- Failures show one line in the composer, in the app's language, and clear on
  tap: microphone blocked (with how to allow it), no microphone, nothing
  heard, too long, or a general failure. On web `Alert.alert` is a no-op, so
  these can't be alerts.
- The mic shows only where the browser can record (MediaRecorder plus
  getUserMedia) and never while a reply is generating. Native would need
  `expo-audio`; the app ships as web, so that waits.
- Hindi, English, and Hindi with English words in it all work without a
  language setting: the model detects the language per clip.

## Backend contract

- `voice.generateUploadUrl` (mutation, auth) → upload URL.
- `voice.transcribe({storageId})` (action, auth) →
  `{ok: true, text}` | `{ok: false, reason: "not-audio" | "too-long" | "nothing-heard" | "failed"}`.
  - Refuses anything that isn't audio (or WebM) and **leaves it alone**, so a
    photo's storage id can't be used to delete the photo.
  - Over 8 MB → `too-long`.
  - Transcribes with `TRANSCRIBE_MODEL` (ElevenLabs Scribe v2 via OpenRouter),
    falling back to `TRANSCRIBE_FALLBACK_MODEL` (MAI-Transcribe 2), with
    `DOMAIN_VOCABULARY` as the prompt so Madhyasth Darshan terms come out in
    the books' spelling.
  - **Deletes the clip whatever happens.** No audio or transcript is stored;
    the ledger gets a `transcription` row with the model and cost only.
- Schema: `llmUsage.kind` gains `transcription`.
- Model choice: `npx convex run evals/voice:compare '{}'` speaks six
  questions shaped like Dhee's (Hindi, Hindi-English, English, Gujarati,
  Telugu) through TTS and scores each candidate by character error rate.
  Scribe v2 averaged 2% (1% with the vocabulary), MAI-Transcribe 2 8%,
  Whisper v3 29% (it translated the Telugu clip); the rest 26–45%. Scribe
  costs about $0.0003 a clip and answers in about a second. Synthetic speech
  flatters every model, so this ranks them; real voices still need listening.
- Tests (`convex/voice.test.ts`, `convex/lib/transcribe.test.ts`): auth on
  both functions; text returned and clip deleted; cost-only ledger row; the
  fallback; both models failing; empty transcript; non-audio refused and kept;
  oversize refused and deleted; multipart shape; CER.

## UI wiring

- `src/lib/useDictation.ts` (recorder, upload, state), `src/lib/dictation.ts`
  (format choice, clock, joining text, error keys — tested in
  `src/lib/dictation.test.ts`), `src/components/Composer.tsx`.
- Replaces the hidden mic (#97). The settings toggle ("Enable dictation")
  is not built; the button is simply on where it works.

## Not in this slice

- Native recording (`expo-audio`), and words appearing live as you speak
  (needs a streaming transcription API).
- The "Enable dictation" preference in Settings.
- Voice mode: spoken replies with barge-in.

## Verification

- [x] Backend tests green.
- [x] Preview: mic shows in the composer on web; recording row and failure
      line render.
- [x] `FEATURES.md` rows flipped.
