import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");
const checklist = read("docs/progress/launch-checklist.md");
const matrix = read("docs/progress/production-readiness-matrix.md");
const external = read("docs/progress/external-approvals-tracker.md");
const status = JSON.parse(read("docs/progress/status.json")) as { phases: { id: string; status: string }[] };
const roadmap = read("docs/progress/ROADMAP.md");

const emojiToState: Record<string, string> = { "✅": "DONE", "⚠️": "PARTIAL", "❌": "OPEN" };

function checklistRows() {
  const rows = [...checklist.matchAll(/^\|\s*(\d+)\s*\|([^|]*)\|\s*(✅|⚠️|❌)/gm)];
  return rows.map((m) => ({ n: Number(m[1]), state: emojiToState[m[3]] }));
}

describe("production readiness documents stay consistent", () => {
  it("checklist has all 19 items", () => {
    expect(checklistRows()).toHaveLength(19);
  });

  it("matrix has one row per checklist item with the same state", () => {
    const matrixRows = [...matrix.matchAll(/^\|\s*(\d+)\s*\|[^|]*\|\s*(✅|⚠️|❌)/gm)].map((m) => ({
      n: Number(m[1]),
      state: emojiToState[m[2]],
    }));
    expect(matrixRows).toHaveLength(19);
    const byN = new Map(matrixRows.map((r) => [r.n, r.state]));
    for (const row of checklistRows()) {
      expect(byN.get(row.n), `matrix item ${row.n}`).toBe(row.state);
    }
  });

  it("matrix states match the launch checklist counts", () => {
    const counts = checklistRows().reduce<Record<string, number>>((acc, r) => {
      acc[r.state] = (acc[r.state] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ DONE: 4, PARTIAL: 5, OPEN: 10 });
  });

  it("every phase is marked verified locally except production, and each appears in the roadmap", () => {
    for (const phase of status.phases) {
      if (phase.id !== "production") expect(phase.status, phase.id).toBe("verified");
      expect(roadmap, `ROADMAP must mention ${phase.id}`).toContain(phase.id);
    }
    expect(status.phases.find((p) => p.id === "production")?.status).toBe("not_started");
  });

  it("external approvals tracker lists the six external items and claims none complete", () => {
    const rows = [...external.matchAll(/^\|\s*(E[1-6])\s*\|/gm)].map((m) => m[1]);
    expect(rows).toEqual(["E1", "E2", "E3", "E4", "E5", "E6"]);
    expect(external).not.toMatch(/✅\s*(مكتمل|complete)/i);
  });
});
