"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  X,
  Phone,
  Mail,
  Building2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTableRowNavigation } from "@/lib/hooks/use-table-row-navigation";
import type { Database } from "@/lib/supabase/types";
import { Money } from "@/components/money";
import { MemberAvatar } from "./member-avatar";
import { MemberRowActions } from "./member-row-actions";
import { useMembersNav } from "./members-nav-context";
import { MembersTableSkeleton } from "./members-table-skeleton";
import { buildMembersCsv, downloadCsv } from "./csv";

export type MemberRow = Database["public"]["Views"]["members_with_financials"]["Row"];

type SortKey = "name" | "units" | "balance";

function SortHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentSort?: string;
  currentDir?: string;
  className?: string;
}) {
  const { pushParams } = useMembersNav();
  const active = currentSort === sortKey;
  const nextDir = active && currentDir === "asc" ? "desc" : "asc";

  return (
    <button
      type="button"
      onClick={() => pushParams({ sort: sortKey, dir: nextDir, page: undefined })}
      className={cn("flex items-center gap-1 text-start font-black text-slate-800 dark:text-slate-200 hover:text-indigo-600 transition-colors cursor-pointer", className)}
    >
      <span>{label}</span>
      {active ? (
        currentDir === "asc" ? (
          <ArrowUp className="size-3.5 text-indigo-600" />
        ) : (
          <ArrowDown className="size-3.5 text-indigo-600" />
        )
      ) : (
        <ArrowUpDown className="size-3.5 opacity-40" />
      )}
    </button>
  );
}

function UnitsSummary({ codes, isAr }: { codes: string[]; isAr: boolean }) {
  if (!codes.length) return <span className="text-slate-400 font-bold">—</span>;
  const shown = codes.slice(0, 3);
  const rest = codes.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((code, idx) => (
        <span
          key={idx}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700"
        >
          {code}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950 px-1 py-0.5 rounded">
          +{rest}
        </span>
      )}
    </div>
  );
}

export function MembersTable({
  members,
  unitCodesByMember,
  locale,
  currency,
  organizationId,
  canManage,
}: {
  members: MemberRow[];
  unitCodesByMember: Map<string, string[]>;
  locale: string;
  currency: string;
  organizationId: string;
  canManage: boolean;
}) {
  const isAr = locale === "ar";
  const { isPending, pushParams, get } = useMembersNav();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const sort = get("sort");
  const dir = get("dir");
  const hasActiveFilters = Boolean(get("q") || get("ownership") || get("arrears"));
  const { activeIndex, setActiveIndex, onKeyDown, setRowRef } = useTableRowNavigation(members, (member) =>
    pushParams({ member: member.id }),
  );

  if (isPending) return <MembersTableSkeleton />;

  const allSelected = members.length > 0 && selectedIds.size === members.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(members.map((m) => m.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function exportSelected() {
    const rows = members.filter((m) => selectedIds.has(m.id));
    downloadCsv(`members-selected-${Date.now()}.csv`, buildMembersCsv(rows, isAr));
  }

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50/80 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
            <TableRow>
              <TableHead className="w-10 px-3">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={(checked) => toggleAll(Boolean(checked))}
                  aria-label={isAr ? "تحديد الكل" : "Select all"}
                />
              </TableHead>
              <TableHead className="min-w-[200px]">
                <SortHeader label={isAr ? "اسم العضو / المالك" : "Member / Owner"} sortKey="name" currentSort={sort} currentDir={dir} />
              </TableHead>
              <TableHead className="min-w-[180px]">{isAr ? "معلومات التواصل" : "Contact Details"}</TableHead>
              <TableHead className="w-24 text-center">
                <SortHeader
                  label={isAr ? "الوحدات" : "Units"}
                  sortKey="units"
                  currentSort={sort}
                  currentDir={dir}
                  className="w-full justify-center"
                />
              </TableHead>
              <TableHead className="min-w-[160px]">{isAr ? "أكواد الوحدات" : "Unit Codes"}</TableHead>
              <TableHead className="min-w-[130px] text-end">
                <SortHeader
                  label={isAr ? "الرصيد المالي" : "Balance"}
                  sortKey="balance"
                  currentSort={sort}
                  currentDir={dir}
                  className="w-full justify-end"
                />
              </TableHead>
              <TableHead className="w-32">{isAr ? "حالة البوابة" : "Portal"}</TableHead>
              <TableHead className="w-14 text-end px-3">
                <span className="sr-only">{isAr ? "إجراءات" : "Actions"}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {members.length ? (
              members.map((member, index) => {
                const formattedPhone = (member.phone || "").replace(/[^0-9+]/g, "");
                const whatsappUrl = formattedPhone
                  ? `https://wa.me/${formattedPhone.replace(/^00/, "").replace(/^\+/, "")}?text=${encodeURIComponent(
                      isAr
                        ? `مرحباً أستاذ ${member.full_name}، تحية طيبة من إدارة العقارات. بخصوص حسابكم في المنظومة...`
                        : `Hello ${member.full_name}, regarding your real estate account...`
                    )}`
                  : null;

                return (
                  <TableRow
                    key={member.id}
                    ref={setRowRef(index)}
                    tabIndex={0}
                    onFocus={() => setActiveIndex(index)}
                    onKeyDown={onKeyDown}
                    onClick={() => pushParams({ member: member.id })}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20",
                      index === activeIndex && "bg-indigo-50/50 dark:bg-indigo-950/40",
                      member.has_arrears && "bg-rose-50/20 dark:bg-rose-950/10",
                      member.archived_at && "opacity-55",
                    )}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()} className="px-3">
                      <Checkbox
                        checked={selectedIds.has(member.id)}
                        onCheckedChange={(checked) => toggleOne(member.id, Boolean(checked))}
                        aria-label={isAr ? "تحديد" : "Select"}
                      />
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-3">
                        <MemberAvatar id={member.id} name={member.full_name} />
                        <div className="min-w-0">
                          <Link
                            href={`/members/${member.id}`}
                            locale={locale}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate text-xs font-black text-slate-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
                          >
                            {member.full_name}
                          </Link>
                          <span className="text-[10px] font-bold text-slate-400">
                            {member.units_count > 0 ? (isAr ? "مالك وحدة" : "Unit Owner") : (isAr ? "عضو مسجل" : "Registered Member")}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-0.5 text-xs">
                        {member.phone && (
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-mono">
                            <Phone className="size-3 text-slate-400" />
                            <span>{member.phone}</span>
                          </div>
                        )}
                        {member.email && (
                          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] truncate max-w-[180px]">
                            <Mail className="size-3 text-slate-400 shrink-0" />
                            <span className="truncate">{member.email}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-center font-mono text-xs font-black text-slate-800 dark:text-slate-200">
                      {member.units_count}
                    </TableCell>

                    <TableCell>
                      <UnitsSummary codes={unitCodesByMember.get(member.id) ?? []} isAr={isAr} />
                    </TableCell>

                    {/* A number, not a chip. A column headed "Balance" has to be
                        comparable, sortable and summable down the page; a badge
                        reading "no arrears" is none of those. Colour still
                        carries the state. */}
                    <TableCell className="text-end">
                      <span className="block text-xs font-bold tabular-nums">
                        <Money
                          amount={member.total_balance}
                          locale={locale}
                          tone={member.total_balance > 0 ? "negative" : "positive"}
                        />
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-semibold",
                          member.total_balance > 0
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {member.total_balance > 0
                          ? isAr ? "متأخرات" : "arrears"
                          : isAr ? "مسوّى" : "settled"}
                      </span>
                    </TableCell>

                    {/* Portal reachability at a glance. "Cannot be invited"
                        is the state worth surfacing: an owner with neither an
                        email nor a phone can never be given access, and that
                        was previously invisible until you opened their file. */}
                    <TableCell>
                      {member.archived_at ? (
                        <Badge variant="outline" className="bg-muted text-[10px] font-semibold text-muted-foreground">
                          {isAr ? "مؤرشف" : "Archived"}
                        </Badge>
                      ) : member.user_id ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                        >
                          {isAr ? "مُفعّلة" : "Active"}
                        </Badge>
                      ) : !member.email && !member.phone ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                        >
                          {isAr ? "لا يمكن دعوته" : "Cannot invite"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted/60 text-[10px] font-semibold text-muted-foreground">
                          {isAr ? "لم يُدعَ" : "Not invited"}
                        </Badge>
                      )}
                    </TableCell>

                    {/* One menu with named items, replacing two unlabelled
                        icons whose only affordance was a `title` tooltip --
                        invisible on touch and awkward for screen readers, and
                        it hid every action except two. */}
                    <TableCell onClick={(e) => e.stopPropagation()} className="px-3 text-end">
                      <MemberRowActions
                        memberId={member.id}
                        memberName={member.full_name}
                        organizationId={organizationId}
                        phone={member.phone}
                        email={member.email}
                        balance={member.total_balance}
                        currency={currency}
                        isArchived={member.archived_at !== null}
                        canManage={canManage}
                        locale={locale}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="py-14 text-center">
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {isAr ? "لا يوجد أعضاء مطابقون لشروط البحث" : "No matching members found"}
                  </p>
                  {hasActiveFilters && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => pushParams({ q: undefined, ownership: undefined, arrears: undefined, page: undefined })}
                      className="text-xs font-bold text-indigo-600 mt-1"
                    >
                      {isAr ? "إلغاء جميع الفلاتر" : "Clear all filters"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>

          {/* Totals for the rows actually on screen. Without them the page
              answers "who owes" but never "how much, altogether". */}
          {members.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-800/70">
              <tr>
                <td />
                <td className="px-3 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                  {isAr ? `إجمالي ${members.length} عضو` : `${members.length} members`}
                </td>
                <td />
                <td className="px-3 py-2.5 text-center text-xs font-bold tabular-nums text-slate-800 dark:text-slate-200">
                  {members.reduce((sum, m) => sum + m.units_count, 0)}
                </td>
                <td />
                <td className="px-3 py-2.5 text-end text-xs font-bold tabular-nums">
                  <Money
                    amount={members.reduce((sum, m) => sum + m.total_balance, 0)}
                    locale={locale}
                    tone={
                      members.reduce((sum, m) => sum + m.total_balance, 0) > 0 ? "negative" : "positive"
                    }
                  />
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </Table>
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-5 py-2.5 shadow-2xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
            <span className="text-xs font-black text-slate-900 dark:text-white">
              {isAr ? `${selectedIds.size} عضو محدد` : `${selectedIds.size} selected`}
            </span>
            <Button
              size="sm"
              onClick={exportSelected}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-8 px-3 rounded-xl gap-1.5 shadow-xs"
            >
              <Download className="size-3.5" />
              <span>{isAr ? "تصدير المحدد (CSV)" : "Export Selected"}</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="h-8 px-2 text-slate-400 hover:text-slate-700"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
