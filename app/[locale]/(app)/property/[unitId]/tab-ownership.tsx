import { Star } from "lucide-react";
import type { OwnershipHistoryRow } from "@/lib/property/unit-activity";

export function TabOwnership({
  history,
  locale,
}: {
  history: OwnershipHistoryRow[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const active = history.filter((h) => h.active);
  const palette = ["bg-primary", "bg-emerald-500", "bg-amber-500", "bg-blue-500", "bg-rose-500"];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="mb-3 text-sm font-semibold">{isAr ? "توزيع الملكية الحالي" : "Current ownership split"}</h2>
        {active.length ? (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {active.map((o, i) => (
                <div key={o.member_id} className={palette[i % palette.length]} style={{ width: `${o.share_percentage}%` }} />
              ))}
            </div>
            <ul className="mt-4 space-y-2">
              {active.map((o, i) => (
                <li key={o.member_id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${palette[i % palette.length]}`} />
                    <span className="font-medium">{o.member_name}</span>
                    {o.is_primary_contact && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Star className="size-3 fill-amber-400 text-amber-400" />
                        {isAr ? "جهة الاتصال الأساسية" : "Primary contact"}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums font-semibold">{o.share_percentage}%</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{isAr ? "لا يوجد مالك حالي" : "No current owner"}</p>
        )}
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="mb-4 text-sm font-semibold">{isAr ? "تاريخ الملكية" : "Ownership history"}</h2>
        {history.length ? (
          <ol className="relative space-y-4 border-s border-border/60 ps-5">
            {history.map((o) => (
              <li key={`${o.member_id}-${o.start_date}`} className="relative">
                <span className={`absolute -start-[23px] top-1 size-2.5 rounded-full ${o.active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                <p className="text-sm font-medium">{o.member_name} <span className="text-xs font-normal text-muted-foreground">· {o.share_percentage}%</span></p>
                <p className="text-[11px] text-muted-foreground">
                  {o.start_date} → {o.end_date ?? (isAr ? "حتى الآن" : "present")}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground">{isAr ? "لا يوجد سجل ملكية" : "No ownership records"}</p>
        )}
      </section>
    </div>
  );
}
