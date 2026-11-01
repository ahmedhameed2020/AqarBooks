import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { decide, observeUntilDecided, saveObservations, withCatalog, MAX_RUNS } from "../scripts/demo-local/drift-verdict.mjs";

/**
 * The conservative verdict of `stack.mjs verify` (docs/audits/phase3-evidence/task9-drift/). The diff tool is unstable on the isolated stack and the
 * cause is not identified, so a clean result AFTER an unexplained difference or tool error is never success:
 *   CLEAN = the first two observations are clean;  DRIFT_REPRODUCED = the same difference twice (the tool repeated its report, not an independent
 *   proof);  UNSTABLE = everything else that ends a round.
 */
const clean = { error: false, clean: true, text: "", raw: "{}" };
const drift = (t = "alter table x") => ({ error: false, clean: false, text: t, raw: JSON.stringify({ diff: t }) });
const err = { error: true, text: "LegacyShadowDbError: shadow did not start", raw: "boom" };

describe("drift verdict", () => {
  it("CLEAN -> CLEAN is CLEAN (exit 0)", () => expect(decide([clean, clean])).toMatchObject({ verdict: "CLEAN", exit: 0, decidedBy: 2 }));

  it("DRIFT -> CLEAN -> CLEAN is UNSTABLE, not success", () => {
    const d = decide([drift("artifact"), clean, clean]);
    expect(d).toMatchObject({ verdict: "UNSTABLE", exit: 2 });
    expect(d.tally).toEqual({ clean: 2, differing: 1, error: 0 });
  });

  it("ERROR -> CLEAN -> CLEAN is UNSTABLE, not success", () => {
    const d = decide([err, clean, clean]);
    expect(d).toMatchObject({ verdict: "UNSTABLE", exit: 2 });
    expect(d.tally).toEqual({ clean: 2, differing: 0, error: 1 });
  });

  it("CLEAN -> DRIFT -> CLEAN -> CLEAN is UNSTABLE: an early clean run does not buy a later success", () => expect(decide([clean, drift(), clean, clean]).verdict).toBe("UNSTABLE"));

  it("CLEAN -> ERROR -> CLEAN -> CLEAN is UNSTABLE", () => expect(decide([clean, err, clean, clean]).verdict).toBe("UNSTABLE"));

  it("the same difference twice is DRIFT_REPRODUCED (exit 1), even after a clean first run", () => {
    expect(decide([drift("create policy p"), drift("create policy p")])).toMatchObject({ verdict: "DRIFT_REPRODUCED", exit: 1, decidedBy: 2 });
    expect(decide([clean, drift("z"), drift("z")])).toMatchObject({ verdict: "DRIFT_REPRODUCED", exit: 1 });
  });

  it("a real difference is never hidden by retrying: every further observation keeps reporting it", () => {
    let calls = 0;
    const r = observeUntilDecided(() => { calls++; return drift("create index zz_real on public.t(id)"); });
    expect(r.verdict).toBe("DRIFT_REPRODUCED");
    expect(calls).toBe(2);
    expect(r.observations.every((o: { clean?: boolean }) => o.clean === false)).toBe(true);
  });

  it("a single differing or erroring observation never decides", () => {
    expect(decide([drift()]).verdict).toBe("UNDECIDED");
    expect(decide([err]).verdict).toBe("UNDECIDED");
  });

  it("two DIFFERENT differing reports, or two tool errors, are not agreement", () => {
    expect(decide([drift("a"), drift("b")]).verdict).toBe("UNDECIDED");
    expect(decide([err, err]).verdict).toBe("UNDECIDED");
  });

  it("no agreement within the cap -> UNSTABLE (exit 2)", () => {
    const seq = [clean, drift("a"), err, drift("b"), err, drift("c")];
    expect(seq.length).toBe(MAX_RUNS);
    expect(decide(seq)).toMatchObject({ verdict: "UNSTABLE", exit: 2, decidedBy: null });
  });

  it("a throwing observer is a tool error observation; ERROR then two clean runs ends UNSTABLE", () => {
    const script = [() => { throw new Error("shadow did not start"); }, () => clean, () => clean, () => { throw new Error("must not be reached"); }];
    let i = 0;
    const r = observeUntilDecided(() => script[i++]());
    expect(r.verdict).toBe("UNSTABLE");
    expect(r.observations).toHaveLength(3);
    expect(r.observations[0]).toMatchObject({ error: true });
  });

  it("saveObservations keeps every raw output and the verdict", () => {
    const r = observeUntilDecided((() => { const q = [drift("artifact text"), clean, clean]; let n = 0; return () => q[n++]; })());
    const dir = saveObservations(r, mkdtempSync(join(tmpdir(), "verdict-test-")));
    const files = readdirSync(dir).sort();
    expect(files).toEqual(["observation-1-differs.txt", "observation-2-clean.txt", "observation-3-clean.txt", "verdict.json"]);
    expect(readFileSync(join(dir, "observation-1-differs.txt"), "utf8")).toContain("artifact text");
    expect(JSON.parse(readFileSync(join(dir, "verdict.json"), "utf8"))).toMatchObject({ verdict: "UNSTABLE", observations: ["differs", "clean", "clean"] });
  });

  describe("withCatalog (independent catalog comparison can only make an observation worse)", () => {
    it("clean tool result + identical catalogs stays clean", () => expect(withCatalog(clean, { catalog_diff_lines: 0 })).toMatchObject({ clean: true, catalog: "live and shadow catalogs identical" }));

    it("clean tool result + differing catalogs becomes a difference", () => {
      const o = withCatalog(clean, { catalog_diff_lines: 7 });
      expect(o).toMatchObject({ error: false, clean: false });
      expect(decide([o, clean, clean]).verdict).toBe("UNSTABLE");
    });

    it("a tool difference stays a difference even when the catalogs are identical (the case to study)", () => expect(withCatalog(drift("x"), { catalog_diff_lines: 0 })).toMatchObject({ clean: false, catalog: "live and shadow catalogs identical" }));

    it("no capture -> unchanged apart from a note; tool errors stay errors", () => {
      expect(withCatalog(clean, null)).toMatchObject({ clean: true, catalog: "not captured" });
      expect(withCatalog(err, { catalog_diff_lines: 0 })).toMatchObject({ error: true });
    });
  });
});

