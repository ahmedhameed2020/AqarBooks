import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STATUS_PATH = fileURLToPath(new URL("../docs/progress/status.json", import.meta.url));
const ROADMAP_PATH = fileURLToPath(new URL("../docs/progress/ROADMAP.md", import.meta.url));

const ALLOWED_STATUSES = ["not_started", "in_progress", "code_complete", "verified", "blocked"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERIFIED_EVIDENCE = /integration|e2e|isolated/i;

type Phase = {
  id: string;
  name_ar: string;
  name_en: string;
  status: string;
  tests: { file: string; result_text: string }[];
  blockers: string[];
  last_updated: string;
  evidence: string[];
  percent_defined: number | null;
  percent_note: string;
};

const raw = readFileSync(STATUS_PATH, "utf8");
const data = JSON.parse(raw) as {
  schema_version: unknown;
  generated_note: unknown;
  production_readiness: unknown;
  production_readiness_note: unknown;
  phases: Phase[];
};

describe("docs/progress/status.json", () => {
  it("parses as JSON with schema_version 1", () => {
    expect(data.schema_version).toBe(1);
    expect(typeof data.generated_note).toBe("string");
  });

  it("has phases with the required keys and types", () => {
    expect(Array.isArray(data.phases)).toBe(true);
    expect(data.phases.length).toBeGreaterThan(0);
    for (const p of data.phases) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.name_ar).toBe("string");
      expect(typeof p.name_en).toBe("string");
      expect(typeof p.status).toBe("string");
      expect(Array.isArray(p.tests)).toBe(true);
      for (const t of p.tests) {
        expect(typeof t.file).toBe("string");
        expect(typeof t.result_text).toBe("string");
      }
      expect(Array.isArray(p.blockers)).toBe(true);
      for (const b of p.blockers) expect(typeof b).toBe("string");
      expect(typeof p.last_updated).toBe("string");
      expect(p.last_updated).toMatch(ISO_DATE);
      expect(Array.isArray(p.evidence)).toBe(true);
      for (const e of p.evidence) expect(typeof e).toBe("string");
      expect(typeof p.percent_note).toBe("string");
    }
  });

  it("uses only the five allowed status values", () => {
    for (const p of data.phases) {
      expect(ALLOWED_STATUSES, `phase ${p.id}`).toContain(p.status);
    }
  });

  it("allows 'verified' only with integration/e2e/isolated evidence", () => {
    for (const p of data.phases.filter((x) => x.status === "verified")) {
      expect(p.evidence.length, `phase ${p.id} evidence`).toBeGreaterThan(0);
      expect(
        p.evidence.some((e) => VERIFIED_EVIDENCE.test(e)),
        `phase ${p.id} evidence must match ${VERIFIED_EVIDENCE}`,
      ).toBe(true);
    }
  });

  it("keeps percent_defined null or 0-100, with a note when set", () => {
    for (const p of data.phases) {
      if (p.percent_defined === null) continue;
      expect(typeof p.percent_defined, `phase ${p.id}`).toBe("number");
      expect(p.percent_defined).toBeGreaterThanOrEqual(0);
      expect(p.percent_defined).toBeLessThanOrEqual(100);
      expect(p.percent_note.trim().length, `phase ${p.id} percent_note`).toBeGreaterThan(0);
    }
  });

  it("does not assess production readiness", () => {
    expect(data.production_readiness).toBe("not_assessed");
    expect(typeof data.production_readiness_note).toBe("string");
  });
});

describe("docs/progress/ROADMAP.md", () => {
  it("exists and mentions every phase id from status.json", () => {
    expect(existsSync(ROADMAP_PATH)).toBe(true);
    const roadmap = readFileSync(ROADMAP_PATH, "utf8");
    for (const p of data.phases) {
      expect(roadmap, `ROADMAP.md must mention ${p.id}`).toContain(p.id);
    }
  });
});
