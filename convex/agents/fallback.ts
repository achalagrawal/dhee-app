import type { LanguageModelV3 } from "@ai-sdk/provider";

// A language model that answers with `fallback` when `primary` fails before it
// has produced anything.
//
// The case it is for: Reflective runs on Anthropic's API against a credit that
// can run out, a key that can be revoked, and a provider that can say it is
// overloaded. Each of those fails the request before any output — the
// provider checks the HTTP status before handing back a stream — so this is
// where a reply can still be saved. Someone who chose Reflective gets that
// one reply from the default model instead of an error.
//
// What it does not cover: a stream that fails part-way. By then text has been
// shown and saved; starting again on another model would duplicate it.
//
// Never on abort. Stopping a generation aborts the request on purpose, and
// answering it anyway on another model would undo the stop.
//
// The wrapper keeps the primary's identity (`modelId`, `provider`), because the
// agent reads those to label the call in the usage ledger, and the ledger must
// keep one name for Reflective. The usage handler in config.ts recognises a
// fallback reply from its OpenRouter provider metadata and books it to the
// fallback model.

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  return error instanceof Error && error.name === "AbortError";
}

export function withFallback(
  primary: LanguageModelV3,
  fallback: LanguageModelV3,
  // Read per call. For a fallback that can only answer while a key is set:
  // without it, the primary's own error is the more useful one to surface.
  enabled: () => boolean = () => true,
): LanguageModelV3 {
  const run = async <T>(
    call: (model: LanguageModelV3) => PromiseLike<T>,
    signal: AbortSignal | undefined,
  ): Promise<T> => {
    try {
      return await call(primary);
    } catch (error) {
      if (isAbort(error, signal) || !enabled()) throw error;
      // Loud on purpose: a fallback is a reply someone did not get from the
      // model they chose, and the logs are where a run of them shows up.
      console.error(
        `${primary.modelId} failed; answering with ${fallback.modelId}`,
        error,
      );
      return await call(fallback);
    }
  };

  return {
    specificationVersion: "v3",
    provider: primary.provider,
    modelId: primary.modelId,
    supportedUrls: primary.supportedUrls,
    doGenerate: (options) =>
      run((model) => model.doGenerate(options), options.abortSignal),
    doStream: (options) =>
      run((model) => model.doStream(options), options.abortSignal),
  };
}
