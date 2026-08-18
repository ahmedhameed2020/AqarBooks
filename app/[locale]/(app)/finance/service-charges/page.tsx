import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
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
import { CreateLevyForm, type Option } from "./levy-forms";

const BASIS_LABEL: Record<string, { ar: string; en: string }> = {
  AREA: { ar: "بالمساحة", en: "By area" },
  EQUAL: { ar: "بالتساوي", en: "Equal" },
  CUSTOM: { ar: "أوزان مخصصة", en: "Custom" },
};

export default async function ServiceChargesPage({
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
    hasPermission(organization.id, "finance.service_charges.manage"),
    hasPermission(organization.id, "finance.service_charges.read"),
  ]);
  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "رسوم الخدمة" : "Service Charges"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على رسوم الخدمة."
            : "You don't have permission to view service charges."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: levies }, { data: properties }, { data: dueTypes }, { data: accounts }] =
    await Promise.all([
      supabase
        .from("service_charge_levies")
        .select("id, name, property_id, period_start, period_end, total_amount, allocation_basis, status")
        .eq("organization_id", organization.id)
        .order("period_end", { ascending: false }),
      supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", organization.id)
        .order("name"),
      supabase
        .from("due_types")
        .select("id, name_ar, name_en")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("name_en"),
      supabase
        .from("chart_of_accounts")
        .select("id, code, name_ar, name_en")
        .eq("organization_id", organization.id)
        .eq("category", "ASSET")
        .eq("is_group", false)
        .eq("is_active", true)
        .order("code"),
    ]);

  const propertyById = new Map((properties ?? []).map((p) => [p.id, p.name]));
  const propertyOptions: Option[] = (properties ?? []).map((p) => ({ id: p.id, label: p.name }));
  const dueTypeOptions: Option[] = (dueTypes ?? []).map((t) => ({
    id: t.id,
    label: isAr ? t.name_ar : t.name_en,
  }));
  const accountOptions: Option[] = (accounts ?? []).map((a) => ({
    id: a.id,
    label: `${a.code} — ${isAr ? a.name_ar : a.name_en}`,
  }));

  const fmt = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "رسوم الخدمة والصيانة" : "Service Charges"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "وزّع تكلفة تشغيل المناطق المشتركة على الوحدات المستفيدة، بأساس واضح ومجموع مطابق للمليم."
            : "Recover the cost of running common areas from the units that benefit, on a defensible basis that sums to the piastre."}
        </p>
      </div>

      {canManage && (
        <CreateLevyForm
          organizationId={organization.id}
          properties={propertyOptions}
          dueTypes={dueTypeOptions}
          receivableAccounts={accountOptions}
          locale={locale}
        />
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "التحصيلة" : "Levy"}</TableHead>
              <TableHead>{isAr ? "العقار" : "Property"}</TableHead>
              <TableHead>{isAr ? "الفترة" : "Period"}</TableHead>
              <TableHead>{isAr ? "الأساس" : "Basis"}</TableHead>
              <TableHead className="text-end">{isAr ? "الإجمالي" : "Total"}</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(levies ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {isAr ? "لا توجد تحصيلات بعد." : "No levies yet."}
                </TableCell>
              </TableRow>
            ) : (
              (levies ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link
                      href={`/finance/service-charges/${l.id}`}
                      locale={locale as Locale}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {l.name}
                    </Link>
                  </TableCell>
                  <TableCell>{propertyById.get(l.property_id) ?? "—"}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {l.period_start} → {l.period_end}
                  </TableCell>
                  <TableCell>
                    {isAr
                      ? BASIS_LABEL[l.allocation_basis]?.ar
                      : BASIS_LABEL[l.allocation_basis]?.en}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{fmt(l.total_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === "ISSUED" ? "default" : "secondary"}>
                      {l.status === "ISSUED"
                        ? isAr
                          ? "صادرة"
                          : "Issued"
                        : isAr
                          ? "مسودة"
                          : "Draft"}
                    </Badge>
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
