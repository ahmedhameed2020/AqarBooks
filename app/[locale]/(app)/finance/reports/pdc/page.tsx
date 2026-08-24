import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { CreditCard, AlertCircle } from "lucide-react";
import { PdcClient, type PdcChequeRow } from "./pdc-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "سجل الشيكات الآجلة وأوراق القبض (PDC Register) — AqarBooks"
      : "Post-Dated Cheques (PDC) Register — AqarBooks",
    description: isAr
      ? "حوكمة أوراق القبض والشيكات البنكية تحت التحصيل ومراقبة مواعيد الاستحقاق والسيولة النقدية القادمة."
      : "Post-dated cheques register tracking incoming and outgoing cheques, maturity dates, and clearance status.",
  };
}

export default async function PdcReportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const canRead = await hasPermission(organization.id, "finance.reports.read") ||
                  await hasPermission(organization.id, "finance.payments.read");

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "سجل الشيكات الآجلة (PDC)" : "PDC Cheques Register"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض سجل الشيكات وأوراق القبض."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // Fetch cheques with bank details
  const { data: chequesData } = await supabase
    .from("cheques")
    .select(
      "id, cheque_number, amount, due_date, status, direction, created_at, member_id, members(full_name), bank_accounts(banks(name_ar, name_en))"
    )
    .eq("organization_id", organization.id)
    .order("due_date", { ascending: true });

  const rows: PdcChequeRow[] = (chequesData || []).map((c) => {
    // cheques reach a bank through bank_accounts, and carry no drawer/beneficiary
    // of their own — for an incoming cheque the member is the drawer and the
    // organization the beneficiary, and the reverse for an outgoing one.
    const account = c.bank_accounts as unknown as
      | { banks?: { name_ar?: string; name_en?: string } | null }
      | null;
    const bank = account?.banks ?? null;
    const member = c.members as unknown as { full_name?: string } | null;
    const memberName = member?.full_name || "—";
    const direction = c.direction || "INCOMING";
    return {
      id: c.id,
      number: c.cheque_number,
      amount: Number(c.amount || 0),
      dueDate: c.due_date,
      status: c.status || "RECEIVED",
      type: direction,
      drawerName: direction === "INCOMING" ? memberName : organization.name,
      beneficiaryName: direction === "INCOMING" ? organization.name : memberName,
      bankName: (isAr ? bank?.name_ar : bank?.name_en) || bank?.name_ar || "البنك الرئيسي",
      createdAt: c.created_at ? c.created_at.slice(0, 10) : "—",
    };
  });

  return (
    <PdcClient
      initialRows={rows}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
