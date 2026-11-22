// Central knobs for the Dhee agent. Swap models here as they evolve.
//
// Model slugs are OpenRouter slugs (provider/model). Routing through OpenRouter
// means switching providers — including to open-weight models later — is a
// one-line change, with no application code touched. Browse slugs at
// https://openrouter.ai/models.
//
// Keep this file free of secrets — those live in Convex env vars.

import { MODEL_SLUGS, DEFAULT_MODEL_TIER } from "./agents/models";

/**
 * The model someone gets without choosing — the default tier.
 *
 * Re-exported from the tier registry rather than written out again, so there is
 * one place a slug lives. This is what `pnpm eval` and `pnpm smoke` measure, so
 * note that both now report on the *default* tier: to check the other one, run
 * against it explicitly rather than assuming the last run covered it.
 */
export const CHAT_MODEL = MODEL_SLUGS[DEFAULT_MODEL_TIER];

// Background work that nobody reads as a reply — conversation titles and
// memory extraction. A twentieth of the chat model's price: Haiku 5.5 is
// $0.10 / $0.50 per million tokens against Sonnet 5's $2 / $10 (and against
// Haiku 4.5's $1 / $5). That rate holds for prompts up to 100K tokens; past
// that it is $0.50 / $2.50, which no title or extraction prompt comes near.
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
// it. Re-run the eval before changing EXTRACTION_EXCLUSIONS again, and before
// changing this model.
//
// Moved from Haiku 4.5 to Haiku 5.5 on 2026-11-22, on the same eval: 14/14
// clean across seven plants at two samples each, including the two added since
// the 4.5 run, with the same row counts and less category residue on the
// finances plant ("money" where 4.5 left "debt, money, earn"), at $0.005
// against $0.027. What changes beyond the price: Haiku 5.5 thinks by
// default (adaptive, effort `medium`) where 4.5 never did, so these calls now
// spend reasoning tokens. Nothing here caps output tokens, so thinking cannot
// crowd out the answer, but the ledger's `reasoningTokens` will no longer be
// empty for these rows. Its tokenizer also counts the same text as about 30%
// more tokens. And it carries Anthropic's safety classifiers with no fallback
// model: a declined extraction throws before the watermark moves, so nothing
// is written and the next trigger tries the same turns again.
export const BACKGROUND_MODEL = "anthropic/claude-haiku-5.5";

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
//
// Raised from three minutes. At three, the flush was firing on nearly every
// conversation rather than on the ones the turn counter had stranded: people
// think for longer than three minutes between messages, so an ordinary pause
// read as "this conversation is over" and paid for an extraction that the very
// next turn made stale. Ten minutes keeps the guarantee the flush exists for —
// a short conversation still leaves a trace, and the counter above is untouched
// so long conversations are still caught while running — while letting a
// thinking pause stay part of the same conversation.
//
// The trade if this goes too high: someone who closes the app mid-thought and
// returns within the window finds Dhee has not yet caught up. Ten minutes is
// chosen against how long people actually pause, so check the ledger's
// `extraction` rows against turn count before moving it again rather than
// guessing in either direction.
export const MEMORY_EXTRACTION_IDLE_MS = 10 * 60 * 1000;

// Where to reach the MD corpus MCP server. Override with the MD_MCP_URL
// Convex env var if this endpoint moves.
export const DEFAULT_MD_MCP_URL = "https://md-mcp.achal.xyz/mcp";
