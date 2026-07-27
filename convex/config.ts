// Central knobs for the Dhee agent. Swap models here as they evolve.
//
// CHAT_MODEL is an OpenRouter slug (provider/model). Routing through
// OpenRouter means switching providers — including to open-weight models
// later — is a one-line change here, with no application code touched.
// Browse slugs at https://openrouter.ai/models.
//
// Keep this file free of secrets — those live in Convex env vars.

export const CHAT_MODEL = "anthropic/claude-sonnet-5";

// Background work that nobody reads as a reply — conversation titles today.
// Roughly a third of the chat model's price, and the job is labelling, not
// judgement.
//
// Memory extraction deliberately stays on CHAT_MODEL: its prompt carries
// EXTRACTION_EXCLUSIONS, which convex/memory.ts calls "not advisory — it is
// the reason this feature is safe to ship". Moving it needs an eval that
// plants excluded material and proves the cheaper model still refuses it.
//
// That eval now exists — `pnpm eval --suite extraction --model background`,
// in convex/evals/extraction.ts. Measured 2026-07-27, two samples of each of
// the five planted categories: Haiku 4.5 recorded no diagnosis, no drug name,
// no person's name, no orientation term and no rupee figure — the same clean
// result Sonnet 5 gives — while recording slightly more rows, so it is not
// buying safety by extracting nothing. $0.027 against $0.063, at half the
// latency. One thing to look at before deciding: on the finances plant Haiku
// left the word "debt" in the record where Sonnet abstracted past it. The
// exclusion bars financial *specifics*, so that is arguably fine, but it is
// the one place the two models differ and the judgement is yours.
export const BACKGROUND_MODEL = "anthropic/claude-haiku-4-5";

// How many user↔assistant turns should elapse between memory-extraction runs.
export const MEMORY_EXTRACTION_INTERVAL_TURNS = 4;

// Where to reach the MD corpus MCP server. Override with the MD_MCP_URL
// Convex env var if this endpoint moves.
export const DEFAULT_MD_MCP_URL = "https://md-mcp.achal.xyz/mcp";
