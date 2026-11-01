import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { loadOwnPosition } from "@/lib/portal/own-position";
import { PortalStatementClient, type PortalStatementMovement } from "./portal-statement-client";
import { assertRead } from "@/lib/supabase/assert-read";

type PaymentRow = {
  payment_id: string;
  amount: number;
  payment_date: string;
  receipt_no: string | null;
  receipt_number: number | null;
  unit_id: string | null;
  status: string;
  reversed_on: string | null;
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
    { data: memoData },
    { data: applicationData, error: applicationError },
    { data: settlementData, error: settlementError },
    { data: unitsData, error: unitsError },
  ] = await Promise.all([
    supabase.rpc("get_own_organization_display").maybeSingle(),
    // The statement's dues: every route owner RLS grants, plus dues charged while this member owned the unit and dues their own receipts
    // allocated to (a member whose ownership ended keeps the history of what they were charged and paid). Migration 20261017100700.
    supabase.rpc("own_statement_dues", { p_org: member.organization_id, p_as_of: new Date().toISOString().slice(0, 10) }),
    // History-bounded reads: owner RLS only exposes POSTED receipts, so a receipt voided later would vanish from the periods in which it
    // really reduced the balance. These two functions return only the signed-in owner's own rows (see migration 20261017100500).
    supabase.rpc("own_statement_receipts", { p_org: member.organization_id }),
    supabase.from("payments").select("id, memo").eq("member_id", member.id),
    supabase.rpc("own_credit_application_lines", { p_org: member.organization_id }),
    // settlements of those dues by receipts of OTHER payers (a previous owner...): dated amounts only, never whose receipt
    supabase.rpc("own_due_settlement_lines", { p_org: member.organization_id }),
    supabase.from("units_with_financials").select("id, code"),
  ]);

  // A statement with a missing section is worse than no statement: it would show a balance that is not the balance.
  assertRead(duesError, "portal/statement: own_statement_dues");
  assertRead(paymentsError, "portal/statement: own_statement_receipts");
  assertRead(applicationError, "portal/statement: own_credit_application_lines");
  assertRead(settlementError, "portal/statement: own_due_settlement_lines");
  assertRead(unitsError, "portal/statement: units_with_financials");

  // payments.unit_id is resolved against a separate units read rather than a
  // PostgREST embed: the embed would add a join whose FK naming the portal has
  // no other reason to depend on, and the member's unit list is a handful of
  // rows either way.
  const unitCodeById = new Map<string, string>(
    ((unitsData ?? []) as { id: string; code: string }[]).map((u) => [u.id, u.code]),
  );

  const dues = (duesData ?? []).map((d) => ({ id: d.due_id, amount: d.amount, issue_date: d.issue_date, description: d.description, unit_id: d.unit_id, unit_code: d.unit_code }));
  for (const d of dues) if (d.unit_code && !unitCodeById.has(d.unit_id)) unitCodeById.set(d.unit_id, d.unit_code);
  const payments = (paymentsData ?? []) as unknown as PaymentRow[];
  const memoById = new Map(((memoData ?? []) as { id: string; memo: string | null }[]).map((m) => [m.id, m.memo]));

  // Credit applications and their reversals, shown as two separate informational lines (net effect on the balance: zero), each at
  // its own date. The reader returns applications of receipts voided later too, so the history stays complete.
  const receiptRef = new Map(payments.map((p) => [p.payment_id, p.receipt_no || (p.receipt_number ? `REC-${p.receipt_number}` : null)]));
  const dueById = new Map(dues.map((d) => [d.id, d]));
  const infoLines: PortalStatementMovement[] = (applicationData ?? []).flatMap((a) => {
    const due = dueById.get(a.due_id);
    const what = due?.description ?? (isAr ? "مطالبة" : "charge");
    const base = { unitCode: due?.unit_code ?? null, reference: receiptRef.get(a.payment_id) ?? null, amount: Number(a.amount) };
    const lines: PortalStatementMovement[] = [
      { ...base, id: `app-${a.allocation_id}`, date: a.applied_on, kind: "APPLICATION", description: isAr ? `تطبيق رصيد مقدم على: ${what}` : `Advance credit applied to: ${what}` },
    ];
    if (a.reversed_on) lines.push({ ...base, id: `rev-${a.allocation_id}`, date: a.reversed_on, kind: "REVERSAL", description: isAr ? `عكس تطبيق الرصيد على: ${what}` : `Credit application reversed: ${what}` });
    return lines;
  });

  // A voided receipt stays a payment on its own date and is reversed by a separate financial movement dated at the actual reversal
  // entry, so every running balance before that date still includes it and every one after it does not.
  const receiptLines: PortalStatementMovement[] = payments.flatMap((p) => {
    const ref = p.receipt_no || (p.receipt_number ? `REC-${p.receipt_number}` : null);
    const unitCode = p.unit_id ? (unitCodeById.get(p.unit_id) ?? null) : null;
    const lines: PortalStatementMovement[] = [
      {
        id: `pay-${p.payment_id}`, date: p.payment_date, kind: "PAYMENT", unitCode, reference: ref, amount: Number(p.amount),
        description: memoById.get(p.payment_id)?.trim() || (isAr ? "سند سداد معتمد" : "Posted receipt"),
      },
    ];
    if (p.status === "REVERSED" && p.reversed_on) {
      lines.push({
        id: `payrev-${p.payment_id}`, date: p.reversed_on, kind: "PAYMENT_REVERSAL", unitCode, reference: ref, amount: Number(p.amount),
        description: isAr ? "عكس سند السداد (إلغاء الإيصال)" : "Receipt reversed (voided)",
      });
    }
    return lines;
  });

  // Credit left on a receipt whose member is no longer linked to the unit is shown to ITS member as "on hold" (never to the new owner:
  // the balance view only returns the signed-in member's own receipts).
  const { data: creditRows } = await supabase.from("payment_credit_balances").select("remaining_amount, is_stranded").eq("member_id", member.id);
  const creditStranded = (creditRows ?? []).some((c) => c.is_stranded && Number(c.remaining_amount) > 0);

  // Dues settled by someone else's receipt: a credit line at the settlement date (and a debit line if it was undone), amount only.
  const settlementLines: PortalStatementMovement[] = (settlementData ?? []).flatMap((a) => {
    const due = dueById.get(a.due_id);
    const what = due?.description ?? (isAr ? "مطالبة" : "charge");
    const base = { unitCode: due?.unit_code ?? null, reference: null, amount: Number(a.amount) };
    const lines: PortalStatementMovement[] = [
      { ...base, id: `set-${a.allocation_id}`, date: a.applied_on, kind: "SETTLEMENT", description: isAr ? `تسوية مطالبة سُدّدت من طرف آخر: ${what}` : `Charge settled by another payer: ${what}` },
    ];
    if (a.reversed_on) lines.push({ ...base, id: `setrev-${a.allocation_id}`, date: a.reversed_on, kind: "SETTLEMENT_REVERSAL", description: isAr ? `عكس تسوية: ${what}` : `Settlement reversed: ${what}` });
    return lines;
  });

  const today = new Date().toISOString().slice(0, 10);
  const position = await loadOwnPosition(supabase, member.organization_id, member.id, today);

  const movements: PortalStatementMovement[] = [
    ...dues.map((d) => ({
      id: `due-${d.id}`,
      date: d.issue_date,
      kind: "CHARGE" as const,
      description: d.description ?? (isAr ? "استحقاق مالي دوري" : "Periodic due"),
      unitCode: d.unit_code ?? null,
      reference: null,
      amount: Number(d.amount),
    })),
    ...settlementLines,
    ...receiptLines,
    ...infoLines,
  ]
    // Oldest first: a running balance only reads as proof if it accumulates in
    // the direction time moves. The client reverses for display when asked.
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  return (
    <PortalStatementClient
      position={position}
      creditStranded={creditStranded}
      organizationName={orgDisplay?.name ?? "AqarBooks"}
      currency={orgDisplay?.default_currency ?? "EGP"}
      memberName={member.full_name ?? ""}
      movements={movements}
      unitCodes={[...new Set(movements.map((m) => m.unitCode).filter((c): c is string => !!c))].sort()}
      locale={locale}
    />
  );
}
