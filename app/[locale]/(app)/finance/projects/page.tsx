import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import { getCurrencyLabel } from "@/lib/currency";
import type { Locale } from "@/i18n/routing";
import { ProjectForm, CapitaliseForm, ReleaseForm, type Option } from "./project-forms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "المشاريع والأعمال تحت التنفيذ | AqarBooks" : "Projects & WIP | AqarBooks",
    description: isAr
      ? "رسملة تكاليف المشاريع تحت التنفيذ وتحريرها إلى تكلفة المبيعات عند البيع."
      : "Capitalise project costs into work in progress and release them to cost of sales on sale.",
  };
}

type ProjectRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  status: string;
  accounts_set: boolean;
  budget_amount: number | string | null;
  capitalised: number | string;
  released: number | string;
  wip_balance: number | string;
  budget_variance: number | string | null;
};

const n = (v: number | string) => Number(v ?? 0);

export default async function ProjectsPage({
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

  // The table's own policy is `finance.accounts.manage` for writes and org
  // membership for reads, so the screen asks exactly that -- not a new rule.
  const canManage = await hasPermission(organization.id, "finance.accounts.manage");

  const supabase = await createClient();
  const [{ data: projectsRaw }, { data: accounts }, { data: properties }] = await Promise.all([
    supabase.rpc("list_projects", { p_organization_id: organization.id }),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .in("category", ["ASSET", "LIABILITY", "EXPENSE"])
      .order("code"),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("name"),
  ]);

  const projects = (projectsRaw ?? []) as unknown as ProjectRow[];
  const currency = organization.default_currency ?? "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const money = (v: number) =>
    v.toLocaleString(isAr ? "ar-EG" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const label = (a: { code: string; name_ar: string; name_en: string }) =>
    `${a.code} — ${isAr ? a.name_ar : a.name_en}`;
  const assetAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "ASSET").map((a) => ({ id: a.id, label: label(a) }));
  const expenseAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "EXPENSE").map((a) => ({ id: a.id, label: label(a) }));
  // Construction is funded from cash, a bank, or a payable to the contractor.
  const creditAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "ASSET" || a.category === "LIABILITY")
    .map((a) => ({ id: a.id, label: label(a) }));
  const propertyOptions: Option[] = (properties ?? []).map((p) => ({ id: p.id, label: p.name }));

  const postable = projects.filter((p) => p.accounts_set && p.status !== "COMPLETED" && p.status !== "CANCELLED");
  const capitaliseOptions: Option[] = postable.map((p) => ({
    id: p.id,
    label: `${p.code} — ${isAr ? p.name_ar : p.name_en}`,
  }));
  const releaseOptions = postable
    .filter((p) => n(p.wip_balance) > 0)
    .map((p) => ({
      id: p.id,
      label: `${p.code} — ${isAr ? p.name_ar : p.name_en} (${money(n(p.wip_balance))} ${currencyLabel})`,
      balance: n(p.wip_balance),
    }));

  const totalWip = projects.reduce((s, p) => s + n(p.wip_balance), 0);
  const totalCapitalised = projects.reduce((s, p) => s + n(p.capitalised), 0);
  const totalReleased = projects.reduce((s, p) => s + n(p.released), 0);
  const missingAccounts = projects.filter((p) => !p.accounts_set).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {isAr ? "المشاريع والأعمال تحت التنفيذ" : "Projects & Work in Progress"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "الإنفاق على البناء أصل لا مصروف. تكلفة المبيعات تظهر حين تُباع الوحدات."
            : "Construction spend is an asset, not an expense. Cost of sales appears when units sell."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { k: "wip", label: isAr ? "تحت التنفيذ" : "Work in progress", v: money(totalWip) },
          { k: "capitalised", label: isAr ? "إجمالي المرسمل" : "Capitalised", v: money(totalCapitalised) },
          { k: "released", label: isAr ? "المحرَّر لتكلفة المبيعات" : "Released to cost of sales", v: money(totalReleased) },
          { k: "unset", label: isAr ? "بلا حسابات" : "Accounts not set", v: String(missingAccounts) },
        ].map((c) => (
          <div key={c.k} data-kpi={c.k} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-mono text-lg font-semibold" dir="ltr">{c.v}</p>
          </div>
        ))}
      </div>

      {canManage && (
        <section aria-label={isAr ? "مشروع" : "Project"} className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">{isAr ? "مشروع جديد أو تعديل قائم" : "Add or edit a project"}</h2>
          {/* Said before they save, not after a refusal: a project without both
              accounts cannot take a single cost. */}
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "الحسابان مطلوبان قبل رسملة أي تكلفة. الحفظ بدونهما مسموح، والرسملة مرفوضة."
              : "Both accounts are required before any cost can be capitalised. Saving without them is allowed; capitalising is not."}
          </p>
          <ProjectForm
            organizationId={organization.id}
            assetAccounts={assetAccounts}
            expenseAccounts={expenseAccounts}
            properties={propertyOptions}
            locale={locale}
          />
        </section>
      )}

      {canManage && capitaliseOptions.length > 0 && (
        <section aria-label={isAr ? "رسملة" : "Capitalise"} className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">{isAr ? "رسملة تكلفة" : "Capitalise a cost"}</h2>
          <CapitaliseForm projects={capitaliseOptions} creditAccounts={creditAccounts} locale={locale} />
        </section>
      )}

      {canManage && releaseOptions.length > 0 && (
        <section aria-label={isAr ? "تحرير" : "Release"} className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">
            {isAr ? "تحرير إلى تكلفة المبيعات" : "Release to cost of sales"}
          </h2>
          <ReleaseForm projects={releaseOptions} locale={locale} />
        </section>
      )}

      <section aria-label={isAr ? "المشاريع" : "Projects"} className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{isAr ? "المشاريع" : "Projects"}</h2>
          <Badge variant="outline">{projects.length}</Badge>
        </div>

        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لا مشاريع بعد." : "No projects yet."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2.5 text-start">{isAr ? "الكود" : "Code"}</th>
                  <th className="p-2.5 text-start">{isAr ? "المشروع" : "Project"}</th>
                  <th className="p-2.5 text-end">{isAr ? "المرسمل" : "Capitalised"}</th>
                  <th className="p-2.5 text-end">{isAr ? "المحرَّر" : "Released"}</th>
                  <th className="p-2.5 text-end">{isAr ? "تحت التنفيذ" : "WIP"}</th>
                  <th className="p-2.5 text-end">{isAr ? "مقابل الموازنة" : "vs budget"}</th>
                  <th className="p-2.5 text-start">{isAr ? "الحالة" : "Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {projects.map((p) => {
                  const variance = p.budget_variance === null ? null : n(p.budget_variance);
                  return (
                    <tr
                      key={p.id}
                      data-project={p.code}
                      data-wip={n(p.wip_balance)}
                      data-accounts-set={p.accounts_set ? "yes" : "no"}
                    >
                      <td className="p-2.5 font-mono">{p.code}</td>
                      <td className="p-2.5">{isAr ? p.name_ar : p.name_en}</td>
                      <td className="p-2.5 text-end font-mono" dir="ltr">{money(n(p.capitalised))}</td>
                      <td className="p-2.5 text-end font-mono" dir="ltr">{money(n(p.released))}</td>
                      <td className="p-2.5 text-end font-mono font-semibold" dir="ltr">
                        {money(n(p.wip_balance))}
                      </td>
                      <td className="p-2.5 text-end font-mono" dir="ltr">
                        {/* No budget prints a dash, never a zero: zero would
                            claim "exactly on budget", which is a different
                            statement from having nothing to compare against. */}
                        {variance === null ? (
                          <span className="text-muted-foreground">
                            {isAr ? "لا موازنة" : "no budget"}
                          </span>
                        ) : (
                          <span className={variance < 0 ? "text-destructive" : ""}>
                            {money(variance)}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5">
                        {p.accounts_set ? (
                          <Badge variant={p.status === "ACTIVE" ? "secondary" : "outline"}>
                            {p.status}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-destructive">
                            {isAr ? "بلا حسابات — لا رسملة" : "no accounts — cannot capitalise"}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
