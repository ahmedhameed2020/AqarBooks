import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import type { Locale } from "@/i18n/routing";
import { unitTypeLabel, type UnitType } from "@/app/[locale]/(app)/property/unit-helpers";

type PortalUnitRow = {
  id: string;
  code: string;
  unit_type: UnitType;
  custom_type_label: string | null;
  balance: number;
  has_arrears: boolean;
};

export default async function PortalUnitsPage({
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

  // units_with_financials is security_invoker = true (verified against
  // 20260810000042 / 20260810000044), so this query runs under the
  // requesting user's RLS -- units_select_own (Task 10) restricts the
  // underlying units table to units the member currently owns.
  const { data: unitsData, error: unitsError } = await supabase
    .from("units_with_financials")
    .select("id, code, unit_type, custom_type_label, balance, has_arrears")
    .order("code", { ascending: true });
  if (unitsError) console.error("[PortalUnitsPage] units query failed:", unitsError.message);

  const units = (unitsData ?? []) as unknown as PortalUnitRow[];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "وحداتي" : "My Units"}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {units.map((u) => (
          <div key={u.id} className="rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-foreground">{u.code}</p>
              {u.has_arrears && <Badge variant="destructive">{isAr ? "متأخرات" : "Arrears"}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{unitTypeLabel(u, isAr)}</p>
            <Money amount={Number(u.balance)} locale={locale} tone="auto" className="mt-2 font-bold" />
          </div>
        ))}
        {units.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لا توجد وحدات مسجلة باسمك." : "No units on file under your name."}
          </p>
        )}
      </div>
    </div>
  );
}
