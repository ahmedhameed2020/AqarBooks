import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { ItemForm, LinkForm } from "./einvoice-items-forms";
// نوع فقط — يُمحى عند البناء. استيراد قيمة فعلية من ملف "use client" داخل مكوّن
// خادم يعود undefined بصمت.
import type { ItemOption } from "./einvoice-items-forms";

type ItemRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  unit_code: string;
  item_code_type: string | null;
  item_code: string | null;
  is_active: boolean;
  linked_due_types: number;
};

type LinkRow = {
  due_type_id: string;
  due_type_name_ar: string;
  due_type_name_en: string;
  catalogue_item_id: string | null;
  item_name_ar: string | null;
  item_code: string | null;
  item_code_type: string | null;
};

type Gap = { gap_code: string; detail: string };

export default async function EInvoiceItemsPage({
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
    hasPermission(organization.id, "finance.einvoice.manage"),
    hasPermission(organization.id, "finance.einvoice.read"),
  ]);

  // الرفض معلن لا مخفي: إخفاء الشاشة من التنقل ليس حدًا أمنيًا، والـRPC يرفض
  // بنفسه على أي حال.
  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          {isAr ? "أصناف المستندات الإلكترونية" : "E-Document Items"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على كتالوج الأصناف."
            : "You don't have permission to view the item catalogue."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: itemsData }, { data: linksData }, { data: gapsData }] = await Promise.all([
    supabase.rpc("list_catalogue_items", { p_organization_id: organization.id }),
    supabase.rpc("list_due_type_catalogue_links", { p_organization_id: organization.id }),
    supabase.rpc("check_einvoice_emission_readiness", { p_organization_id: organization.id }),
  ]);

  const items = (itemsData ?? []) as unknown as ItemRow[];
  const links = (linksData ?? []) as unknown as LinkRow[];
  const gaps = (gapsData ?? []) as unknown as Gap[];

  const options: ItemOption[] = items
    .filter((i) => i.is_active)
    .map((i) => ({
      id: i.id,
      label: `${isAr ? i.name_ar : i.name_en} · ${i.code}`,
      hasCode: Boolean(i.item_code),
    }));

  const unlinked = links.filter((l) => !l.catalogue_item_id || !l.item_code);
  const linked = links.filter((l) => l.catalogue_item_id && l.item_code);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {isAr ? "أصناف المستندات الإلكترونية" : "E-Document Items"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "كل نوع مستحق يُرسَل في مستند إلكتروني يحتاج صنفًا يحمل كود سلطة."
            : "Every due type filed in an electronic document needs an item carrying an authority code."}
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        {isAr
          ? "مصلحة الضرائب المصرية لا تقبل وصفًا نصيًا حرًا لسطر الفاتورة: تشترط كود صنف (EGS أو GS1) ولا مسار بديل. والنوع بلا كود يظهر هنا بدل أن يُرفض عند الإرسال."
          : "Egypt accepts no free-text line description: an item code (EGS or GS1) is required with no alternative. A type with no code appears here rather than being rejected at filing."}
      </div>

      <section aria-label={isAr ? "جاهزية الإصدار" : "Emission readiness"} className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{isAr ? "جاهزية الإصدار" : "Emission readiness"}</h2>
          <Badge variant={gaps.length === 0 ? "secondary" : "outline"}>{gaps.length}</Badge>
        </div>
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لا نواقص تمنع الإصدار." : "Nothing blocking emission."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {gaps.map((g, i) => (
              <li
                key={`${g.gap_code}-${i}`}
                data-gap={g.gap_code}
                className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs"
              >
                <span className="font-mono">{g.gap_code}</span> — {g.detail}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={isAr ? "أنواع بلا كود" : "Types without a code"} className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">
            {isAr ? "أنواع مستحقات تحتاج صنفًا بكود" : "Due types needing a coded item"}
          </h2>
          <Badge variant="outline">{unlinked.length}</Badge>
        </div>
        {unlinked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAr ? "كل الأنواع النشطة مربوطة بصنف يحمل كودًا." : "Every active type has a coded item."}
          </p>
        ) : (
          <div className="space-y-3">
            {unlinked.map((l) => (
              <article
                key={l.due_type_id}
                data-due-type={l.due_type_id}
                data-linked={l.catalogue_item_id ? "no-code" : "unlinked"}
                className="space-y-3 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {isAr ? l.due_type_name_ar : l.due_type_name_en}
                  </p>
                  <Badge variant="outline">
                    {l.catalogue_item_id
                      ? isAr
                        ? "الصنف بلا كود"
                        : "Item has no code"
                      : isAr
                        ? "بلا صنف"
                        : "Unlinked"}
                  </Badge>
                </div>
                {canManage ? (
                  <LinkForm
                    dueTypeId={l.due_type_id}
                    currentItemId={l.catalogue_item_id}
                    items={options}
                    locale={locale}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">{isAr ? "الاطلاع فقط." : "View only."}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {linked.length > 0 && (
        <section aria-label={isAr ? "مربوط" : "Linked"} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">{isAr ? "مربوط بكود" : "Linked and coded"}</h2>
            <Badge variant="secondary">{linked.length}</Badge>
          </div>
          <div className="space-y-2">
            {linked.map((l) => (
              <article
                key={l.due_type_id}
                data-due-type={l.due_type_id}
                data-linked="coded"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <p className="text-sm">{isAr ? l.due_type_name_ar : l.due_type_name_en}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {l.item_name_ar} · {l.item_code_type} {l.item_code}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {canManage && (
        <section aria-label={isAr ? "الكتالوج" : "Catalogue"} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">{isAr ? "كتالوج الأصناف" : "Item catalogue"}</h2>
            <Badge variant="outline">{items.length}</Badge>
          </div>

          <div className="rounded-lg border p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              {isAr ? "إضافة صنف أو تعديل قائم بالكود نفسه" : "Add an item, or edit one by its code"}
            </p>
            <ItemForm organizationId={organization.id} locale={locale} />
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((i) => (
                <article
                  key={i.id}
                  data-item-code={i.code}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm">{isAr ? i.name_ar : i.name_en}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {i.code} · {i.unit_code}
                      {i.item_code ? ` · ${i.item_code_type} ${i.item_code}` : ""}
                    </p>
                  </div>
                  <Badge variant={i.item_code ? "secondary" : "outline"}>
                    {i.item_code
                      ? isAr
                        ? `مرتبط بـ${i.linked_due_types}`
                        : `${i.linked_due_types} linked`
                      : isAr
                        ? "بلا كود"
                        : "No code"}
                  </Badge>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
