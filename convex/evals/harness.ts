import type { ProviderMetadata } from "ai";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { buildSystemPrompt, dhee, isCorpusLens } from "../agents/dhee";
import { detectReplyScript } from "../lib/script";
import { replyOptionsFor } from "../chat";
import { CHAT_MODEL } from "../config";
import { fingerprint, runChecks, type Check } from "./checks";
import { judgeReply, JUDGE_MODEL, type JudgeScores } from "./judge";
import {
  CASES,
  PERSONAS,
  PROBES,
  selectCases,
  type EvalCase,
  type PersonaId,
} from "./scenarios";

// The eval runner.
//
//   npx convex run --push evals/harness:run '{"label":"baseline"}'
//   npx convex run --push evals/harness:run '{"dryRun":true}'
//
// Normally driven by `pnpm eval`, which adds `--push` and saves the payload.
// The `--push` matters: without it you measure whatever prompt is deployed,
// which may not be the one you just edited, and a harness that lies about which
// prompt it tested is worse than none.
//
// Why this lives in Convex rather than in a script: the agent, the six corpus
// tools, the MCP client and OPENROUTER_API_KEY are all here. Reproducing that
// outside is a rewrite, and a rewrite would be measuring a different pipeline
// than the one people talk to. convex/dev.ts:smokeTest is the same idea with
// one hardcoded case.
//
// Cost, measured: see the note next to `totalCostUsd` in the summary after the
// first real run.

/**
 * Who the agent thinks is asking.
 *
 * An opaque string, not a `users` row — the component treats userId as an
 * identifier and nothing else. Combined with `saveMessages: "none"` this is
 * the same sandbox `chat.incognitoReply` runs in: nothing is written, nothing
 * is read, and hundreds of eval runs leave no threads or messages to clean up.
 */
const EVAL_USER_ID = "eval-harness";

// Long enough that a study-mode turn's twelve steps still fit, short enough
// that one wedged case cannot eat the action's whole budget.
const CASE_TIMEOUT_MS = 180_000;

export type EvalResult = {
  caseId: string;
  personaId: PersonaId;
  probeId: string;
  repeat: number;
  /** Every check the case earned passed. */
  ok: boolean;
  reply: string;
  finishReason: string;
  steps: number;
  toolCalls: Array<{ toolName: string; input: unknown; invalid?: boolean }>;
  /** Sizes only — the corpus text itself never leaves the action. */
  toolResultSizes: number[];
  checks: Check[];
  latencyMs: number;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  costUsd?: number;
  /** Which upstream OpenRouter routed to. A real run-to-run confounder. */
  upstreamProvider?: string;
  /** Absent when the judge was skipped, or when it failed. */
  judge?: JudgeScores;
  /** Non-fatal problems — a failed judge, most often. */
  warnings?: string[];
  error?: string;
};

export type EvalRun = {
  label: string;
  startedAt: number;
  model: string;
  /** Absent when the run was not judged. */
  judgeModel?: string;
  repeats: number;
  dryRun: boolean;
  /** By persona rather than by case — the same prompt serves several cases. */
  prompts: Record<string, { text: string; fingerprint: string }>;
  cases: Array<Pick<EvalCase, "id" | "persona" | "probe" | "tags" | "why">>;
  results: EvalResult[];
};

// OpenRouter's dollar figure has no home in the AI SDK's typed usage, so it
// comes back through provider metadata as loose JSON. Narrowed in one place
// and read defensively: a missing cost is a report with a blank column, not a
// failed run.
type OpenRouterMeta = { provider?: string; usage?: { cost?: number } };
const openrouterMeta = (md: ProviderMetadata | undefined) =>
  md?.openrouter as OpenRouterMeta | undefined;

/** Run `work` over `items`, at most `limit` at a time. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await work(items[i] as T);
      }
    })(),
  );
  await Promise.all(workers);
  return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${what} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

async function runOnce(
  ctx: ActionCtx,
  evalCase: EvalCase,
  repeat: number,
  judge: boolean,
): Promise<EvalResult> {
  const persona = PERSONAS[evalCase.persona];
  const probe = PROBES[evalCase.probe];
  const traditions = persona.inputs.traditions ?? [];

  // The same prompt a real turn gets, including the per-turn script line that
  // `streamReply` appends. Without this the suite would be measuring a prompt
  // nobody receives — and it would measure it precisely where the difference
  // matters, since the language rule's whole mechanism is that instruction
  // being restated after the conversation history rather than only sitting in
  // the base prompt.
  const replyScript = detectReplyScript(probe.text);
  const system = buildSystemPrompt({
    ...persona.inputs,
    ...(replyScript ? { replyScript } : {}),
  });

  const base: EvalResult = {
    caseId: evalCase.id,
    personaId: evalCase.persona,
    probeId: evalCase.probe,
    repeat,
    ok: false,
    reply: "",
    finishReason: "",
    steps: 0,
    toolCalls: [],
    toolResultSizes: [],
    checks: [],
    latencyMs: 0,
    usage: {},
  };

  const started = Date.now();
  try {
    const result = await withTimeout(
      dhee.generateText(
        ctx,
        { userId: EVAL_USER_ID },
        {
          system,
          ...(probe.priorTurns
            ? {
                messages: [
                  ...probe.priorTurns.map((t) => ({
                    role: t.role,
                    content: t.text,
                  })),
                  { role: "user" as const, content: probe.text },
                ],
              }
            : { prompt: probe.text }),
          // The same per-turn options a real reply gets, so the step budget
          // under test is the one the app actually uses.
          ...replyOptionsFor(traditions),
        },
        {
          storageOptions: { saveMessages: "none" },
          contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
        },
      ),
      CASE_TIMEOUT_MS,
      evalCase.id,
    );

    // `result.text` is the text of the LAST step only. A study turn that
    // searches, reads a page and then answers can leave real prose in an
    // earlier step, so joining is what matches the transcript the app renders.
    const reply =
      result.steps
        .map((s) => s.text)
        .filter(Boolean)
        .join("\n\n") || result.text;

    const toolCalls = result.steps.flatMap((s) => s.toolCalls ?? []);
    const toolOutputs = result.steps
      .flatMap((s) => s.toolResults ?? [])
      .map((r) =>
        typeof r.output === "string" ? r.output : JSON.stringify(r.output),
      );

    // Summed across steps: `result.providerMetadata` is the last step's alone,
    // which would under-report a twelve-step turn by an order of magnitude.
    const costUsd = result.steps.reduce(
      (sum, step) =>
        sum + (openrouterMeta(step.providerMetadata)?.usage?.cost ?? 0),
      0,
    );

    const checks = runChecks(
      {
        probe: probe.text,
        reply,
        traditions,
        contextBlock: persona.inputs.contextBlock ?? "",
        toolNames: toolCalls.map((c) => c.toolName),
        toolOutputs,
      },
      evalCase.expect,
    );

    // After the checks, so a judge outage costs opinions but never evidence.
    let scores: JudgeScores | null = null;
    const warnings: string[] = [];
    if (judge) {
      try {
        scores = await judgeReply({
          question: probe.text,
          reply,
          traditions,
          studyMode: isCorpusLens(traditions),
        });
      } catch (error) {
        warnings.push(
          `judge failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      ...base,
      // `ok` is the pure checks alone. The judge's scores are read, never
      // thresholded: turning a wobbly 1-5 opinion into a pass/fail would put
      // noise into the one number the report treats as a fact.
      ok: checks.every((c) => c.ok),
      ...(scores ? { judge: scores } : {}),
      ...(warnings.length ? { warnings } : {}),
      reply,
      finishReason: result.finishReason,
      steps: result.steps.length,
      toolCalls: toolCalls.map((c) => ({
        toolName: c.toolName,
        input: c.input,
        ...(c.invalid ? { invalid: true } : {}),
      })),
      toolResultSizes: toolOutputs.map((o) => o.length),
      checks,
      latencyMs: Date.now() - started,
      usage: {
        inputTokens: result.totalUsage.inputTokens,
        outputTokens: result.totalUsage.outputTokens,
        cacheReadTokens: result.totalUsage.inputTokenDetails?.cacheReadTokens,
        cacheWriteTokens: result.totalUsage.inputTokenDetails?.cacheWriteTokens,
      },
      ...(costUsd > 0 ? { costUsd } : {}),
      upstreamProvider: openrouterMeta(result.steps.at(-1)?.providerMetadata)
        ?.provider,
    };
  } catch (error) {
    // One case failing must not lose the other fourteen — a run that spent
    // real money should always hand back what it managed to measure.
    return {
      ...base,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const run = internalAction({
  args: {
    /** Names the run. `pnpm eval` uses it for the saved filename. */
    label: v.optional(v.string()),
    /** Case ids or tags. Omit for the whole suite. */
    only: v.optional(v.array(v.string())),
    repeats: v.optional(v.number()),
    concurrency: v.optional(v.number()),
    /** Score the soft qualities too. On by default; off for a fast loop. */
    judge: v.optional(v.boolean()),
    /** Build every prompt and enumerate the matrix without calling the model. */
    dryRun: v.optional(v.boolean()),
  },
  // The summary is validated so a bare `convex run` in a terminal is readable;
  // the detail rides along as one JSON string. Fifteen heterogeneous case
  // records, each with a check list and per-tool-call inputs, is a lot of
  // validator surface that only a JS report script ever reads, and it would
  // need editing every time a check is added. `convex/md.ts` returns whole
  // JSON envelopes as v.string() for the same reason. Type safety comes from
  // the exported `EvalRun` type, applied at the stringify.
  returns: v.object({
    label: v.string(),
    model: v.string(),
    startedAt: v.number(),
    ms: v.number(),
    cases: v.number(),
    repeats: v.number(),
    passed: v.number(),
    failed: v.number(),
    errored: v.number(),
    totalCostUsd: v.number(),
    payloadJson: v.string(),
  }),
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const label = args.label ?? new Date(startedAt).toISOString();
    const repeats = Math.max(1, args.repeats ?? 1);
    const concurrency = Math.max(1, args.concurrency ?? 4);
    const dryRun = args.dryRun ?? false;
    const judge = (args.judge ?? true) && !dryRun;

    // Throws on a selector that matches nothing, rather than running zero cases
    // and reporting green — the worst possible outcome for a tool whose only
    // job is to be believed.
    const cases = selectCases(args.only);

    const prompts: EvalRun["prompts"] = {};
    for (const personaId of new Set(cases.map((c) => c.persona))) {
      const text = buildSystemPrompt(PERSONAS[personaId].inputs);
      prompts[personaId] = { text, fingerprint: fingerprint(text) };
    }

    // Repeats run sequentially inside a case so the second and third hit the
    // warm prompt cache; cases run in parallel because a serial suite would
    // overrun the action's ten-minute budget.
    const results = dryRun
      ? []
      : (
          await pooled(cases, concurrency, async (evalCase) => {
            const runs: EvalResult[] = [];
            for (let repeat = 0; repeat < repeats; repeat++) {
              runs.push(await runOnce(ctx, evalCase, repeat, judge));
            }
            return runs;
          })
        ).flat();

    const payload: EvalRun = {
      label,
      startedAt,
      model: CHAT_MODEL,
      ...(judge ? { judgeModel: JUDGE_MODEL } : {}),
      repeats,
      dryRun,
      prompts,
      cases: cases.map(({ id, persona, probe, tags, why }) => ({
        id,
        persona,
        probe,
        tags,
        why,
      })),
      results,
    };

    return {
      label,
      model: CHAT_MODEL,
      startedAt,
      ms: Date.now() - startedAt,
      cases: cases.length,
      repeats,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok && !r.error).length,
      errored: results.filter((r) => Boolean(r.error)).length,
      totalCostUsd: results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
      payloadJson: JSON.stringify(payload),
    };
  },
});

/** Every case id and tag, for the runner script's `--help`. */
export const catalogue = internalAction({
  args: {},
  returns: v.object({ ids: v.array(v.string()), tags: v.array(v.string()) }),
  handler: async () => ({
    ids: CASES.map((c) => c.id),
    tags: [...new Set(CASES.flatMap((c) => c.tags))].sort(),
  }),
});
