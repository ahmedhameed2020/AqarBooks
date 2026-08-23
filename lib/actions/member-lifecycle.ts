"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";

// Retiring an owner, and the narrow case where erasing one is actually safe.
//
// public.members is pointed at by two kinds of foreign key, and both rule out a
// plain delete button:
//
//   NO ACTION  payments, cheques, unit_leases, installment_plans, tax_decisions
//              -> the delete is refused outright
//   CASCADE    unit_ownerships, member_documents, member_phones,
//              member_invitations, member_tag_assignments,
//              member_activity_log, online_payment_transactions
//              -> the delete silently takes these with it
//
// And `dues` hangs off the UNIT rather than the member, so cascading away
// unit_ownerships strands live dues in the ledger with no owner attached --
// debts that no statement and no portal would ever surface again.
//
// So archiving is the ordinary operation, and deletion is offered only for a
// record that demonstrably touched nothing. The counts below are what decides
// that, and they are read before the button is ever enabled.

export interface MemberDependencies {
  /** Rows that make deletion impossible at the database level. */
  blocking: { payments: number; cheques: number; leases: number; plans: number; taxDecisions: number };
  /**
   * Rows that cascade and whose loss actually matters: ownership links strand
   * dues in the ledger, documents orphan their files in storage, and online
   * transactions are payment history.
   */
  destructive: { ownerships: number; documents: number; onlineTransactions: number };
  /**
   * Rows that also cascade but carry nothing worth keeping once the member is
   * gone -- a phone number and an invitation are addressed TO this member and
   * mean nothing without them. Counting these as blockers made any owner who
   * had ever been invited permanently undeletable, which is not a guard, just
   * a dead button.
   */
  harmless: { phones: number; invitations: number };
  /** Live dues on the units this member owns -- orphaned, not deleted. */
  duesOnOwnedUnits: number;
  /** A live portal account is not an empty record. */
  hasPortalAccess: boolean;
  /** True only when nothing blocking, destructive or portal-linked exists. */
  safeToDelete: boolean;
  isArchived: boolean;
  fullName: string;
}

export type DependenciesResult =
  | { ok: true; dependencies: MemberDependencies }
  | { ok: false; error: string };

export type LifecycleResult = { ok: true } | { ok: false; error: string };

/**
 * Resolves the caller, proves they can see this member through their own
 * session (which proves org membership), and checks the manage permission.
 * Returns the member's organization on success.
 */
async function authorize(memberId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "unauthenticated" };

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("members")
    .select("id, organization_id, full_name, archived_at, user_id")
    .eq("id", memberId)
    .maybeSingle();

  if (!member) return { ok: false as const, error: "not_found" };

  const { data: permitted } = await supabase.rpc("has_permission", {
    p_user_id: user.id,
    p_organization_id: member.organization_id,
    p_permission_key: "property.members.manage",
  });
  if (!permitted) return { ok: false as const, error: "forbidden" };

  return { ok: true as const, user, supabase, member };
}

// Narrow union rather than `string`: the typed client only accepts literal
// table names, and spelling one wrong should fail the build, not at runtime.
type CountableTable =
  | "payments"
  | "cheques"
  | "unit_leases"
  | "installment_plans"
  | "tax_decisions"
  | "unit_ownerships"
  | "member_documents"
  | "online_payment_transactions"
  | "member_phones"
  | "member_invitations";

async function countRows(
  admin: ReturnType<typeof createAdminClient>,
  table: CountableTable,
  column: string,
  memberId: string,
): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, memberId);
  if (error) {
    // A count that failed is not a count of zero. Report it as "something is
    // there" so nothing is deleted on the strength of a failed query.
    console.error(`[member-lifecycle] count failed on ${table}:`, error.message);
    return -1;
  }
  return count ?? 0;
}

export async function getMemberDependenciesAction(memberId: string): Promise<DependenciesResult> {
  if (!z.string().uuid().safeParse(memberId).success) return { ok: false, error: "invalid_input" };

  const auth = await authorize(memberId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();

  const [payments, cheques, leases, plans, taxDecisions, ownerships, documents, onlineTransactions, phones, invitations] =
    await Promise.all([
      countRows(admin, "payments", "member_id", memberId),
      countRows(admin, "cheques", "member_id", memberId),
      countRows(admin, "unit_leases", "tenant_member_id", memberId),
      countRows(admin, "installment_plans", "buyer_member_id", memberId),
      countRows(admin, "tax_decisions", "buyer_member_id", memberId),
      countRows(admin, "unit_ownerships", "member_id", memberId),
      countRows(admin, "member_documents", "member_id", memberId),
      countRows(admin, "online_payment_transactions", "member_id", memberId),
      countRows(admin, "member_phones", "member_id", memberId),
      countRows(admin, "member_invitations", "member_id", memberId),
    ]);

  // Dues attach to units, so they are counted through the ownership links.
  const { data: ownedUnits } = await admin
    .from("unit_ownerships")
    .select("unit_id")
    .eq("member_id", memberId);
  const unitIds = [...new Set((ownedUnits ?? []).map((o) => o.unit_id))];

  let duesOnOwnedUnits = 0;
  if (unitIds.length > 0) {
    const { count } = await admin
      .from("dues")
      .select("id", { count: "exact", head: true })
      .in("unit_id", unitIds)
      .neq("status", "VOID");
    duesOnOwnedUnits = count ?? 0;
  }

  const hasPortalAccess = auth.member.user_id !== null;

  // Only the counts that represent something worth protecting gate the delete.
  // A -1 (failed count) is not zero, so a query that errored blocks deletion
  // too -- which is the intended reading.
  const gating = [
    payments, cheques, leases, plans, taxDecisions,
    ownerships, documents, onlineTransactions,
    duesOnOwnedUnits,
  ];

  return {
    ok: true,
    dependencies: {
      blocking: { payments, cheques, leases, plans, taxDecisions },
      destructive: { ownerships, documents, onlineTransactions },
      harmless: { phones, invitations },
      duesOnOwnedUnits,
      hasPortalAccess,
      safeToDelete: gating.every((n) => n === 0) && !hasPortalAccess,
      isArchived: auth.member.archived_at !== null,
      fullName: auth.member.full_name,
    },
  };
}

const archiveSchema = z.object({
  memberId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
});

export async function archiveMemberAction(input: {
  memberId: string;
  reason: string;
}): Promise<LifecycleResult> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "reason_required" };

  const auth = await authorize(parsed.data.memberId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.supabase
    .from("members")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: auth.user.id,
      archive_reason: parsed.data.reason,
    })
    .eq("id", parsed.data.memberId);

  if (error) {
    console.error("[archiveMemberAction] failed:", error.message);
    return { ok: false, error: error.message };
  }

  await auth.supabase.from("platform_audit_logs").insert({
    actor_id: auth.user.id,
    organization_id: auth.member.organization_id,
    action: "member.archived",
    entity_type: "member",
    entity_id: parsed.data.memberId,
    safe_change_summary: { reason: parsed.data.reason },
  });

  revalidatePath("/[locale]/members", "page");
  revalidatePath("/[locale]/members/[memberId]", "page");
  return { ok: true };
}

export async function restoreMemberAction(memberId: string): Promise<LifecycleResult> {
  if (!z.string().uuid().safeParse(memberId).success) return { ok: false, error: "invalid_input" };

  const auth = await authorize(memberId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.supabase
    .from("members")
    .update({ archived_at: null, archived_by: null, archive_reason: null })
    .eq("id", memberId);

  if (error) return { ok: false, error: error.message };

  await auth.supabase.from("platform_audit_logs").insert({
    actor_id: auth.user.id,
    organization_id: auth.member.organization_id,
    action: "member.restored",
    entity_type: "member",
    entity_id: memberId,
    safe_change_summary: {},
  });

  revalidatePath("/[locale]/members", "page");
  revalidatePath("/[locale]/members/[memberId]", "page");
  return { ok: true };
}

/**
 * Permanent deletion, allowed only for a record with no dependents at all.
 * The dependency check is repeated here rather than trusted from the client:
 * the dialog's copy is a courtesy, this is the actual gate.
 */
export async function deleteMemberAction(memberId: string): Promise<LifecycleResult> {
  if (!z.string().uuid().safeParse(memberId).success) return { ok: false, error: "invalid_input" };

  const auth = await authorize(memberId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const deps = await getMemberDependenciesAction(memberId);
  if (!deps.ok) return { ok: false, error: deps.error };
  if (!deps.dependencies.safeToDelete) return { ok: false, error: "has_dependencies" };

  const { error } = await auth.supabase.from("members").delete().eq("id", memberId);
  if (error) {
    console.error("[deleteMemberAction] failed:", error.message);
    return { ok: false, error: error.message };
  }

  await auth.supabase.from("platform_audit_logs").insert({
    actor_id: auth.user.id,
    organization_id: auth.member.organization_id,
    action: "member.deleted",
    entity_type: "member",
    entity_id: memberId,
    // The row is gone; the name is the only thing that makes this entry
    // legible afterwards, and it is not sensitive.
    safe_change_summary: { full_name: auth.member.full_name },
  });

  revalidatePath("/[locale]/members", "page");
  return { ok: true };
}
