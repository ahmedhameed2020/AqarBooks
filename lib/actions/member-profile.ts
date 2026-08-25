"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import { denyIfDemo } from "@/lib/demo/guard";

// Editing a member's own record was never built: createMemberAction was the
// only mutation in the codebase, so an owner's details were write-once. The
// database always allowed it (members_manage is an ALL policy gated on
// property.members.manage) -- only the action was missing.
//
// It is not cosmetic. create_member_invitation refuses any member with neither
// an email nor a phone, and 194 of 309 members have neither, so without this
// action two thirds of owners could never be invited to the portal and no
// screen could tell staff to fix it.

// Deliberately NOT exported. A "use server" module may only export async
// functions -- exporting these arrays makes Next fail at request time with
// "A 'use server' file can only export async functions, found object", which
// `next build` does not catch. Type-only exports below are fine: they are
// erased before the check ever runs.
/** Mirrors members_customer_type_check. */
const CUSTOMER_TYPES = ["B2B", "B2C", "UNRESOLVED"] as const;
/** Mirrors members_identity_document_type_check. */
const IDENTITY_DOCUMENT_TYPES = ["NATIONAL_ID", "PASSPORT"] as const;

// Every editable field, and nothing else. Columns deliberately absent:
// organization_id and user_id (tenancy and portal identity, never a form
// field), and identity_verified_at / identity_verification_source /
// identity_verification_reference -- a verification is an event that happened,
// not an attribute someone types.
const updateSchema = z.object({
  memberId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(200),
  legalName: z.string().trim().max(200).nullable(),
  isCompany: z.boolean(),
  customerType: z.enum(CUSTOMER_TYPES),
  email: z.union([z.string().trim().email().max(200), z.literal("")]).nullable(),
  phone: z.string().trim().max(30).nullable(),
  countryCode: z.string().trim().max(2).nullable(),
  billingAddress: z.string().trim().max(500).nullable(),
  taxRegistrationNumber: z.string().trim().max(50).nullable(),
  identityDocumentType: z.enum(IDENTITY_DOCUMENT_TYPES).nullable(),
  identityDocumentNumber: z.string().trim().max(50).nullable(),
});

export type UpdateMemberInput = z.input<typeof updateSchema>;

export type UpdateMemberResult = { ok: true } | { ok: false; error: string };

/** Empty strings from a form field mean "cleared", not "empty string". */
function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Digits only, keeping a single leading "+" -- same normalisation
// createMemberAction applies, so the (member_id, normalized_phone) uniqueness
// check and the org-wide lookup index stay consistent.
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export async function updateMemberAction(input: UpdateMemberInput): Promise<UpdateMemberResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const data = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();

  // Read the current row first, for two reasons: the update is authorized by
  // the members_manage RLS policy rather than a hand-rolled check, and the
  // audit entry should name what actually changed rather than everything the
  // form submitted.
  const { data: before, error: readError } = await supabase
    .from("members")
    .select(
      "id, organization_id, full_name, legal_name, is_company, customer_type, email, phone, country_code, billing_address, tax_registration_number, identity_document_type, identity_document_number",
    )
    .eq("id", data.memberId)
    .maybeSingle();

  if (readError) {
    console.error("[updateMemberAction] read failed:", readError.message);
    return { ok: false, error: "query_failed" };
  }
  if (!before) return { ok: false, error: "not_found" };

  const next = {
    full_name: data.fullName,
    legal_name: blankToNull(data.legalName),
    is_company: data.isCompany,
    customer_type: data.customerType,
    email: blankToNull(data.email)?.toLowerCase() ?? null,
    phone: blankToNull(data.phone),
    country_code: blankToNull(data.countryCode)?.toUpperCase() ?? null,
    billing_address: blankToNull(data.billingAddress),
    tax_registration_number: blankToNull(data.taxRegistrationNumber),
    identity_document_type: data.identityDocumentType,
    identity_document_number: blankToNull(data.identityDocumentNumber),
  };

  const changed = Object.keys(next).filter(
    (key) => (before as Record<string, unknown>)[key] !== (next as Record<string, unknown>)[key],
  );
  if (changed.length === 0) return { ok: true };

  const { error: updateError } = await supabase
    .from("members")
    // updated_at is applied here rather than in `next` so it stays out of the
    // change comparison above: it differs on every call by construction, and
    // including it would make "nothing changed" impossible to detect.
    .update({ ...next, updated_at: new Date().toISOString() })
    .eq("id", data.memberId);

  if (updateError) {
    // An RLS denial surfaces here rather than as a thrown error, and reads as
    // a generic failure otherwise.
    console.error("[updateMemberAction] update failed:", updateError.message);
    return { ok: false, error: updateError.message };
  }

  // An owner invited before they had an email was linked to a generated
  // placeholder identity (member-<id>@invite.aqarbooks.local). That identity is
  // what members.user_id points at, so writing a real address into
  // members.email alone changes nothing about how they sign in: requesting a
  // code for the real address authenticates a DIFFERENT auth user, whose id
  // matches no member, and the portal refuses them. Staff were being told
  // "add an email so they can recover access", which was simply untrue.
  //
  // So the identity is migrated with the record. Strictly guarded: only when
  // the linked identity is one of our own placeholders. A real address the
  // owner already signs in with is never overwritten from this screen.
  if (next.email && next.email !== before.email) {
    const { data: linked } = await supabase
      .from("members")
      .select("user_id")
      .eq("id", data.memberId)
      .maybeSingle();

    if (linked?.user_id) {
      const admin = createAdminClient();
      const { data: authUser } = await admin.auth.admin.getUserById(linked.user_id);
      const currentAuthEmail = authUser?.user?.email ?? "";

      if (currentAuthEmail.endsWith("@invite.aqarbooks.local")) {
        const { error: migrateError } = await admin.auth.admin.updateUserById(linked.user_id, {
          email: next.email,
          // Staff vouched for this address by entering it; requiring the owner
          // to confirm an address they cannot yet reach would deadlock them.
          email_confirm: true,
        });

        if (migrateError) {
          // The member record is already saved. Report the part that failed
          // rather than pretending the whole edit did.
          console.error("[updateMemberAction] identity migration failed:", migrateError.message);
          return { ok: false, error: "identity_migration_failed" };
        }

        await supabase.from("platform_audit_logs").insert({
          actor_id: user.id,
          organization_id: before.organization_id,
          action: "member.portal_identity_migrated",
          entity_type: "member",
          entity_id: data.memberId,
          safe_change_summary: { from: "synthetic_placeholder", to: "real_email" },
        });
      }
    }
  }

  // members.phone is a legacy single column that create_member_invitation and
  // the WhatsApp reminder flow still read, while member_phones is the source of
  // truth for the full multi-number list. Editing one without the other is how
  // they drift, so the primary entry is kept in step.
  if (next.phone && next.phone !== before.phone) {
    const { data: primaryRow } = await supabase
      .from("member_phones")
      .select("id")
      .eq("member_id", data.memberId)
      .eq("is_primary", true)
      .maybeSingle();

    if (primaryRow) {
      await supabase
        .from("member_phones")
        .update({ phone_number: next.phone, normalized_phone: normalizePhone(next.phone) })
        .eq("id", primaryRow.id);
    } else {
      await supabase.from("member_phones").insert({
        organization_id: before.organization_id,
        member_id: data.memberId,
        phone_number: next.phone,
        normalized_phone: normalizePhone(next.phone),
        label: "PERSONAL",
        is_primary: true,
        can_receive_whatsapp: true,
      });
    }
  }

  // Field NAMES only. The values here include tax and identity-document
  // numbers, and an audit trail is not a place to copy them to.
  const { error: auditError } = await supabase.from("platform_audit_logs").insert({
    actor_id: user.id,
    organization_id: before.organization_id,
    action: "member.profile_updated",
    entity_type: "member",
    entity_id: data.memberId,
    safe_change_summary: { fields: changed },
  });
  if (auditError) {
    // The edit itself already succeeded; a missing audit row must not be
    // reported to the user as a failed save.
    console.error("[updateMemberAction] audit insert failed:", auditError.message);
  }

  revalidatePath("/[locale]/members/[memberId]", "page");
  revalidatePath("/[locale]/members", "page");
  return { ok: true };
}
