// Recognizing the corpus lens. Here rather than in agents/dhee.ts because the
// settings screen needs the same rule to explain the same cap, and importing
// the agent module into the app would drag the whole model stack with it.

// A list of spellings rather than one string, because `traditions` is free text:
// the picker offers "Madhyasth Darshan" but people type what they type. A miss
// fails safe — they get the framing lens and no study mode, which is the
// behaviour everyone had before this existed.
export const CORPUS_LENS_ALIASES = [
  "madhyasth darshan",
  "madhyastha darshan",
  "madhyasth-darshan",
  "मध्यस्थ दर्शन",
  "jeevan vidya",
  "जीवन विद्या",
] as const;

/** Whether one entry names the corpus, under any of its spellings. */
export function isCorpusLensName(tradition: string): boolean {
  const name = tradition.trim().toLowerCase();
  return CORPUS_LENS_ALIASES.some((alias) => alias === name);
}

export function isCorpusLens(traditions: string[] | undefined): boolean {
  return (traditions ?? []).some(isCorpusLensName);
}
