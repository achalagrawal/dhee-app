// Central knobs for the Dhee agent. Swap models here as they evolve.
//
// CHAT_MODEL is an OpenRouter slug (provider/model). Routing through
// OpenRouter means switching providers — including to open-weight models
// later — is a one-line change here, with no application code touched.
// Browse slugs at https://openrouter.ai/models.
//
// Keep this file free of secrets — those live in Convex env vars.

export const CHAT_MODEL = "anthropic/claude-sonnet-5";

// How many user↔assistant turns should elapse between memory-extraction runs.
export const MEMORY_EXTRACTION_INTERVAL_TURNS = 4;

// Where to reach the MD corpus MCP server. Override with the MD_MCP_URL
// Convex env var if this endpoint moves.
export const DEFAULT_MD_MCP_URL = "https://md-mcp.achal.xyz/mcp";
