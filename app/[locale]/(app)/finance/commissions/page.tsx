import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import {
  AccrueCommissionForm,
  CreateBrokerForm,
  PayCommissionForm,
  type Option,
} from "./commission-forms";

export default async function CommissionsPage({
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

  const [canManage, canRead] = await Promise.all([
    hasPermission(organization.id, "finance.commissions.manage"),
    hasPermission(organization.id, "finance.commissions.read"),
  ]);
  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "عمولات الوسطاء" : "Broker Commissions"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr ? "لا تملك صلاحية الاطلاع على العمولات." : "You don't have permission to view commissions."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: brokers }, { data: commissions }, { data: properties }, { data: accounts }] =
    await Promise.all([
      supabase
        .from("brokers")
        .select("id, name, broker_type, default_wht_rate, is_active")
        .eq("organization_id", organization.id)
        .order("name"),
      supabase
        .from("commissions")
        .select("id, broker_id, gross_amount, wht_amount, net_amount, wht_rate, rate_percent, basis_amount, earned_date, paid_date, status, note")
        .eq("organization_id", organization.id)
        .order("earned_date", { ascending: false }),
      supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", organization.id)
        .order("name"),
      supabase
        .from("chart_of_accounts")
        .select("id, code, name_ar, name_en, category")
        .eq("organization_id", organization.id)
        .eq("is_group", false)
        .eq("is_active", true)
        .in("category", ["ASSET", "LIABILITY"])
        .order("code"),
    ]);

  const brokerName = new Map((brokers ?? []).map((b) => [b.id, b.name]));
  const label = (a: { code: string; name_ar: string; name_en: string }) =>
    `${a.code} — ${isAr ? a.name_ar : a.name_en}`;

  const activeBrokers: Option[] = (brokers ?? [])
    .filter((b) => b.is_active)
    .map((b) => ({ id: b.id, label: b.name }));
  const propertyOptions: Option[] = (properties ?? []).map((p) => ({ id: p.id, label: p.name }));
  const cashAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "ASSET")
    .map((a) => ({ id: a.id, label: label(a) }));
  const liabilityAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "LIABILITY")
    .map((a) => ({ id: a.id, label: label(a) }));

  const fmt = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 3 });

  const outstanding = (commissions ?? [])
    .filter((c) => c.status === "ACCRUED")
    .reduce((s, c) => s + c.net_amount, 0);
  const withheld = (commissions ?? []).reduce((s, c) => s + c.wht_amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "عمولات الوسطاء" : "Broker Commissions"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "العمولة تُسجَّل عند استحقاقها لا عند سدادها، والخصم من المنبع يظل التزامًا حتى تُورَّد الضريبة."
            : "Commission is recorded when earned, not when paid, and withholding stays a liability until the tax is remitted."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{isAr ? "مستحق للوسطاء" : "Owed to brokers"}</p>
          <p className="text-lg font-semibold tabular-nums">{fmt(outstanding)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{isAr ? "خصم منبع محتجز" : "Withheld tax"}</p>
          <p className="text-lg font-semibold tabular-nums">{fmt(withheld)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{isAr ? "الوسطاء" : "Brokers"}</p>
          <p className="text-lg font-semibold tabular-nums">{activeBrokers.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">{isAr ? "عمولات مسجّلة" : "Commissions"}</p>
          <p className="text-lg font-semibold tabular-nums">{(commissions ?? []).length}</p>
        </div>
      </div>

      {canManage && (
        <>
          <div>
            <h2 className="mb-2 text-sm font-medium">{isAr ? "إضافة وسيط" : "Add a broker"}</h2>
            <CreateBrokerForm organizationId={organization.id} locale={locale} />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-medium">
              {isAr ? "تسجيل استحقاق عمولة" : "Accrue a commission"}
            </h2>
            <AccrueCommissionForm
              organizationId={organization.id}
              brokers={activeBrokers}
              properties={propertyOptions}
              liabilityAccounts={liabilityAccounts}
              locale={locale}
            />
          </div>
        </>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الوسيط" : "Broker"}</TableHead>
              <TableHead>{isAr ? "الاستحقاق" : "Earned"}</TableHead>
              <TableHead className="text-end">{isAr ? "الإجمالي" : "Gross"}</TableHead>
              <TableHead className="text-end">{isAr ? "خصم منبع" : "Withheld"}</TableHead>
              <TableHead className="text-end">{isAr ? "الصافي" : "Net"}</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(commissions ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {isAr ? "لا توجد عمولات بعد." : "No commissions yet."}
                </TableCell>
              </TableRow>
            ) : (
              (commissions ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {brokerName.get(c.broker_id) ?? "—"}
                    {c.note && (
                      <span className="ms-2 text-xs text-muted-foreground">{c.note}</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {c.earned_date}
                    {c.rate_percent !== null && (
                      <span className="ms-2 text-xs">
                        {c.rate_percent}% {isAr ? "من" : "of"} {fmt(c.basis_amount)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{fmt(c.gross_amount)}</TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">
                    {c.wht_amount > 0 ? `${fmt(c.wht_amount)} (${c.wht_rate}%)` : "—"}
                  </TableCell>
                  <TableCell className="text-end tabular-nums font-medium">{fmt(c.net_amount)}</TableCell>
                  <TableCell>
                    {c.status === "PAID" ? (
                      <div className="flex items-center gap-2">
                        <Badge>{isAr ? "مسدَّدة" : "Paid"}</Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">{c.paid_date}</span>
                      </div>
                    ) : canManage ? (
                      <PayCommissionForm
                        commissionId={c.id}
                        cashAccounts={cashAccounts}
                        locale={locale}
                      />
                    ) : (
                      <Badge variant="secondary">{isAr ? "مستحقة" : "Accrued"}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
