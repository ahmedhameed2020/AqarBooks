"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { UnitBalanceBadge } from "../property/unit-balance-badge";
import { MemberAvatar } from "./member-avatar";
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
      className={cn("flex items-center gap-1 text-start font-medium hover:text-foreground", className)}
    >
      {label}
      {active ? (
        currentDir === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowDown className="size-3.5" />
        )
      ) : (
        <ArrowUpDown className="size-3.5 opacity-40" />
      )}
    </button>
  );
}

function UnitsSummary({ codes, isAr }: { codes: string[]; isAr: boolean }) {
  if (!codes.length) return <span className="text-muted-foreground">—</span>;
  const shown = codes.slice(0, 3);
  const rest = codes.length - shown.length;
  return (
    <span title={codes.join(", ")}>
      {shown.join(isAr ? "، " : ", ")}
      {rest > 0 && ` +${rest}`}
    </span>
  );
}

export function MembersTable({
  members,
  unitCodesByMember,
  locale,
  currency,
}: {
  members: MemberRow[];
  unitCodesByMember: Map<string, string[]>;
  locale: string;
  currency: string;
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
    <div className="relative">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={(checked) => toggleAll(checked)}
                  aria-label={isAr ? "تحديد الكل" : "Select all"}
                />
              </TableHead>
              <TableHead>
                <SortHeader label={isAr ? "العضو" : "Member"} sortKey="name" currentSort={sort} currentDir={dir} />
              </TableHead>
              <TableHead>{isAr ? "البريد" : "Email"}</TableHead>
              <TableHead>
                <SortHeader label={isAr ? "الوحدات" : "Units"} sortKey="units" currentSort={sort} currentDir={dir} />
              </TableHead>
              <TableHead>{isAr ? "ملخص الوحدات" : "Unit summary"}</TableHead>
              <TableHead>
                <SortHeader label={isAr ? "الرصيد" : "Balance"} sortKey="balance" currentSort={sort} currentDir={dir} />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length ? (
              members.map((member, index) => (
                <TableRow
                  key={member.id}
                  ref={setRowRef(index)}
                  tabIndex={0}
                  onFocus={() => setActiveIndex(index)}
                  onKeyDown={onKeyDown}
                  onClick={() => pushParams({ member: member.id })}
                  className={cn(
                    "cursor-pointer outline-none",
                    index === activeIndex && "bg-muted/50 ring-1 ring-inset ring-ring",
                    member.has_arrears && "border-s-2 border-s-destructive/50 bg-destructive/3",
                  )}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(member.id)}
                      onCheckedChange={(checked) => toggleOne(member.id, checked)}
                      aria-label={isAr ? "تحديد" : "Select"}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <MemberAvatar id={member.id} name={member.full_name} />
                      <div className="min-w-0">
                        <Link
                          href={`/members/${member.id}`}
                          locale={locale}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate font-medium hover:underline"
                        >
                          {member.full_name}
                        </Link>
                        {member.phone && <p className="truncate text-xs text-muted-foreground">{member.phone}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.email ?? "—"}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{member.units_count}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <UnitsSummary codes={unitCodesByMember.get(member.id) ?? []} isAr={isAr} />
                  </TableCell>
                  <TableCell>
                    <UnitBalanceBadge balance={member.total_balance} currency={currency} locale={locale} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    {isAr ? "لا يوجد أعضاء مطابقون" : "No matching members"}
                  </p>
                  {hasActiveFilters && (
                    <Button variant="link" size="sm" onClick={() => pushParams({ q: undefined, ownership: undefined, arrears: undefined, page: undefined })}>
                      {isAr ? "مسح الفلاتر" : "Clear filters"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border bg-popover px-4 py-2 text-sm shadow-lg">
            <span className="font-medium tabular-nums">
              {isAr ? `${selectedIds.size} محدد` : `${selectedIds.size} selected`}
            </span>
            <Button size="sm" variant="outline" onClick={exportSelected}>
              <Download className="size-3.5" />
              {isAr ? "تصدير المحدد" : "Export selected"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
