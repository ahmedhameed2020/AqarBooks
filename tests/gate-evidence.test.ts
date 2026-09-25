import { describe, expect, it } from "vitest";
import {
  buildAccessEvidenceCsv,
  getOccupancyWarnings,
  parseEvidenceExportFilters,
  parseEvidenceFilters,
} from "../lib/gates/evidence-csv";

const event = {
  occurredAt: "2026-09-25T10:30:00.000Z",
  propertyName: "Pearl Residences",
  gateName: "North Gate",
  invitationNo: "INV-42",
  guestName: "Visitor",
  unitCode: "A-101",
  decision: "ALLOW" as const,
  reasonCode: "VALID_ENTRY",
  direction: "ENTRY" as const,
  operatorName: "Guard One",
};

describe("gate evidence query boundaries", () => {
  it("accepts the maximum page size", () => {
    expect(parseEvidenceFilters({ page: "1", pageSize: "100" }).pageSize).toBe(100);
  });

  it("rejects pages larger than 100 rows", () => {
    expect(() => parseEvidenceFilters({ pageSize: "101" })).toThrow();
  });

  it("rejects malformed dates and inverted ranges", () => {
    expect(() => parseEvidenceFilters({ from: "not-a-date" })).toThrow();
    expect(() => parseEvidenceFilters({ from: "2026-09-25", to: "2026-09-24" })).toThrow();
  });

  it("limits exports to an inclusive 31-day range", () => {
    expect(parseEvidenceExportFilters({ from: "2026-09-01", to: "2026-10-01" }).from).toBe("2026-09-01T00:00:00.000Z");
    expect(() => parseEvidenceExportFilters({ from: "2026-09-01", to: "2026-10-02" })).toThrow();
  });
});

describe("gate evidence CSV", () => {
  it("contains only the approved display columns", () => {
    const csv = buildAccessEvidenceCsv([event]);

    expect(csv).toContain("decision,reason_code,direction");
    expect(csv).not.toMatch(/token|secret|phone|credential/i);
  });

  it.each(["=2+2", "+SUM(A1:A2)", "-4+5", "@cmd"])(
    "neutralizes spreadsheet formula cell %s",
    (guestName) => {
      const csv = buildAccessEvidenceCsv([{ ...event, guestName }]);
      expect(csv).toContain(`'${guestName}`);
      expect(csv).not.toContain(`,${guestName},`);
    },
  );

  it("quotes commas, quotes, and line breaks", () => {
    const csv = buildAccessEvidenceCsv([{ ...event, guestName: 'Doe, "Jane"\nGuest' }]);
    expect(csv).toContain('"Doe, ""Jane""\nGuest"');
  });
});

describe("occupancy warning classification", () => {
  it("flags long stays and passes that expired while the visitor remains inside", () => {
    expect(getOccupancyWarnings({
      enteredAt: "2026-09-24T20:00:00.000Z",
      validUntil: "2026-09-25T08:00:00.000Z",
      now: new Date("2026-09-25T10:00:00.000Z"),
      longStayHours: 12,
    })).toEqual({ longStay: true, expiredInside: true });
  });
});
