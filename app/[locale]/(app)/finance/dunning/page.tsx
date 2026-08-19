import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import { getCurrencyLabel } from "@/lib/currency";
import type { Locale } from "@/i18n/routing";
import { PolicyForm, RaiseStageForm, NoticeActions, type NoticeRow } from "./dunning-forms";

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
    title: isAr ? "التحصيل وإشعارات التأخير | AqarBooks" : "Collections & Dunning | AqarBooks",
    description: isAr
      ? "مستويات التحصيل، المستحقات المتأخرة المؤهَّلة للإشعار، وسجل الإشعارات المرفوعة."
      : "Dunning stages, overdue debts eligible for a notice, and the register of notices raised.",
  };
}

type Candidate = {
  due_id: string;
  description: string;
  due_date: string;
  days_overdue: number;
  outstanding: number | string;
  member_id: string | null;
  member_name: string | null;
  stage: number;
  stage_name_ar: string;
  stage_name_en: string;
  already_raised: boolean;
};

const n = (v: number | string) => Number(v ?? 0);

export default async function DunningPage({
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
    hasPermission(organization.id, "finance.dunning.manage"),
    hasPermission(organization.id, "finance.dunning.read"),
  ]);

  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "التحصيل" : "Collections"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على التحصيل."
            : "You don't have permission to view collections."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: policies }, { data: candidatesRaw }, { data: noticesRaw }] = await Promise.all([
    supabase
      .from("dunning_policies")
      .select("stage, name_ar, name_en, days_overdue, minimum_amount, is_active")
      .eq("organization_id", organization.id)
      .order("stage"),
    supabase.rpc("list_dunning_candidates", { p_organization_id: organization.id }),
    supabase.rpc("list_dunning_notices", { p_organization_id: organization.id }),
  ]);

  const candidates = (candidatesRaw ?? []) as unknown as Candidate[];
  const notices = (noticesRaw ?? []) as unknown as NoticeRow[];
  const currency = organization.default_currency ?? "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const money = (v: number) =>
    v.toLocaleString(isAr ? "ar-EG" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const pending = candidates.filter((c) => !c.already_raised);
  const ownerless = pending.filter((c) => !c.member_id);
  const totalPending = pending.reduce((s, c) => s + n(c.outstanding), 0);
  const undelivered = notices.filter((x) => x.status === "RAISED");

  const stageOptions = (policies ?? [])
    .filter((p) => p.is_active)
    .map((p) => ({
      stage: p.stage,
      label: `${p.stage} — ${isAr ? p.name_ar : p.name_en} (${p.days_overdue}${isAr ? " يوم" : "d"})`,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "التحصيل وإشعارات التأخير" : "Collections & Dunning"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "المستوى المستحق هو أعلى مستوى بلغه الدين، لا أدناه."
            : "The stage a debt has reached is the highest it qualifies for, not the lowest."}
        </p>
      </div>

      {/* Stated at the top, not discovered later: this system raises notices,
          it does not send them. An operator who assumes otherwise stops
          chasing a debtor who was never actually contacted. */}
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        {isAr
          ? "هذا النظام يرفع الإشعارات ولا يرسلها — لا يوجد فيه مرسِل آلي. اطبع الإشعار أو أبلغ المدين بوسيلتك، ثم سجّل التسليم هنا. ولا يُعدّ الإشعار مُسلَّمًا حتى تُسجّله."
          : "This system RAISES notices; it does not send them -- there is no automated sender in it. Print or contact the debtor by your own means, then record the delivery here. A notice is not delivered until you say so."}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { k: "pending", label: isAr ? "مؤهَّل لإشعار" : "Eligible now", v: String(pending.length) },
          { k: "amount", label: isAr ? "قيمة المتأخرات" : "Amount overdue", v: money(totalPending) },
          { k: "undelivered", label: isAr ? "مرفوع بلا تسليم" : "Raised, not delivered", v: String(undelivered.length) },
          { k: "ownerless", label: isAr ? "بلا مالك مسجَّل" : "No owner on record", v: String(ownerless.length) },
        ].map((c) => (
          <div key={c.k} data-kpi={c.k} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-mono text-lg font-semibold" dir="ltr">{c.v}</p>
          </div>
        ))}
      </div>

      {canManage && (
        <section aria-label={isAr ? "المستويات" : "Stages"} className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">{isAr ? "مستويات التحصيل" : "Dunning stages"}</h2>
          {(policies ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "لا مستويات بعد. لن يُرشَّح أي مستحق حتى تُعرِّف مستوى واحدًا على الأقل."
                : "No stages yet. Nothing will be flagged until at least one stage exists."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(policies ?? []).map((p) => (
                <Badge key={p.stage} variant="secondary" data-stage={p.stage}>
                  {p.stage} — {isAr ? p.name_ar : p.name_en} · {p.days_overdue}
                  {isAr ? " يوم" : "d"} · ≥ {money(Number(p.minimum_amount))}
                </Badge>
              ))}
            </div>
          )}
          <PolicyForm organizationId={organization.id} locale={locale} />
        </section>
      )}

      {canManage && stageOptions.length > 0 && (
        <section aria-label={isAr ? "رفع الإشعارات" : "Raise notices"} className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">{isAr ? "رفع إشعارات مستوى" : "Raise a stage's notices"}</h2>
          <RaiseStageForm organizationId={organization.id} stages={stageOptions} locale={locale} />
        </section>
      )}

      <section aria-label={isAr ? "مؤهَّل الآن" : "Eligible now"} className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{isAr ? "مستحقات مؤهَّلة لإشعار" : "Debts eligible for a notice"}</h2>
          <Badge variant="outline">{pending.length}</Badge>
        </div>

        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لا مستحق مؤهَّل اليوم." : "Nothing is eligible today."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2.5 text-start">{isAr ? "البيان" : "Item"}</th>
                  <th className="p-2.5 text-start">{isAr ? "المدين" : "Debtor"}</th>
                  <th className="p-2.5 text-end">{isAr ? "أيام التأخير" : "Days late"}</th>
                  <th className="p-2.5 text-end">{isAr ? "المتبقي" : "Outstanding"}</th>
                  <th className="p-2.5 text-start">{isAr ? "المستوى" : "Stage"}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pending.map((c) => (
                  <tr key={c.due_id} data-candidate={c.due_id} data-stage={c.stage}>
                    <td className="p-2.5">{c.description}</td>
                    <td className="p-2.5">
                      {c.member_name ?? (
                        // Shown, not hidden: an ownerless debt is a data gap the
                        // collections team must see, or it is never chased.
                        <span className="text-destructive">
                          {isAr ? "لا مالك مسجَّل" : "no owner on record"}
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-end font-mono" dir="ltr">{c.days_overdue}</td>
                    <td className="p-2.5 text-end font-mono font-semibold" dir="ltr">
                      {money(n(c.outstanding))}
                    </td>
                    <td className="p-2.5">
                      <Badge variant="outline">
                        {c.stage} — {isAr ? c.stage_name_ar : c.stage_name_en}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label={isAr ? "الإشعارات المرفوعة" : "Notices raised"} className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{isAr ? "الإشعارات المرفوعة" : "Notices raised"}</h2>
          <Badge variant="secondary">{notices.length}</Badge>
        </div>

        {notices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لم يُرفع إشعار بعد." : "No notice raised yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {notices.map((x) => (
              <article
                key={x.id}
                data-notice={x.id}
                data-status={x.status}
                className="space-y-2 rounded-lg border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {x.due_description}
                      {x.unit_code ? ` · ${x.unit_code}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAr ? "المستوى" : "Stage"} {x.stage} ·{" "}
                      {x.member_name ?? (isAr ? "بلا مالك" : "no owner")} · {x.raised_on} ·{" "}
                      {x.days_overdue}
                      {isAr ? " يوم" : "d"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2" dir="ltr">
                    <span className="font-mono text-sm font-semibold">
                      {money(Number(x.outstanding_amount))} {currencyLabel}
                    </span>
                    <Badge variant={x.status === "DELIVERED" ? "secondary" : "outline"}>
                      {x.status === "DELIVERED"
                        ? `${isAr ? "سُلِّم" : "Delivered"}${x.delivery_channel ? ` · ${x.delivery_channel}` : ""}`
                        : isAr ? "مرفوع — لم يُسلَّم" : "Raised — not delivered"}
                    </Badge>
                  </div>
                </div>

                <NoticeActions
                  notice={x}
                  organizationName={organization.name}
                  organizationAddress={organization.address ?? null}
                  organizationPhone={organization.phone ?? null}
                  taxNumber={organization.tax_id ?? null}
                  currencyLabel={currencyLabel}
                  canManage={canManage}
                  locale={locale}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
