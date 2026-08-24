import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPES,
  UNIT_RANGES,
  UNIT_RANGE_LABELS,
  demoLeadSchema,
} from "@/lib/actions/leads-schema";

/**
 * Pricing v1.0 QA item 4.
 *
 * The public demo form is the only lead-capture surface the pricing CTAs feed,
 * and it now carries two commercial qualification answers (entity type, unit
 * range). The `<Select>` elements constrain nothing an attacker has to obey --
 * a hand-rolled POST can carry any string. `submitDemoLeadAction` runs every
 * field through `demoLeadSchema.safeParse` and returns `invalid_input` the
 * moment it fails, so these tests pin the allow-list to that schema.
 *
 * Pure unit tests: no Supabase, no network.
 */

const validBase = {
  fullName: "Ahmed Mohamed",
  email: "ahmed@example.com",
  phone: "+20 100 000 0000",
  organizationName: "Nile Towers",
  website: "",
};

describe("demo lead qualification allow-lists", () => {
  it("accepts every entity type the form can offer", () => {
    for (const entityType of ENTITY_TYPES) {
      const result = demoLeadSchema.safeParse({ ...validBase, entityType });
      expect(result.success, `entityType=${entityType}`).toBe(true);
    }
  });

  it("accepts every unit range the form can offer", () => {
    for (const unitRange of UNIT_RANGES) {
      const result = demoLeadSchema.safeParse({ ...validBase, unitRange });
      expect(result.success, `unitRange=${unitRange}`).toBe(true);
    }
  });

  it("rejects an entity type outside the allow-list", () => {
    for (const entityType of ["", "hotel", "RESORT", "resort; drop table", "__proto__", "0"]) {
      const result = demoLeadSchema.safeParse({ ...validBase, entityType });
      expect(result.success, `entityType=${JSON.stringify(entityType)}`).toBe(false);
    }
  });

  it("rejects a unit range outside the allow-list", () => {
    for (const unitRange of ["", "1_50", "301-500", "gt_9999", "<script>", "500"]) {
      const result = demoLeadSchema.safeParse({ ...validBase, unitRange });
      expect(result.success, `unitRange=${JSON.stringify(unitRange)}`).toBe(false);
    }
  });

  it("rejects non-string tampering (arrays, objects, numbers)", () => {
    for (const value of [["resort"], { value: "resort" }, 1, true, null]) {
      expect(demoLeadSchema.safeParse({ ...validBase, entityType: value }).success).toBe(false);
      expect(demoLeadSchema.safeParse({ ...validBase, unitRange: value }).success).toBe(false);
    }
  });

  it("treats both fields as optional so an omitted answer is not an error", () => {
    expect(demoLeadSchema.safeParse(validBase).success).toBe(true);
    expect(
      demoLeadSchema.safeParse({ ...validBase, entityType: undefined, unitRange: undefined })
        .success,
    ).toBe(true);
  });

  it("keeps preferred_contact_method inside the values the DB CHECK allows", () => {
    // demo_leads_preferred_contact_method_check permits only these two.
    expect(demoLeadSchema.safeParse({ ...validBase, preferredContactMethod: "phone" }).success).toBe(true);
    expect(demoLeadSchema.safeParse({ ...validBase, preferredContactMethod: "email" }).success).toBe(true);
    expect(
      demoLeadSchema.safeParse({ ...validBase, preferredContactMethod: "whatsapp" }).success,
    ).toBe(false);
  });

  it("has a display label for every unit range, so none can be stored unlabelled", () => {
    for (const unitRange of UNIT_RANGES) {
      expect(UNIT_RANGE_LABELS[unitRange]).toBeTruthy();
    }
    expect(Object.keys(UNIT_RANGE_LABELS).sort()).toEqual([...UNIT_RANGES].sort());
  });
});
