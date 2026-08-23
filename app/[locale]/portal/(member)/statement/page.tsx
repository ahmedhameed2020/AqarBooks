import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import type { DueDbRow } from "@/lib/portal/row-types";
import { PortalStatementClient, type PortalStatementMovement } from "./portal-statement-client";

type PaymentRow = {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  receipt_no: string | null;
  receipt_number: number | null;
  memo: string | null;
  unit_id: string | null;
};

export default async function PortalStatementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const { member } = ctx;

  const [
    { data: orgDisplay },
    { data: duesData, error: duesError },
    { data: paymentsData, error: paymentsError },
    { data: unitsData, error: unitsError },
  ] = await Promise.all([
    supabase.rpc("get_own_organization_display").maybeSingle(),
    supabase
      .from("dues")
      .select("id, amount, issue_date, due_date, description, status, units(code)")
      .order("issue_date", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount, payment_date, method, receipt_no, receipt_number, memo, unit_id")
      .eq("member_id", member.id)
      .order("payment_date", { ascending: false }),
    supabase.from("units_with_financials").select("id, code"),
  ]);

  if (duesError) console.error("[PortalStatementPage] dues query failed:", duesError.message);
  if (paymentsError)
    console.error("[PortalStatementPage] payments query failed:", paymentsError.message);
  if (unitsError) console.error("[PortalStatementPage] units query failed:", unitsError.message);

  // payments.unit_id is resolved against a separate units read rather than a
  // PostgREST embed: the embed would add a join whose FK naming the portal has
  // no other reason to depend on, and the member's unit list is a handful of
  // rows either way.
  const unitCodeById = new Map<string, string>(
    ((unitsData ?? []) as { id: string; code: string }[]).map((u) => [u.id, u.code]),
  );

  const dues = ((duesData ?? []) as unknown as DueDbRow[]).filter((d) => d.status !== "VOID");
  const payments = (paymentsData ?? []) as unknown as PaymentRow[];

  const movements: PortalStatementMovement[] = [
    ...dues.map((d) => ({
      id: `due-${d.id}`,
      date: d.issue_date,
      kind: "CHARGE" as const,
      description: d.description ?? (isAr ? "استحقاق مالي دوري" : "Periodic due"),
      unitCode: d.units?.code ?? null,
      reference: null,
      amount: Number(d.amount),
    })),
    ...payments.map((p) => ({
      id: `pay-${p.id}`,
      date: p.payment_date,
      kind: "PAYMENT" as const,
      description: p.memo?.trim() || (isAr ? "سند سداد معتمد" : "Posted receipt"),
      unitCode: p.unit_id ? (unitCodeById.get(p.unit_id) ?? null) : null,
      reference: p.receipt_no || (p.receipt_number ? `REC-${p.receipt_number}` : null),
      amount: Number(p.amount),
    })),
  ]
    // Oldest first: a running balance only reads as proof if it accumulates in
    // the direction time moves. The client reverses for display when asked.
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  return (
    <PortalStatementClient
      organizationName={orgDisplay?.name ?? "AqarBooks"}
      currency={orgDisplay?.default_currency ?? "EGP"}
      memberName={member.full_name ?? ""}
      movements={movements}
      unitCodes={[...new Set(movements.map((m) => m.unitCode).filter((c): c is string => !!c))].sort()}
      locale={locale}
    />
  );
}
