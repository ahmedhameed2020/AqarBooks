import { describe, it, expect } from "vitest";
import {
  TENANT_BACKUP_TABLE_CLASSIFICATION_V1,
  EXTRACTION_LAYER_ORDER,
  classifyTable,
  assertKnownTableSet,
  UnknownTableError,
} from "@/lib/backup/table-classification";

describe("tenant backup table classification v1 — reconciles to Phase 0's closed inventory", () => {
  it("has exactly 104 entries, matching the live public-schema base-table count found in Phase 0", () => {
    expect(TENANT_BACKUP_TABLE_CLASSIFICATION_V1.length).toBe(104);
  });

  it("partitions into the exact counts proven in the Phase 0 closure addendum (1+82+9+9+2+1=104)", () => {
    const counts: Record<string, number> = {};
    for (const e of TENANT_BACKUP_TABLE_CLASSIFICATION_V1) {
      counts[e.classification] = (counts[e.classification] ?? 0) + 1;
    }
    expect(counts.TENANT_ROOT).toBe(1);
    expect(counts.TENANT_OWNED_DIRECT).toBe(82);
    expect(counts.TENANT_OWNED_INDIRECT).toBe(9);
    expect(counts.GLOBAL_REFERENCE).toBe(9);
    expect(counts.PLATFORM_INTERNAL).toBe(2);
    expect(counts.AUTH_IDENTITY).toBe(1);
    const sum = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(104);
  });

  it("has no duplicate table names", () => {
    const names = TENANT_BACKUP_TABLE_CLASSIFICATION_V1.map((e) => e.table);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every TENANT_OWNED_INDIRECT entry documents its FK chain to a tenant-owned ancestor", () => {
    const indirect = TENANT_BACKUP_TABLE_CLASSIFICATION_V1.filter(
      (e) => e.classification === "TENANT_OWNED_INDIRECT"
    );
    expect(indirect.length).toBe(9);
    for (const e of indirect) {
      expect(e.tenantPath).toBeTruthy();
    }
  });

  it("GLOBAL_REFERENCE tables are never dispositioned INCLUDE", () => {
    const globals = TENANT_BACKUP_TABLE_CLASSIFICATION_V1.filter(
      (e) => e.classification === "GLOBAL_REFERENCE"
    );
    expect(globals.length).toBe(9);
    for (const e of globals) {
      expect(e.disposition).toBe("EXCLUDE_RESOLVE_BY_ID");
    }
  });

  it("PLATFORM_INTERNAL and AUTH_IDENTITY tables are never dispositioned INCLUDE", () => {
    const excluded = TENANT_BACKUP_TABLE_CLASSIFICATION_V1.filter((e) =>
      ["PLATFORM_INTERNAL", "AUTH_IDENTITY"].includes(e.classification)
    );
    expect(excluded.length).toBe(3);
    for (const e of excluded) {
      expect(e.disposition).toBe("EXCLUDE_ENTIRELY");
    }
  });

  it("organizations is TENANT_ROOT with REFERENCE_ONLY disposition, not INCLUDE", () => {
    const org = classifyTable("organizations");
    expect(org.classification).toBe("TENANT_ROOT");
    expect(org.disposition).toBe("REFERENCE_ONLY");
  });
});

describe("classifyTable — fail-closed lookup", () => {
  it("returns the entry for a known table", () => {
    expect(classifyTable("dues").classification).toBe("TENANT_OWNED_DIRECT");
    expect(classifyTable("journal_entry_lines").classification).toBe("TENANT_OWNED_INDIRECT");
  });

  it("throws UnknownTableError for a table it doesn't recognize, rather than guessing", () => {
    expect(() => classifyTable("not_a_real_table")).toThrow(UnknownTableError);
  });
});

describe("assertKnownTableSet — fail-closed schema-drift guard", () => {
  it("passes for exactly the known 104-table set", () => {
    const names = TENANT_BACKUP_TABLE_CLASSIFICATION_V1.map((e) => e.table);
    expect(() => assertKnownTableSet(names)).not.toThrow();
  });

  it("fails closed when a live table isn't in the classification (new/unclassified table)", () => {
    const names = [...TENANT_BACKUP_TABLE_CLASSIFICATION_V1.map((e) => e.table), "some_new_table"];
    expect(() => assertKnownTableSet(names)).toThrow(UnknownTableError);
  });

  it("fails closed when the classification references a table no longer live (stale map)", () => {
    const names = TENANT_BACKUP_TABLE_CLASSIFICATION_V1.map((e) => e.table).filter(
      (t) => t !== "dues"
    );
    expect(() => assertKnownTableSet(names)).toThrow(/no longer present/);
  });
});

describe("EXTRACTION_LAYER_ORDER", () => {
  it("contains exactly the tables dispositioned INCLUDE — no more, no fewer", () => {
    const includeTables = new Set(
      TENANT_BACKUP_TABLE_CLASSIFICATION_V1.filter((e) => e.disposition === "INCLUDE").map(
        (e) => e.table
      )
    );
    const orderTables = new Set(EXTRACTION_LAYER_ORDER);

    const missingFromOrder = [...includeTables].filter((t) => !orderTables.has(t));
    const extraInOrder = [...orderTables].filter((t) => !includeTables.has(t));

    expect(missingFromOrder).toEqual([]);
    expect(extraInOrder).toEqual([]);
    expect(EXTRACTION_LAYER_ORDER.length).toBe(includeTables.size);
  });

  it("has no duplicate entries", () => {
    expect(new Set(EXTRACTION_LAYER_ORDER).size).toBe(EXTRACTION_LAYER_ORDER.length);
  });

  it("places every TENANT_OWNED_INDIRECT table after the direct parent named in its tenantPath", () => {
    const indexOf = new Map(EXTRACTION_LAYER_ORDER.map((t, i) => [t, i]));
    const indirect = TENANT_BACKUP_TABLE_CLASSIFICATION_V1.filter(
      (e) => e.classification === "TENANT_OWNED_INDIRECT"
    );
    for (const e of indirect) {
      // tenantPath looks like "cheque_id -> cheques.organization_id" — extract the parent table name.
      const match = e.tenantPath?.match(/->\s*(\w+)\./);
      expect(match, `no parent table parsed from tenantPath for ${e.table}`).toBeTruthy();
      const parent = match![1]!;
      expect(indexOf.has(parent), `${parent} missing from EXTRACTION_LAYER_ORDER`).toBe(true);
      expect(
        indexOf.get(e.table)!,
        `${e.table} must be ordered after its parent ${parent}`
      ).toBeGreaterThan(indexOf.get(parent)!);
    }
  });
});
