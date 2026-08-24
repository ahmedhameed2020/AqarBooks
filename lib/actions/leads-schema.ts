import { z } from "zod";

/* Validation contract for the public demo-lead form. This lives outside
   `lib/actions/leads.ts` because that file carries the "use server"
   directive, and a "use server" module may only export async functions --
   exporting a schema from it is a build error. Keeping it here also makes
   the allow-lists directly unit-testable without touching Supabase. */

// Commercial qualification captured by the demo form. These are stable slugs,
// never display labels, so the stored value does not depend on the locale the
// visitor happened to be browsing in. The client Select only constrains what a
// cooperating browser sends; this enum is the actual gate -- anything outside
// it fails `safeParse` and the action returns `invalid_input`.
export const ENTITY_TYPES = [
  "resort",
  "tower",
  "compound",
  "hoa",
  "property_management",
  "development",
  "other",
] as const;

export const UNIT_RANGES = ["lt_100", "100_300", "301_500", "501_1500", "gt_1500"] as const;

export const UNIT_RANGE_LABELS: Record<(typeof UNIT_RANGES)[number], string> = {
  lt_100: "<100",
  "100_300": "100-300",
  "301_500": "301-500",
  "501_1500": "501-1500",
  gt_1500: ">1500",
};

export const demoLeadSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  company: z.string().trim().max(200).optional(),
  roleTitle: z.string().trim().max(120).optional(),
  organizationName: z.string().trim().max(200).optional(),
  unitsCount: z.coerce.number().int().nonnegative().max(1_000_000).optional(),
  entityType: z.enum(ENTITY_TYPES).optional(),
  unitRange: z.enum(UNIT_RANGES).optional(),
  gatesCount: z.coerce.number().int().nonnegative().max(1_000).optional(),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  preferredContactMethod: z.enum(["email", "phone"]).optional(),
  message: z.string().trim().max(2000).optional(),
  // Honeypot: real users never see or fill this field (hidden via CSS).
  website: z.string().max(0).optional(),
});
