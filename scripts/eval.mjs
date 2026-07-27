// Runs the eval suite against the dev deployment and saves the result.
//
//   pnpm eval                                  # whole suite, once
//   pnpm eval --label before --repeats 3       # named, three samples per case
//   pnpm eval --only lens                      # just the lens cases
//   pnpm eval --dry-run                        # prompts + matrix, no model calls
//
// Then: pnpm eval:report .evals/runs/<file>.json [<baseline>.json]
//
// This is a thin wrapper. The measuring happens in convex/evals/harness.ts,
// because that is where the agent, the corpus tools and the API key live. All
// this does is pass arguments in, capture the payload, and put it somewhere you
// can diff it later.
//
// Two things it is careful about:
//
// `--push` is not optional. `convex run` on its own executes whatever is
// already deployed, which after an edit is the *previous* prompt. A harness
// that silently measures the wrong version is worse than no harness, so the
// push is baked in rather than left to the person running it.
//
// stdout carries the payload and stderr carries Convex's own logging, so the
// child's stderr is inherited (you see the push happen) while stdout is piped
// and parsed. That split is a property of `convex run`, not an accident.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, ".evals", "runs");

const USAGE = `pnpm eval [--label <name>] [--only <id|tag> ...] [--repeats <n>]
                [--concurrency <n>] [--no-judge] [--dry-run]
pnpm eval --suite extraction [--model chat|background] [--repeats <n>]

  answers    (default) persona × probe replies, scored against the prompt's rules
  extraction plants excluded material in a transcript and checks it is refused`;

// Which Convex function each suite lives behind.
const SUITES = {
  answers: "evals/harness:run",
  extraction: "evals/extraction:run",
};

function parseArgs(argv) {
  const args = { only: [] };
  let suite = "answers";
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case "--label":
        args.label = value();
        break;
      case "--only":
        args.only.push(value());
        break;
      case "--repeats":
        args.repeats = Number(value());
        break;
      case "--concurrency":
        args.concurrency = Number(value());
        break;
      case "--suite":
        suite = value();
        if (!SUITES[suite]) {
          throw new Error(
            `Unknown suite "${suite}". One of: ${Object.keys(SUITES).join(", ")}`,
          );
        }
        break;
      case "--model":
        args.model = value();
        break;
      case "--no-judge":
        // The pure checks still run. This drops only the second model call —
        // roughly half the cost, and all of the extra noise.
        args.judge = false;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown flag ${flag}\n${USAGE}`);
    }
  }
  if (args.only.length === 0) delete args.only;
  return { suite, args };
}

// A filename that sorts chronologically and still says what it was.
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "run";

const bar = (n, ch = "─") => ch.repeat(n);
const pad = (s, n) => (s.length >= n ? s.slice(0, n) : s.padEnd(n));

function report(summary, run) {
  const byCase = new Map();
  for (const r of run.results) {
    if (!byCase.has(r.caseId)) byCase.set(r.caseId, []);
    byCase.get(r.caseId).push(r);
  }

  console.log(`\n${bar(78)}`);
  console.log(`${run.label}   ${run.model}   ${run.repeats}× per case`);
  console.log(bar(78));

  for (const [caseId, runs] of byCase) {
    const passed = runs.filter((r) => r.ok).length;
    // k/N rather than a tick when repeats disagree: a case that passes twice
    // out of three is a different fact from one that passes every time, and
    // flattening them is how a flaky check gets mistaken for a regression.
    const mark =
      runs.length === 1
        ? runs[0].ok
          ? "✓"
          : runs[0].error
            ? "!"
            : "✗"
        : `${passed}/${runs.length}`;
    const steps = Math.max(...runs.map((r) => r.steps));
    const cost = runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    // The judge's four always-scored dimensions, averaged. A direction, not a
    // measurement — the full scores and the reason live in the HTML report.
    const judged = runs.filter((r) => r.judge);
    const quality = judged.length
      ? judged.reduce(
          (s, r) =>
            s +
            (r.judge.perspectiveNotLecture +
              r.judge.widenedTheFrame +
              r.judge.warmth +
              r.judge.answeredAtDepthAsked) /
              4,
          0,
        ) / judged.length
      : null;
    console.log(
      `${pad(mark, 4)}${pad(caseId, 26)} ${pad(`${steps} steps`, 10)}` +
        `${pad(quality === null ? "" : `${quality.toFixed(1)}/5`, 8)}` +
        `${cost ? `$${cost.toFixed(4)}` : ""}`,
    );
    for (const r of runs) {
      if (r.error) console.log(`      error: ${r.error}`);
      for (const w of r.warnings ?? []) console.log(`      ! ${w}`);
      for (const c of r.checks.filter((c) => !c.ok)) {
        console.log(`      ✗ ${c.id}${c.detail ? ` — ${c.detail}` : ""}`);
      }
    }
  }

  console.log(bar(78));
  console.log(
    `${summary.passed} passed · ${summary.failed} failed · ${summary.errored} errored` +
      `   $${summary.totalCostUsd.toFixed(4)}   ${(summary.ms / 1000).toFixed(1)}s`,
  );
  // At one sample a difference between two runs may be nothing but the model
  // being non-deterministic. Say so here rather than letting the number carry
  // an authority it has not earned.
  if (run.repeats < 3 && !run.dryRun) {
    console.log(
      `\nOne sample per case — treat any difference from another run as noise` +
        ` until you have re-run with --repeats 3.`,
    );
  }
}

const { suite, args } = parseArgs(process.argv.slice(2));

const child = spawnSync(
  "npx",
  ["convex", "run", "--push", SUITES[suite], JSON.stringify(args)],
  { cwd: root, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" },
);

if (child.status !== 0) {
  console.error("\nconvex run failed.");
  process.exit(child.status ?? 1);
}

let summary;
try {
  summary = JSON.parse(child.stdout);
} catch {
  console.error("Could not parse the run payload. Raw output:\n", child.stdout);
  process.exit(1);
}

const run = JSON.parse(summary.payloadJson);

mkdirSync(OUT_DIR, { recursive: true });
const file = join(
  OUT_DIR,
  `${new Date(summary.startedAt).toISOString().replace(/[:.]/g, "-")}-${slug(summary.label)}.json`,
);
writeFileSync(file, JSON.stringify(run, null, 2), "utf8");

report(summary, run);
console.log(`\nSaved  ${file.replace(`${root}/`, "")}`);
console.log(
  `Report pnpm eval:report ${file.replace(`${root}/`, "")}` +
    ` [<baseline>.json]`,
);
