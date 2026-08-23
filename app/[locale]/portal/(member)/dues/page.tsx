import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import type { DueDbRow } from "@/lib/portal/row-types";
import { agingBucketOf, daysOverdue, type OutstandingDue } from "@/lib/portal/portal-finance";
import { DuesCheckout } from "./dues-checkout";

type AllocationRow = {
  due_id: string;
  amount: number;
  reversed_at: string | null;
};

export default async function PortalDuesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const supabase = await createClient();
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const { member } = ctx;

  const [{ data: orgDisplay }, { data: duesData, error: duesError }] = await Promise.all([
    supabase.rpc("get_own_organization_display").maybeSingle(),
    supabase
      .from("dues")
      .select("id, amount, issue_date, due_date, description, status, units(code)")
      .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])
      .order("due_date", { ascending: true }),
  ]);

  if (duesError) console.error("[PortalDuesPage] dues query failed:", duesError.message);

  const dues = (duesData ?? []) as unknown as DueDbRow[];

  // `dues.amount` is what was originally charged and is never reduced when a
  // payment lands, so a PARTIALLY_PAID due would otherwise be presented to the
  // owner at its gross value. What it still costs is the charge minus every
  // non-reversed allocation against it. payment_allocations RLS already limits
  // this read to the member's own POSTED payments; the reversed_at filter
  // covers allocations unwound after the fact.
  const paidByDue = new Map<string, number>();
  if (dues.length > 0) {
    const { data: allocationData, error: allocationError } = await supabase
      .from("payment_allocations")
      .select("due_id, amount, reversed_at")
      .in(
        "due_id",
        dues.map((d) => d.id),
      );

    if (allocationError) {
      console.error("[PortalDuesPage] allocations query failed:", allocationError.message);
    }

    for (const a of (allocationData ?? []) as unknown as AllocationRow[]) {
      if (a.reversed_at) continue;
      paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + Number(a.amount));
    }
  }

  const today = new Date();
  const items: OutstandingDue[] = dues.map((d) => {
    const amount = Number(d.amount);
    const paid = paidByDue.get(d.id) ?? 0;
    // Clamped: an over-allocation (credit sitting on the due) is not a
    // negative amount owed, it is nothing owed.
    const outstanding = Math.max(amount - paid, 0);
    return {
      id: d.id,
      amount,
      paid,
      outstanding,
      issue_date: d.issue_date,
      due_date: d.due_date,
      description: d.description,
      status: d.status,
      unitCode: d.units?.code ?? null,
      bucket: agingBucketOf(d.due_date, today),
      daysOverdue: daysOverdue(d.due_date, today),
      isPartiallySettled: paid > 0,
    };
  });

  return (
    <DuesCheckout
      dues={items}
      organizationName={orgDisplay?.name ?? "AqarBooks"}
      currency={orgDisplay?.default_currency ?? "EGP"}
      memberName={member.full_name ?? ""}
      locale={locale}
    />
  );
}
