// Verdict of `stack.mjs verify` from a round of `supabase db diff` observations (conservative rule).
//
// The diff tool is not stable on the isolated stack (docs/audits/phase3-evidence/task9-drift/): quiet runs were clean, but under load it once reported
// ~1,900 drop+create statements for objects that exist (a rendering mismatch of the TOOL, not shown to be a schema difference) and it sometimes fails
// to start its shadow database. Its cause is not identified, so a clean result that comes AFTER an unexplained difference or tool error is never
// accepted as success. The rule:
//   CLEAN            the first two observations are both clean (no earlier difference, no tool error)             -> exit 0
//   DRIFT_REPRODUCED two consecutive observations report the SAME difference (the tool repeated its report; this is NOT an independent proof that
//                    the schema differs)                                                                        -> exit 1
//   UNSTABLE         anything else that ends the round: any difference or tool error followed by clean results,
//                    reports that never agree, or the cap of MAX_RUNS observations                              -> exit 2
// Every observation (raw output included) is kept by `saveObservations`.
//
// observation: { error: true, text, raw? } | { error: false, clean: boolean, text, raw? }
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const MAX_RUNS = 6;

const same = (a, b) => !a.error && !b.error && a.clean === b.clean && a.text === b.text;

/** @returns {{ verdict: "CLEAN" | "DRIFT_REPRODUCED" | "UNSTABLE" | "UNDECIDED", exit: number, decidedBy: number | null, reason: string, tally: {clean:number,differing:number,error:number} }} */
export function decide(observations) {
  const tally = { clean: 0, differing: 0, error: 0 };
  for (const o of observations) o.error ? tally.error++ : o.clean ? tally.clean++ : tally.differing++;
  for (let i = 1; i < observations.length; i++) {
    const a = observations[i - 1], b = observations[i];
    if (!same(a, b)) continue;
    if (!b.clean) return { verdict: "DRIFT_REPRODUCED", exit: 1, decidedBy: i + 1, reason: "two consecutive observations reported the same difference (the tool repeated its report; not an independent proof)", tally };
    return i === 1
      ? { verdict: "CLEAN", exit: 0, decidedBy: 2, reason: "the first two observations were clean", tally }
      : { verdict: "UNSTABLE", exit: 2, decidedBy: i + 1, reason: "clean results came after an earlier difference or tool error; not accepted as success", tally };
  }
  return observations.length >= MAX_RUNS
    ? { verdict: "UNSTABLE", exit: 2, decidedBy: null, reason: `no two consecutive observations agreed within ${MAX_RUNS}`, tally }
    : { verdict: "UNDECIDED", exit: 2, decidedBy: null, reason: "more observations needed", tally };
}

/** Runs `observe()` until the verdict is decided or MAX_RUNS observations were taken. A throwing observer is recorded as a tool error. */
export function observeUntilDecided(observe, log = () => {}) {
  const obs = [];
  for (;;) {
    let o;
    try { o = observe(); } catch (e) { o = { error: true, text: String(e?.message ?? e).slice(0, 2000) }; }
    obs.push(o);
    log(obs.length, o);
    const d = decide(obs);
    if (d.verdict !== "UNDECIDED") return { ...d, observations: obs };
  }
}

/** Writes every observation (full text and raw tool output) and the verdict to a fresh folder; returns the folder. */
export function saveObservations(result, baseDir = process.env.VERIFY_OUT_DIR ?? tmpdir()) {
  const dir = join(baseDir, `aqarbooks-verify-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(dir, { recursive: true });
  result.observations.forEach((o, i) => {
    writeFileSync(join(dir, `observation-${i + 1}-${o.error ? "tool-error" : o.clean ? "clean" : "differs"}.txt`), (o.raw ?? o.text ?? "") + "\n", "utf8");
  });
  writeFileSync(join(dir, "verdict.json"), JSON.stringify({ verdict: result.verdict, exit: result.exit, reason: result.reason, decidedBy: result.decidedBy, tally: result.tally, observations: result.observations.map((o) => (o.error ? "error" : o.clean ? "clean" : "differs")) }, null, 2), "utf8");
  return dir;
}

/**
 * Builds one observation from a captured run: the tool's own diff plus the independent catalog comparison of the live database and the CLI's shadow.
 * The catalog comparison can only make an observation worse, never better: a clean tool result with differing catalogs is recorded as a difference
 * (independent evidence), and a tool difference stays a difference even when the catalogs are equal (that is the interesting case to study).
 * @param {{ error: boolean, clean?: boolean, text: string, raw?: string }} tool
 * @param {{ catalog_diff_lines: number | null } | null} capture
 */
export function withCatalog(tool, capture) {
  const n = capture?.catalog_diff_lines ?? null;
  const catalog = n === null ? "not captured" : n === 0 ? "live and shadow catalogs identical" : `${n} differing catalog lines`;
  if (tool.error) return { ...tool, catalog };
  if (tool.clean && n !== null && n > 0) return { error: false, clean: false, text: `catalog comparison differs while the diff tool said clean: ${n} differing lines`, raw: tool.raw, catalog };
  return { ...tool, catalog };
}
