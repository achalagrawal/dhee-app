// Central knobs for the Dhee agent. Swap models here as they evolve.
//
// CHAT_MODEL is an OpenRouter slug (provider/model). Routing through
// OpenRouter means switching providers — including to open-weight models
// later — is a one-line change here, with no application code touched.
// Browse slugs at https://openrouter.ai/models.
//
// Keep this file free of secrets — those live in Convex env vars.

export const CHAT_MODEL = "anthropic/claude-sonnet-5";

// Background work that nobody reads as a reply — conversation titles and
// memory extraction. Roughly a third of the chat model's price.
//
// Extraction ran on CHAT_MODEL until 2026-07-27, gated on an eval that plants
// excluded material and proves the cheaper model still refuses it, because its
// prompt carries EXTRACTION_EXCLUSIONS — "not advisory — it is the reason this
// feature is safe to ship". That eval is `pnpm eval --suite extraction`, in
// convex/evals/extraction.ts. Two samples of each planted category: Haiku 4.5
// recorded no diagnosis, no drug name, no orientation term and no rupee
// figure — the same clean result Sonnet 5 gives — while recording slightly
// more rows, so it is not buying safety by extracting nothing. $0.027 against
// $0.063, at half the latency. Known difference: on the finances plant Haiku
// leaves the word "debt" in where Sonnet abstracts past it. The exclusion bars
// financial *specifics*, so that is within the rule.
//
// The move was made when extraction frequency went up (see below): the same
// eval, plus the cost of extracting several times more often, is what decided
// it. Re-run the eval before changing EXTRACTION_EXCLUSIONS again.
export const BACKGROUND_MODEL = "anthropic/claude-haiku-4-5";

// Extraction fires on two independent triggers, because either one alone
// loses conversations.
//
// The counter catches long conversations while they are still going. The idle
// flush catches everything the counter would strand: at an interval of N, the
// last (turns mod N) turns of every thread were never extracted at all, so a
// conversation shorter than N left no trace no matter how much it revealed.
// Short exchanges are often the most revealing ones, which made that the
// single biggest limit on what Dhee remembers.
export const MEMORY_EXTRACTION_INTERVAL_TURNS = 2;

// How long a thread must be quiet before the idle flush extracts it. Long
// enough that someone thinking mid-conversation doesn't trigger a run, short
// enough that closing the app and coming back tomorrow finds Dhee already
// caught up. Each new turn cancels the pending flush and schedules a fresh
// one, so an active conversation only ever has one queued.
export const MEMORY_EXTRACTION_IDLE_MS = 3 * 60 * 1000;

// Messages a free account can send per UTC day. The design's demo number;
// confirm the real one before launch.
export const FREE_DAILY_MESSAGE_LIMIT = 15;

// Where to reach the MD corpus MCP server. Override with the MD_MCP_URL
// Convex env var if this endpoint moves.
export const DEFAULT_MD_MCP_URL = "https://md-mcp.achal.xyz/mcp";
