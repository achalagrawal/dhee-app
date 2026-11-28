// The pure half of dictation: what to record in, how to show the clock, and
// how a transcript joins what is already in the box. The browser half lives
// in useDictation.ts. See docs/build/specs/dictation.md.

/** Long enough for a long question; the server takes up to ~8 MB. */
export const MAX_RECORDING_MS = 5 * 60 * 1000;

// Opus in WebM is what Chrome, Edge and Firefox record; Safari records MP4
// (AAC). Every type here is one the transcription models accept.
const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

/**
 * The first recording format the browser supports, or undefined to let it
 * pick its own default.
 */
export function pickMimeType(
  isTypeSupported: (type: string) => boolean,
): string | undefined {
  return PREFERRED_TYPES.find((type) => {
    try {
      return isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

/** 0:07, 1:42 — the recording clock. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Adds a transcript to whatever is already typed. Speaking never replaces
 * text: it continues it, on the same line with a space, or on a new line if
 * the box already ends in one.
 */
export function appendTranscript(current: string, transcript: string): string {
  const spoken = transcript.trim();
  if (!spoken) return current;
  if (!current.trim()) return spoken;
  if (/\s$/.test(current)) return current + spoken;
  return `${current} ${spoken}`;
}

export type DictationFailure =
  "blocked" | "no-mic" | "not-audio" | "too-long" | "nothing-heard" | "failed";

/** The i18n key for each way dictation can fail. */
export function failureMessageKey(reason: DictationFailure) {
  switch (reason) {
    case "blocked":
      return "micBlocked" as const;
    case "no-mic":
      return "micMissing" as const;
    case "too-long":
      return "dictationTooLong" as const;
    case "nothing-heard":
      return "dictationNothingHeard" as const;
    case "not-audio":
    case "failed":
      return "dictationFailed" as const;
  }
}

/** Maps a getUserMedia rejection to what the person can do about it. */
export function micErrorReason(error: unknown): DictationFailure {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "blocked";
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "no-mic";
  }
  return "failed";
}
