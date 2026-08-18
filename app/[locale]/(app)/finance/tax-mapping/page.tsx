import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { ApproveButton, MappingForm, RevokeButton } from "./tax-mapping-forms";
// نوع فقط — يُمحى عند البناء. استيراد أي قيمة فعلية من ملف "use client" داخل
// مكوّن خادم يعود undefined بصمت.
import type { NatureOption } from "./tax-mapping-forms";

type MappingRow = {
  due_type_id: string;
  due_type_name_ar: string;
  due_type_name_en: string;
  mapping_id: string | null;
  revenue_nature: string | null;
  nature_name_ar: string | null;
  nature_name_en: string | null;
  status: string;
  notes: string | null;
  approved_at: string | null;
  updated_at: string | null;
};

type NatureRow = {
  code: string;
  name_ar: string;
  name_en: string;
  is_derived: boolean;
  sort_order: number;
};

export default async function TaxMappingPage({
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
    hasPermission(organization.id, "finance.tax_mapping.manage"),
    hasPermission(organization.id, "finance.tax_mapping.read"),
  ]);

  // الرفض معلن لا مخفي. إخفاء الشاشة من التنقل ليس حدًا أمنيًا، والـRPC يرفض
  // بنفسه على أي حال.
  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          {isAr ? "التصنيف الضريبي للإيرادات" : "Revenue Tax Classification"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على ربط أنواع المستحقات بطبيعة الإيراد."
            : "You don't have permission to view due type tax classification."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: rowsData }, { data: naturesData }] = await Promise.all([
    supabase.rpc("list_due_type_tax_mappings", {
      p_organization_id: organization.id,
    }),
    supabase
      .from("revenue_natures")
      .select("code, name_ar, name_en, is_derived, sort_order")
      .order("sort_order"),
  ]);

  const rows = (rowsData ?? []) as unknown as MappingRow[];
  const natures = (naturesData ?? []) as unknown as NatureRow[];

  const options: NatureOption[] = natures.map((n) => ({
    code: n.code,
    label: isAr ? n.name_ar : n.name_en,
    isDerived: n.is_derived,
  }));

  const pending = rows.filter((r) => r.status !== "APPROVED");
  const approved = rows.filter((r) => r.status === "APPROVED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {isAr ? "التصنيف الضريبي للإيرادات" : "Revenue Tax Classification"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "ربط كل نوع مستحق بطبيعة الإيراد التي تحدد معالجته الضريبية."
            : "Map each due type to the revenue nature that determines its tax treatment."}
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        {isAr
          ? "اسم نوع المستحق لا يُشتق منه أي تصنيف ضريبي — الربط يدوي ومقصود. والنوع غير المربوط أو غير المعتمد يمنع الترحيل الضريبي، ولا يُعامل كإعفاء."
          : "No tax treatment is ever inferred from a due type's name — mapping is manual and deliberate. An unmapped or unapproved type blocks tax posting; it is not treated as exempt."}
      </div>

      <section aria-label={isAr ? "بانتظار المراجعة" : "Awaiting review"} className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{isAr ? "بانتظار المراجعة" : "Awaiting review"}</h2>
          <Badge variant="outline">{pending.length}</Badge>
        </div>

        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لا يوجد نوع غير محسوم." : "Nothing undecided."}
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((row) => (
              <article
                key={row.due_type_id}
                data-due-type={row.due_type_id}
                data-status={row.status}
                className="space-y-3 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {isAr ? row.due_type_name_ar : row.due_type_name_en}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.revenue_nature
                        ? isAr
                          ? `مقترح: ${row.nature_name_ar ?? row.revenue_nature}`
                          : `Proposed: ${row.nature_name_en ?? row.revenue_nature}`
                        : isAr
                          ? "غير مربوط بعد"
                          : "Not mapped yet"}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {isAr ? "يحتاج مراجعة" : "Review required"}
                  </Badge>
                </div>

                {canManage ? (
                  <>
                    <MappingForm
                      // إعادة التركيب بعد كل حفظ: الحقول غير محكومة، فبدون مفتاح
                      // يتغيّر تبقى قيم DOM قديمة ويُرسل الحفظ التالي ما رسمه
                      // العرض السابق لا ما اختاره المراجع.
                      key={`${row.due_type_id}-${row.updated_at ?? "new"}`}
                      dueTypeId={row.due_type_id}
                      currentNature={row.revenue_nature}
                      currentNotes={row.notes}
                      natures={options}
                      locale={locale}
                    />
                    {row.mapping_id && (
                      <div className="border-t pt-3">
                        <ApproveButton mappingId={row.mapping_id} locale={locale} />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {isAr ? "الاطلاع فقط." : "View only."}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-label={isAr ? "معتمَد" : "Approved"} className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{isAr ? "معتمَد" : "Approved"}</h2>
          <Badge variant="secondary">{approved.length}</Badge>
        </div>

        {approved.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لم يُعتمد أي ربط بعد." : "No mapping approved yet."}
          </p>
        ) : (
          <div className="space-y-3">
            {approved.map((row) => (
              <article
                key={row.due_type_id}
                data-due-type={row.due_type_id}
                data-status={row.status}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    {isAr ? row.due_type_name_ar : row.due_type_name_en}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isAr ? row.nature_name_ar : row.nature_name_en}
                    {row.approved_at
                      ? ` · ${new Date(row.approved_at).toLocaleDateString(isAr ? "ar-EG" : "en-GB")}`
                      : ""}
                  </p>
                  {row.notes && <p className="mt-1 text-xs text-muted-foreground">{row.notes}</p>}
                </div>
                {canManage && row.mapping_id && (
                  <RevokeButton mappingId={row.mapping_id} locale={locale} />
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
