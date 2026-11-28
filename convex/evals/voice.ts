import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import {
  DOMAIN_VOCABULARY,
  characterErrorRate,
  transcribeAudio,
} from "../lib/transcribe";

// Picks the speech-to-text model for voice input. Speaks a handful of
// questions shaped like the ones people ask Dhee — Hindi, Hindi with English
// words in it, English, Gujarati, Telugu — through a text-to-speech model,
// then transcribes each clip with every candidate and scores it against the
// text it was spoken from.
//
//   npx convex run evals/voice:compare '{}'
//
// Synthetic speech is cleaner than a phone held at arm's length, so this
// ranks models and catches ones that cannot do a language at all; it does
// not stand in for listening to real voices. No real person's audio or words
// are used.

export const CLIPS = [
  {
    id: "hi-study",
    language: "hi",
    text: "मध्यस्थ दर्शन में सह-अस्तित्व का क्या अर्थ है, और यह हमारे रोज़ के जीवन में कैसे दिखता है?",
  },
  {
    id: "hi-personal",
    language: "hi",
    text: "मेरे बेटे से हर दिन बहस हो जाती है। संबंध में विश्वास कैसे बनाऊँ?",
  },
  {
    id: "hi-mixed",
    language: "hi",
    text: "मुझे job बदलनी है लेकिन family का pressure है, मैं decision कैसे लूँ?",
  },
  {
    id: "en-study",
    language: "en",
    text: "What does Madhyasth Darshan say about the difference between understanding and belief?",
  },
  {
    id: "gu-study",
    language: "gu",
    text: "મધ્યસ્થ દર્શન પ્રમાણે સુખ અને સમાધાન વચ્ચે શું સંબંધ છે?",
  },
  {
    id: "te-study",
    language: "te",
    text: "మధ్యస్థ దర్శనం ప్రకారం మనిషి జీవితంలో సమాధానం ఎలా వస్తుంది?",
  },
] as const;

export const CANDIDATES = [
  "openai/whisper-large-v3",
  "openai/whisper-large-v3-turbo",
  "nvidia/nemotron-3.5-transcribe",
  "elevenlabs/scribe-v2",
  "microsoft/mai-transcribe-2",
  "mistralai/voxtral-mini-transcribe-3-0",
  "openai/gpt-4o-mini-transcribe",
];

async function speak(
  text: string,
  apiKey: string,
  model: string,
  voice: string,
) {
  const response = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(
      `speech ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
  return new Blob([await response.arrayBuffer()], { type: "audio/mpeg" });
}

export const compare = internalAction({
  args: {
    models: v.optional(v.array(v.string())),
    ttsModel: v.optional(v.string()),
    voice: v.optional(v.string()),
    withVocabulary: v.optional(v.boolean()),
  },
  returns: v.any(),
  handler: async (_ctx, { models, ttsModel, voice, withVocabulary }) => {
    const apiKey = process.env.OPENROUTER_API_KEY ?? "";
    const tts = ttsModel ?? "elevenlabs/eleven-v3";
    const audio = await Promise.all(
      CLIPS.map(async (clip) => {
        try {
          return {
            clip,
            blob: await speak(clip.text, apiKey, tts, voice ?? "sarah"),
          };
        } catch (error) {
          return { clip, error: String(error) };
        }
      }),
    );
    const rows: unknown[] = [];
    for (const model of models ?? CANDIDATES) {
      const results = await Promise.all(
        audio.map(async (a) => {
          if (!("blob" in a) || !a.blob) {
            return { clip: a.clip.id, error: `no audio: ${a.error}` };
          }
          const started = Date.now();
          try {
            const out = await transcribeAudio({
              audio: a.blob,
              filename: `${a.clip.id}.mp3`,
              model,
              apiKey,
              ...(withVocabulary
                ? { prompt: DOMAIN_VOCABULARY.join(", ") }
                : {}),
            });
            return {
              clip: a.clip.id,
              cer: Math.round(characterErrorRate(a.clip.text, out.text) * 100),
              ms: Date.now() - started,
              cost: out.costUsd,
              text: out.text,
            };
          } catch (error) {
            return { clip: a.clip.id, error: String(error).slice(0, 200) };
          }
        }),
      );
      rows.push({ model, results });
    }
    return {
      tts,
      clipBytes: audio.map((a) => ("blob" in a && a.blob ? a.blob.size : 0)),
      rows,
    };
  },
});
