// Renders a saved eval run as a self-contained HTML page, or two runs as a
// comparison.
//
//   pnpm eval:report .evals/runs/<a>.json                    # one run
//   pnpm eval:report .evals/runs/<b>.json .evals/runs/<a>.json  # new vs baseline
//
// The second path is the baseline — the thing you are comparing *against* —
// so the argument order reads "report this, against that".
//
// What it diffs, and what it deliberately does not: the checks, the metrics and
// the system prompts are exact, so those get diffed precisely. The replies are
// samples from a non-deterministic model, so two runs of the same prompt differ
// everywhere; a word-level diff of prose would be almost entirely noise and
// would teach you to skim past the report. The replies are shown side by side,
// rendered, for you to read. Diff what is exact; read what is not.
//
// Self-contained by the same reasoning as scripts/build-legal.mjs: inline CSS,
// no webfont, no CDN. A report that needs the network is a report that fails
// on a plane.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, ".evals", "report");

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const md = (s) => marked.parse(String(s || ""), { gfm: true, async: false });

// ---------------------------------------------------------------------------
// Shaping a run
// ---------------------------------------------------------------------------

/** caseId -> { runs, checks: Map<checkId, {passed, total, details}> } */
function index(run) {
  const byCase = new Map();
  for (const r of run.results) {
    if (!byCase.has(r.caseId))
      byCase.set(r.caseId, { runs: [], checks: new Map() });
    const entry = byCase.get(r.caseId);
    entry.runs.push(r);
    for (const c of r.checks) {
      if (!entry.checks.has(c.id)) {
        entry.checks.set(c.id, { passed: 0, total: 0, details: [] });
      }
      const agg = entry.checks.get(c.id);
      agg.total++;
      if (c.ok) agg.passed++;
      else if (c.detail) agg.details.push(c.detail);
    }
  }
  return byCase;
}

const rate = (agg) => (agg ? agg.passed / agg.total : null);

function metrics(runs) {
  const n = runs.length;
  const avg = (f) => runs.reduce((s, r) => s + (f(r) ?? 0), 0) / n;
  return {
    steps: avg((r) => r.steps),
    latencyMs: avg((r) => r.latencyMs),
    costUsd: runs.reduce((s, r) => s + (r.costUsd ?? 0), 0),
    inputTokens: avg((r) => r.usage?.inputTokens),
    outputTokens: avg((r) => r.usage?.outputTokens),
    cacheReadTokens: avg((r) => r.usage?.cacheReadTokens),
    providers: [
      ...new Set(runs.map((r) => r.upstreamProvider).filter(Boolean)),
    ],
    errors: runs.map((r) => r.error).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Line diff, for the system prompts
// ---------------------------------------------------------------------------

function lineDiff(a, b) {
  const A = a.split("\n");
  const B = b.split("\n");
  const m = A.length;
  const n = B.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        A[i] === B[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (A[i] === B[j]) out.push(["same", A[i++], j++]);
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(["del", A[i++]]);
    else out.push(["add", B[j++]]);
  }
  while (i < m) out.push(["del", A[i++]]);
  while (j < n) out.push(["add", B[j++]]);
  return out;
}

/** Only the changed lines, with a little context — a prompt is mostly unchanged. */
function renderDiff(baseText, newText) {
  const rows = lineDiff(baseText, newText);
  const keep = new Set();
  rows.forEach(([kind], i) => {
    if (kind === "same") return;
    for (let k = i - 2; k <= i + 2; k++) keep.add(k);
  });
  const html = [];
  let skipping = false;
  rows.forEach(([kind, text], i) => {
    if (!keep.has(i)) {
      if (!skipping) html.push(`<div class="d-skip">⋯</div>`);
      skipping = true;
      return;
    }
    skipping = false;
    const sign = kind === "add" ? "+" : kind === "del" ? "−" : " ";
    html.push(
      `<div class="d-${kind}"><span class="d-sign">${sign}</span>${esc(text) || "&nbsp;"}</div>`,
    );
  });
  return `<div class="diff">${html.join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

function chip(id, agg, repeats) {
  if (!agg) return "";
  const r = rate(agg);
  const cls = r === 1 ? "ok" : r === 0 ? "bad" : "part";
  const label =
    repeats > 1 ? `${agg.passed}/${agg.total}` : r === 1 ? "✓" : "✗";
  const title = agg.details.length
    ? ` title="${esc(agg.details.join(" · "))}"`
    : "";
  return `<span class="chip ${cls}"${title}>${esc(id)} <b>${label}</b></span>`;
}

function toolTable(runs) {
  const calls = runs[0]?.toolCalls ?? [];
  if (calls.length === 0) return `<p class="muted">No tools called.</p>`;
  const sizes = runs[0]?.toolResultSizes ?? [];
  return `<table class="tools"><thead><tr><th>tool</th><th>arguments the model chose</th><th>result</th></tr></thead><tbody>${calls
    .map(
      (c, i) =>
        `<tr><td><code>${esc(c.toolName)}</code>${c.invalid ? ' <span class="chip bad">invalid</span>' : ""}</td>` +
        `<td><code>${esc(JSON.stringify(c.input))}</code></td>` +
        `<td class="num">${sizes[i] ? `${sizes[i].toLocaleString()} ch` : "—"}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function metricLine(m, repeats) {
  const bits = [
    `${m.steps.toFixed(repeats > 1 ? 1 : 0)} steps`,
    `${(m.latencyMs / 1000).toFixed(1)}s`,
    m.costUsd ? `$${m.costUsd.toFixed(4)}` : null,
    `${Math.round(m.inputTokens).toLocaleString()} in`,
    `${Math.round(m.outputTokens).toLocaleString()} out`,
    m.cacheReadTokens
      ? `${Math.round(m.cacheReadTokens).toLocaleString()} cached`
      : "no cache read",
    m.providers.length ? m.providers.join(", ") : null,
  ].filter(Boolean);
  return `<p class="metrics">${bits.map((b) => `<span>${esc(b)}</span>`).join("")}</p>`;
}

const DIMENSIONS = [
  ["perspectiveNotLecture", "perspective"],
  ["widenedTheFrame", "widened frame"],
  ["warmth", "warmth"],
  ["answeredAtDepthAsked", "depth"],
  ["lensAsLensNotDoctrine", "lens not doctrine"],
];

/** Mean per dimension across repeats, plus the rationales. */
function judgePanel(runs, other) {
  const judged = runs.filter((r) => r.judge);
  if (judged.length === 0) return "";
  const mean = (list, key) =>
    list.filter((r) => r.judge[key] > 0).length
      ? list
          .filter((r) => r.judge[key] > 0)
          .reduce((s, r) => s + r.judge[key], 0) /
        list.filter((r) => r.judge[key] > 0).length
      : null;
  const otherJudged = (other ?? []).filter((r) => r.judge);

  const rows = DIMENSIONS.map(([key, label]) => {
    const now = mean(judged, key);
    if (now === null) return "";
    const before = otherJudged.length ? mean(otherJudged, key) : null;
    // Shown but never coloured: a judge's one-point move is well inside its
    // own noise, and colouring it would dress an opinion up as a result.
    const delta =
      before === null
        ? ""
        : ` <span class="muted">(${before.toFixed(1)} → ${now.toFixed(1)})</span>`;
    return `<tr><td>${esc(label)}</td><td class="num">${now.toFixed(1)}${delta}</td></tr>`;
  }).join("");

  return `<details class="judge"><summary>Judge <span class="muted">${DIMENSIONS.map(
    ([k, l]) => {
      const m = mean(judged, k);
      return m === null ? null : `${l} ${m.toFixed(1)}`;
    },
  )
    .filter(Boolean)
    .join(" · ")}</span></summary>
    <table>${rows}</table>
    <ul class="rationales">${judged
      .map((r) => `<li>${esc(r.judge.rationale)}</li>`)
      .join("")}</ul>
  </details>`;
}

function replyPanel(runs, label) {
  return runs
    .map(
      (r, i) => `<div class="reply">
        ${runs.length > 1 ? `<h5>${esc(label)} — sample ${i + 1}</h5>` : label ? `<h5>${esc(label)}</h5>` : ""}
        ${r.error ? `<p class="err">${esc(r.error)}</p>` : md(r.reply)}
      </div>`,
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function render(a, b) {
  const A = index(a);
  const B = b ? index(b) : null;
  const compare = Boolean(b);

  // Every check id seen anywhere, so a check that only exists on one side is
  // still visible rather than silently dropped.
  const allChecks = new Set();
  for (const m of [A, B].filter(Boolean)) {
    for (const entry of m.values())
      for (const id of entry.checks.keys()) allChecks.add(id);
  }

  // When comparing, tally only the cases both runs actually ran. A narrower
  // run (`--only study`) against a full baseline would otherwise put 5 cases
  // next to 15 and call the difference a regression — which is the report
  // lying about the very thing it exists to measure.
  const shared = B ? new Set([...A.keys()].filter((id) => B.has(id))) : null;

  const summaryRows = [...allChecks]
    .sort()
    .map((id) => {
      const tally = (m) => {
        if (!m) return null;
        let passed = 0;
        let total = 0;
        for (const [caseId, entry] of m.entries()) {
          if (shared && !shared.has(caseId)) continue;
          const agg = entry.checks.get(id);
          if (!agg) continue;
          passed += agg.passed;
          total += agg.total;
        }
        return total ? { passed, total } : null;
      };
      const now = tally(A);
      const before = tally(B);
      if (!now && !before) return "";
      const pct = (t) => (t ? `${t.passed}/${t.total}` : "—");
      let delta = "";
      if (now && before) {
        const d = now.passed / now.total - before.passed / before.total;
        const noisy = a.repeats < 3;
        delta =
          d === 0
            ? `<span class="muted">no change</span>`
            : `<span class="${noisy ? "muted" : d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d * 100).toFixed(0)}%${noisy ? " (within noise)" : ""}</span>`;
      }
      return `<tr><td><code>${esc(id)}</code></td>${
        compare ? `<td class="num">${pct(before)}</td>` : ""
      }<td class="num">${pct(now)}</td>${compare ? `<td>${delta}</td>` : ""}</tr>`;
    })
    .join("");

  // Prompts, per persona. Deterministic, so this diff is the honest answer to
  // "what did I actually change".
  const personas = [
    ...new Set([...Object.keys(a.prompts), ...Object.keys(b?.prompts ?? {})]),
  ];
  const promptPanels = personas
    .map((id) => {
      const now = a.prompts[id];
      const before = b?.prompts?.[id];
      // A narrower run (`--only lens`) exercises fewer personas than the
      // baseline it is compared against, so "missing on one side" is a normal
      // state and is not the same thing as "changed".
      const changed = Boolean(
        now && before && before.fingerprint !== now.fingerprint,
      );
      const badge = !now
        ? `<span class="chip part">not in this run</span>`
        : !before
          ? `<span class="chip part">not in the baseline</span>`
          : changed
            ? `<span class="chip bad">prompt changed</span>`
            : `<span class="chip ok">prompt identical</span>`;
      const body = changed
        ? renderDiff(before.text, now.text)
        : `<pre>${esc((now ?? before).text)}</pre>`;
      return `<details class="persona"${changed ? " open" : ""}>
        <summary><code>${esc(id)}</code> ${badge}
          <span class="muted">${esc((now ?? before).fingerprint)}</span></summary>
        ${body}
      </details>`;
    })
    .join("");

  const caseCards = a.cases
    .map((c) => {
      const now = A.get(c.id);
      const before = B?.get(c.id);
      if (!now && !before) return "";
      const changedChecks = [...allChecks].filter((id) => {
        const x = rate(now?.checks.get(id));
        const y = rate(before?.checks.get(id));
        return x !== null && y !== null && x !== y;
      });

      const column = (entry, label, run, otherEntry) =>
        entry
          ? `<div class="col">
              <div class="chips">${[...entry.checks.entries()]
                .map(([id, agg]) => chip(id, agg, run.repeats))
                .join("")}</div>
              ${metricLine(metrics(entry.runs), run.repeats)}
              ${judgePanel(entry.runs, otherEntry?.runs)}
              ${toolTable(entry.runs)}
              ${replyPanel(entry.runs, compare ? label : "")}
            </div>`
          : `<div class="col"><p class="muted">not in this run</p></div>`;

      return `<section class="case${changedChecks.length ? " moved" : ""}" id="${esc(c.id)}">
        <h3>${esc(c.id)}
          ${changedChecks.length ? `<span class="chip part">${changedChecks.length} check${changedChecks.length > 1 ? "s" : ""} moved</span>` : ""}
        </h3>
        <p class="why">${esc(c.why)}</p>
        <div class="cols${compare ? " two" : ""}">
          ${compare ? column(before, b.label, b) : ""}
          ${column(now, a.label, a, before)}
        </div>
      </section>`;
    })
    .join("");

  const totalCost = (run) =>
    run.results.reduce((s, r) => s + (r.costUsd ?? 0), 0);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(a.label)}${compare ? ` vs ${esc(b.label)}` : ""} — Dhee eval</title>
<style>
  /* Tokens mirror src/lib/theme.ts, same as scripts/build-legal.mjs. */
  :root {
    --bg:#fdfaf4; --surface:#fff; --border:#e2ddd5; --text:#302720;
    --text-soft:#60564e; --accent:#9f5021;
    --ok:#2f6f43; --bad:#a3341f; --part:#8a6d1f;
    --ok-bg:#e8f2eb; --bad-bg:#faeae6; --part-bg:#f7f0dd;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#16120e; --surface:#201b16; --border:#39312b; --text:#ece7df;
      --text-soft:#aaa39b; --accent:#e7b280;
      --ok:#8ed0a3; --bad:#f0a08c; --part:#e0c377;
      --ok-bg:#1b2c21; --bad-bg:#32201b; --part-bg:#2c2617;
    }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; }
  .page { max-width:78rem; margin:0 auto; padding:2.5rem 1.25rem 5rem; }
  h1 { font-size:1.6rem; margin:0 0 .4rem; }
  h2 { font-size:1.15rem; margin:3rem 0 .75rem; padding-bottom:.4rem;
       border-bottom:1px solid var(--border); }
  h3 { font-size:1rem; margin:0 0 .3rem; font-family:ui-monospace,monospace; }
  h5 { font-size:.75rem; margin:0 0 .5rem; color:var(--text-soft);
       text-transform:uppercase; letter-spacing:.04em; }
  code, pre { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .muted { color:var(--text-soft); }
  .why { color:var(--text-soft); font-size:.85rem; margin:0 0 .9rem; }
  .lede { color:var(--text-soft); margin:0 0 1.5rem; }
  .lede span { margin-right:1.25rem; white-space:nowrap; }
  table { border-collapse:collapse; width:100%; font-size:.85rem; }
  th, td { border:1px solid var(--border); padding:.4rem .6rem; text-align:left;
           vertical-align:top; }
  th { background:var(--surface); }
  .num { text-align:right; white-space:nowrap; }
  .up { color:var(--ok); } .down { color:var(--bad); }
  .chip { display:inline-block; font-size:.72rem; padding:.1rem .45rem;
          border-radius:.7rem; margin:0 .3rem .3rem 0; white-space:nowrap; }
  .chip.ok { background:var(--ok-bg); color:var(--ok); }
  .chip.bad { background:var(--bad-bg); color:var(--bad); }
  .chip.part { background:var(--part-bg); color:var(--part); }
  .case { background:var(--surface); border:1px solid var(--border);
          border-radius:.5rem; padding:1rem 1.1rem; margin:1rem 0; }
  .case.moved { border-color:var(--part); }
  .cols.two { display:grid; grid-template-columns:1fr 1fr; gap:1.25rem; }
  .cols.two .col { min-width:0; }
  .cols.two .col + .col { border-left:1px solid var(--border); padding-left:1.25rem; }
  @media (max-width:60rem) {
    .cols.two { grid-template-columns:1fr; }
    .cols.two .col + .col { border-left:0; padding-left:0;
      border-top:1px solid var(--border); padding-top:1.25rem; }
  }
  .metrics { margin:.5rem 0; font-size:.78rem; color:var(--text-soft); }
  .metrics span { margin-right:.9rem; white-space:nowrap; }
  .tools { margin:.5rem 0 1rem; }
  .tools code { font-size:.75rem; word-break:break-word; }
  .reply { border-top:1px dashed var(--border); padding-top:.75rem; margin-top:.75rem; }
  .reply p:first-of-type { margin-top:0; }
  .reply blockquote { margin:.75rem 0; padding:.4rem .9rem;
    border-left:3px solid var(--border); color:var(--text-soft); }
  .err { color:var(--bad); }
  details.judge { margin:.5rem 0; font-size:.85rem; }
  details.judge summary { cursor:pointer; }
  details.judge table { width:auto; min-width:16rem; margin:.5rem 0; }
  details.judge td { border:0; padding:.15rem .5rem .15rem 0; }
  .rationales { margin:.25rem 0 0; padding-left:1.1rem; color:var(--text-soft);
    font-size:.8rem; }
  details.persona { background:var(--surface); border:1px solid var(--border);
    border-radius:.5rem; padding:.6rem .9rem; margin:.5rem 0; }
  details.persona summary { cursor:pointer; }
  details.persona pre { white-space:pre-wrap; font-size:.75rem;
    max-height:28rem; overflow:auto; color:var(--text-soft); }
  .diff { font-size:.75rem; margin-top:.75rem; overflow-x:auto; }
  .diff > div { white-space:pre-wrap; padding:.1rem .4rem; }
  .d-sign { display:inline-block; width:1rem; opacity:.6; }
  .d-add { background:var(--ok-bg); color:var(--ok); }
  .d-del { background:var(--bad-bg); color:var(--bad); }
  .d-same { color:var(--text-soft); }
  .d-skip { color:var(--text-soft); text-align:center; opacity:.5; }
  .note { background:var(--surface); border:1px solid var(--border);
    border-left:3px solid var(--part); border-radius:.4rem;
    padding:.7rem 1rem; font-size:.85rem; color:var(--text-soft); }
</style></head>
<body><main class="page">
  <h1>${esc(a.label)}${compare ? ` <span class="muted">vs</span> ${esc(b.label)}` : ""}</h1>
  <p class="lede">
    <span>${esc(a.model)}</span>
    ${a.judgeModel ? `<span>judged by ${esc(a.judgeModel)}</span>` : `<span>not judged</span>`}
    <span>${new Date(a.startedAt).toLocaleString()}</span>
    <span>${a.cases.length} cases × ${a.repeats}</span>
    <span>$${totalCost(a).toFixed(4)}${compare ? ` vs $${totalCost(b).toFixed(4)}` : ""}</span>
  </p>
  ${
    a.repeats < 3
      ? `<p class="note">One sample per case. A check that moved may just be the
         model being non-deterministic — deltas are shown muted until
         <code>--repeats 3</code>. The prompt diff below is exact either way.</p>`
      : ""
  }

  <h2>Checks</h2>
  ${
    compare
      ? `<p class="muted">Over the ${shared.size} case${shared.size === 1 ? "" : "s"} both runs ran.</p>`
      : ""
  }
  <table><thead><tr><th>check</th>${compare ? `<th class="num">${esc(b.label)}</th>` : ""}<th class="num">${esc(a.label)}</th>${compare ? "<th>delta</th>" : ""}</tr></thead>
  <tbody>${summaryRows}</tbody></table>

  <h2>System prompts</h2>
  <p class="muted">One per persona — the input layer, where a change is exact and
  attributable. ${compare ? "Changed prompts are opened and diffed." : ""}</p>
  ${promptPanels}

  <h2>Cases</h2>
  ${caseCards}
</main></body></html>
`;
}

// ---------------------------------------------------------------------------

const [nowPath, basePath] = process.argv.slice(2);
if (!nowPath) {
  console.error(
    "pnpm eval:report <run.json> [<baseline.json>]\n" +
      "  The second file is the baseline you are comparing against.",
  );
  process.exit(1);
}

const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const a = load(nowPath);
const b = basePath ? load(basePath) : null;

mkdirSync(OUT_DIR, { recursive: true });
const name = basePath
  ? `${basename(nowPath, ".json")}-vs-${basename(basePath, ".json")}.html`
  : `${basename(nowPath, ".json")}.html`;
const out = join(OUT_DIR, name);
writeFileSync(out, render(a, b), "utf8");
console.log(out.replace(`${root}/`, ""));
