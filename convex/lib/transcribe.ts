// Speech to text through OpenRouter's transcription endpoint, which takes an
// OpenAI-style multipart upload: `file` and `model`, plus optional `language`
// and `prompt`. Pure apart from `fetch`, which is injectable so tests never
// reach the network.

export const TRANSCRIPTION_URL =
  "https://openrouter.ai/api/v1/audio/transcriptions";

/**
 * Words a person studying Madhyasth Darshan is likely to say and a general
 * speech model is likely to mishear. Sent as the `prompt` the endpoint passes
 * to models that take vocabulary hints (Whisper and others); ignored by the
 * rest. Spelled the way the books spell them, so a transcript lands in the
 * same spelling the corpus search uses.
 */
export const DOMAIN_VOCABULARY = [
  "मध्यस्थ दर्शन",
  "सह-अस्तित्व",
  "अस्तित्व",
  "जीवन",
  "व्यवस्था",
  "समाधान",
  "समृद्धि",
  "अभय",
  "जागृति",
  "परिभाषा",
  "भ्रम",
  "मानव चेतना",
  "जीव चेतना",
  "अनुभव",
  "अध्ययन",
  "बाबाजी",
  "नागराज",
  "Madhyasth Darshan",
  "jeevan vidya",
];

export type TranscriptionResult = {
  text: string;
  costUsd?: number;
  inputTokens?: number;
};

export async function transcribeAudio(args: {
  audio: Blob;
  filename: string;
  model: string;
  apiKey: string;
  /** ISO-639-1 hint. Omit to let the model detect it. */
  language?: string;
  prompt?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append("model", args.model);
  form.append("file", args.audio, args.filename);
  if (args.language) form.append("language", args.language);
  if (args.prompt) form.append("prompt", args.prompt);
  const response = await (args.fetchImpl ?? fetch)(TRANSCRIPTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(args.timeoutMs ?? 60_000),
  });
  if (!response.ok) {
    throw new Error(
      `transcription ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  const body = (await response.json()) as {
    text?: unknown;
    usage?: { cost?: unknown; input_tokens?: unknown; prompt_tokens?: unknown };
  };
  if (typeof body.text !== "string") {
    throw new Error("transcription returned no text");
  }
  const num = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const costUsd = num(body.usage?.cost);
  const inputTokens =
    num(body.usage?.input_tokens) ?? num(body.usage?.prompt_tokens);
  return {
    text: body.text.trim(),
    ...(costUsd === undefined ? {} : { costUsd }),
    ...(inputTokens === undefined ? {} : { inputTokens }),
  };
}

/**
 * Character error rate between a reference and a transcript, after folding
 * case, punctuation and whitespace. Characters rather than words because
 * Hindi word boundaries vary (कीजिए / की जिए) where the letters do not.
 */
export function characterErrorRate(reference: string, hypothesis: string) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFC")
      .replace(/[\p{P}\p{S}\s]+/gu, "");
  const a = [...norm(reference)];
  const b = [...norm(hypothesis)];
  if (a.length === 0) return b.length === 0 ? 0 : 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length]! / a.length;
}
