"use client";

import { useTransition } from "react";
import { Link } from "@/i18n/navigation";
import {
  Star,
  UserCheck,
  UserX,
  ExternalLink,
  Phone,
  MessageCircle,
  Clock,
  ShieldCheck,
  AlertCircle,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { OwnershipHistoryRow } from "@/lib/property/unit-activity";
import { LinkOwnerDialog, type MemberOption } from "./link-owner-dialog";
import { unlinkOwnershipAction } from "@/lib/actions/property";

export function TabOwnership({
  organizationId,
  unitId,
  unitCode,
  history,
  members,
  locale,
}: {
  organizationId?: string;
  unitId?: string;
  unitCode?: string;
  history: OwnershipHistoryRow[];
  members?: MemberOption[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const active = history.filter((h) => h.active);
  const palette = [
    "bg-indigo-600",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-cyan-500",
    "bg-rose-500",
  ];
  const [isPending, startTransition] = useTransition();

  function handleUnlink(memberId: string) {
    if (!organizationId || !unitId) return;
    if (
      !confirm(
        isAr
          ? "هل أنت متأكد من إنهاء ملكية هذا العضو للوحدة الحالية؟"
          : "Are you sure you want to end this member's ownership of the unit?"
      )
    ) {
      return;
    }

    const fd = new FormData();
    fd.set("organizationId", organizationId);
    fd.set("unitId", unitId);
    fd.set("memberId", memberId);

    startTransition(async () => {
      await unlinkOwnershipAction({ ok: true }, fd);
    });
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Fast Link Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/40 border border-border/60">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Users className="size-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? "إدارة وتوزيع ملكية الوحدة" : "Unit Ownership & Co-Owners"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? `الوحدة: ${unitCode || "—"} • إجمالي الملاك الفعليين (${active.length})`
                : `Unit: ${unitCode || "—"} • Active Owners (${active.length})`}
            </p>
          </div>
        </div>

        {organizationId && unitId && (
          <LinkOwnerDialog
            organizationId={organizationId}
            unitId={unitId}
            unitCode={unitCode || ""}
            members={members || []}
            locale={locale}
          />
        )}
      </div>

      {/* Active Ownership Distribution */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? "توزيع نسب الملكية الحالية" : "Current Ownership Distribution"}
          </h3>
          <span className="text-xs text-slate-400 font-medium">
            {active.reduce((s, o) => s + o.share_percentage, 0)}% {isAr ? "مُسند" : "Assigned"}
          </span>
        </div>

        {active.length ? (
          <>
            {/* Visual Share Bar */}
            <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 p-0.5 ring-1 ring-border/50">
              {active.map((o, i) => (
                <div
                  key={o.member_id}
                  className={`${palette[i % palette.length]} transition-all first:rounded-s-full last:rounded-e-full`}
                  style={{ width: `${o.share_percentage}%` }}
                  title={`${o.member_name}: ${o.share_percentage}%`}
                />
              ))}
            </div>

            {/* Active Owner Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {active.map((o, i) => (
                <div
                  key={o.member_id}
                  className="flex flex-col justify-between p-4 rounded-xl border border-border/70 bg-slate-50/60 dark:bg-slate-900/60 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`size-9 rounded-full ${palette[i % palette.length]} text-white flex items-center justify-center font-bold text-xs shadow-xs`}
                      >
                        {o.member_name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/members/${o.member_id}`}
                            locale={locale}
                            className="font-bold text-sm text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1"
                          >
                            <span>{o.member_name}</span>
                            <ExternalLink className="size-3 opacity-60" />
                          </Link>
                          {o.is_primary_contact && (
                            <Badge
                              variant="secondary"
                              className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] py-0 px-1.5"
                            >
                              <Star className="size-2.5 fill-current me-1" />
                              {isAr ? "أساسي" : "Primary"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {isAr ? "منذ:" : "Since:"} {o.start_date}
                        </p>
                      </div>
                    </div>

                    <div className="text-end">
                      <span className="text-base font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                        {o.share_percentage}%
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        {isAr ? "حصة الملكية" : "Share"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                    <Link
                      href={`/members/${o.member_id}`}
                      locale={locale}
                      className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                    >
                      {isAr ? "استعراض بروفايل المالك" : "View Owner Profile"}
                    </Link>

                    {organizationId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleUnlink(o.member_id)}
                        className="h-7 px-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px]"
                      >
                        <UserX className="size-3 me-1" />
                        {isAr ? "إنهاء الملكية" : "End Ownership"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="p-8 text-center rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border border-dashed border-border text-slate-400 space-y-2">
            <UserCheck className="size-8 mx-auto opacity-40" />
            <p className="text-xs font-semibold">
              {isAr
                ? "لا يوجد ملاك مسجلون حالياً لهذه الوحدة"
                : "No registered owners for this unit yet"}
            </p>
            {organizationId && unitId && (
              <div className="pt-2">
                <LinkOwnerDialog
                  organizationId={organizationId}
                  unitId={unitId}
                  unitCode={unitCode || ""}
                  members={members || []}
                  locale={locale}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* Ownership Timeline History */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? "السجل التاريخي لانتقال الملكيات" : "Ownership History Timeline"}
          </h3>
        </div>

        {history.length ? (
          <ol className="relative space-y-4 border-s-2 border-border/70 ps-5 ms-2">
            {history.map((o) => (
              <li
                key={`${o.member_id}-${o.start_date}`}
                className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <span
                  className={`absolute -start-[27px] top-1 size-3 rounded-full ring-4 ring-card ${
                    o.active
                      ? "bg-emerald-500 ring-emerald-500/20"
                      : "bg-slate-400 ring-slate-400/20"
                  }`}
                />
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {o.member_name}{" "}
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      ({o.share_percentage}%)
                    </span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {o.start_date} → {o.end_date ?? (isAr ? "حتى الآن" : "Present")}
                  </p>
                </div>

                <Badge
                  variant="outline"
                  className={`w-fit text-[11px] font-semibold ${
                    o.active
                      ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                      : "border-slate-300 dark:border-slate-700 text-slate-500"
                  }`}
                >
                  {o.active
                    ? isAr
                      ? "ملكية نشطة"
                      : "Active"
                    : isAr
                    ? "ملكية منتهية"
                    : "Archived"}
                </Badge>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-slate-400">
            {isAr ? "لا يوجد سجل ملكية سابق" : "No ownership history records"}
          </p>
        )}
      </section>
    </div>
  );
}
