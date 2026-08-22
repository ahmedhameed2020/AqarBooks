import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import type { DueDbRow, PaymentDbRow } from "@/lib/portal/row-types";
import type { StatementLine } from "@/lib/reports/account-statement-pdf";
import {
  PortalStatementClient,
  type PortalStatementMovement,
} from "./portal-statement-client";

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
  ] = await Promise.all([
    supabase.rpc("get_own_organization_display").maybeSingle(),
    supabase
      .from("dues")
      .select("id, amount, issue_date, due_date, description, status, units(code)")
      .order("issue_date", { ascending: false }),
    supabase
      .from("payments")
      .select("id, amount, payment_date, method, receipt_no, receipt_number")
      .eq("member_id", member.id)
      .order("payment_date", { ascending: false }),
  ]);

  if (duesError) console.error("[PortalStatementPage] dues query failed:", duesError.message);
  if (paymentsError) console.error("[PortalStatementPage] payments query failed:", paymentsError.message);

  const allDues = (duesData ?? []) as unknown as DueDbRow[];
  const payments = (paymentsData ?? []) as unknown as PaymentDbRow[];

  const dues = allDues.filter((d) => d.status !== "VOID");
  const totalDue = dues.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = totalDue - totalPaid;

  const statementLines: StatementLine[] = [
    ...dues.map((d) => ({
      date: d.issue_date,
      kind: "CHARGE" as const,
      description: d.description ?? (isAr ? "استحقاق مالي" : "Due"),
      unitCode: d.units?.code ?? null,
      reference: null,
      amount: Number(d.amount),
    })),
    ...payments.map((p) => ({
      date: p.payment_date,
      kind: "PAYMENT" as const,
      description: isAr ? "سند سداد" : "Payment",
      unitCode: null,
      reference: p.receipt_no || (p.receipt_number ? `REC-${p.receipt_number}` : null),
      amount: Number(p.amount),
    })),
  ];

  const movements: PortalStatementMovement[] = [
    ...dues.map((d) => ({
      id: `due-${d.id}`,
      date: d.issue_date,
      kind: "CHARGE" as const,
      description: d.description ?? (isAr ? "استحقاق مالي دوري" : "Periodic Due"),
      unitCode: d.units?.code ?? null,
      reference: null,
      amount: Number(d.amount),
    })),
    ...payments.map((p) => ({
      id: `pay-${p.id}`,
      date: p.payment_date,
      kind: "PAYMENT" as const,
      description: isAr ? "سند سداد معتمد" : "Posted Receipt",
      unitCode: null,
      reference: p.receipt_no || (p.receipt_number ? `REC-${p.receipt_number}` : null),
      amount: Number(p.amount),
    })),
  ].sort((a, b) => (b.date > a.date ? 1 : -1));

  return (
    <PortalStatementClient
      organizationName={orgDisplay?.name ?? "AqarBooks"}
      currency={orgDisplay?.default_currency ?? "EGP"}
      memberName={member.full_name ?? ""}
      movements={movements}
      statementLines={statementLines}
      totalDue={totalDue}
      totalPaid={totalPaid}
      balance={balance}
      locale={locale}
    />
  );
}
