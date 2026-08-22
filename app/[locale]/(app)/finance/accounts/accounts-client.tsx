"use client";

import { useMemo, useState } from "react";
import {
  Search,
  ChevronRight,
  ChevronDown,
  Pencil,
  AlertTriangle,
  Folder,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACCOUNT_CATEGORIES,
  categoryLabel,
  categoryTone,
  normalBalanceLabel,
  cashFlowSectionLabel,
} from "@/lib/accounting/account-labels";
import { EditAccountDialog } from "./edit-account-dialog";

export type AccountRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  parent_id: string | null;
  category: string;
  normal_balance: string;
  is_group: boolean;
  is_active: boolean;
  is_used: boolean;
  requires_cost_center: boolean;
  is_cash_equivalent: boolean;
  cash_flow_section: string | null;
};

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "UNCLASSIFIED";

/**
 * Cash and bank accounts carry `is_cash_equivalent` with a null section on
 * purpose: cash is what the statement reconciles to, not a section inside it.
 * Only a postable, non-cash account with no section is genuinely missing one,
 * and flagging the cash accounts would be advice to misclassify them.
 */
function needsSection(account: AccountRow): boolean {
  return !account.is_group && !account.is_cash_equivalent && !account.cash_flow_section;
}

/** Depth-first order, parents before children, siblings by code. */
function buildTree(accounts: AccountRow[]) {
  const byParent = new Map<string | null, AccountRow[]>();
  for (const account of accounts) {
    const list = byParent.get(account.parent_id) ?? [];
    list.push(account);
    byParent.set(account.parent_id, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }

  // Orphans (parent filtered out or missing) would vanish entirely if we only
  // walked from null, so anything whose parent is not in the set roots here.
  const ids = new Set(accounts.map((a) => a.id));
  const roots = accounts.filter((a) => !a.parent_id || !ids.has(a.parent_id));
  roots.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const out: (AccountRow & { depth: number; childCount: number })[] = [];
  const walk = (node: AccountRow, depth: number) => {
    const children = (byParent.get(node.id) ?? []).filter((c) => ids.has(c.id));
    out.push({ ...node, depth, childCount: children.length });
    for (const child of children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return out;
}

export function AccountsClient({
  accounts,
  canManage,
  locale,
}: {
  accounts: AccountRow[];
  canManage: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AccountRow | null>(null);

  const unclassifiedCount = useMemo(() => accounts.filter(needsSection).length, [accounts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (category !== "ALL" && a.category !== category) return false;
      if (status === "ACTIVE" && !a.is_active) return false;
      if (status === "INACTIVE" && a.is_active) return false;
      if (status === "UNCLASSIFIED" && !needsSection(a)) return false;
      if (!q) return true;
      return (
        a.code.toLowerCase().includes(q) ||
        a.name_ar.toLowerCase().includes(q) ||
        a.name_en.toLowerCase().includes(q)
      );
    });
  }, [accounts, query, category, status]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // A collapsed group hides its whole subtree, so hidden rows are those with a
  // collapsed ancestor. Tracked by depth while scanning the flat ordered list.
  const visible = useMemo(() => {
    const rows: typeof tree = [];
    let hideBelow: number | null = null;
    for (const row of tree) {
      if (hideBelow !== null && row.depth > hideBelow) continue;
      hideBelow = null;
      rows.push(row);
      if (collapsed.has(row.id) && row.childCount > 0) hideBelow = row.depth;
    }
    return rows;
  }, [tree, collapsed]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isFiltering = query.trim() !== "" || category !== "ALL" || status !== "ALL";

  return (
    <div className="space-y-4">
      {/* Cash flow classification is invisible everywhere else in the product,
          so an unclassified account silently drops out of the statement. */}
      {unclassifiedCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">
              {isAr
                ? `${unclassifiedCount} حساب بلا تصنيف في قائمة التدفقات النقدية`
                : `${unclassifiedCount} accounts have no cash flow classification`}
            </p>
            <p className="text-xs text-amber-800">
              {isAr
                ? "الحسابات غير المصنّفة لا تظهر في قائمة التدفقات النقدية. حدّد قسم كل حساب من زر التعديل."
                : "Unclassified accounts are omitted from the cash flow statement. Set each account's section from the edit action."}
            </p>
            <button
              type="button"
              onClick={() => setStatus(status === "UNCLASSIFIED" ? "ALL" : "UNCLASSIFIED")}
              className="text-xs font-bold underline underline-offset-2"
            >
              {status === "UNCLASSIFIED"
                ? isAr
                  ? "عرض كل الحسابات"
                  : "Show all accounts"
                : isAr
                  ? "عرض غير المصنّفة فقط"
                  : "Show only unclassified"}
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isAr ? "ابحث برمز الحساب أو اسمه" : "Search by code or name"}
            className="ps-9"
            aria-label={isAr ? "بحث في دليل الحسابات" : "Search chart of accounts"}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={category === "ALL"} onClick={() => setCategory("ALL")}>
            {isAr ? "الكل" : "All"}
          </FilterChip>
          {ACCOUNT_CATEGORIES.map((c) => (
            <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {categoryLabel(c, isAr)}
            </FilterChip>
          ))}
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          aria-label={isAr ? "تصفية حسب الحالة" : "Filter by status"}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="ALL">{isAr ? "كل الحالات" : "All statuses"}</option>
          <option value="ACTIVE">{isAr ? "نشط" : "Active"}</option>
          <option value="INACTIVE">{isAr ? "موقوف" : "Inactive"}</option>
          <option value="UNCLASSIFIED">{isAr ? "بلا تصنيف تدفقات" : "Unclassified cash flow"}</option>
        </select>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {isAr
          ? `عرض ${visible.length} من ${accounts.length} حساب`
          : `Showing ${visible.length} of ${accounts.length} accounts`}
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-table-header text-xs">
            <tr className="text-start">
              <th className="px-3 py-2.5 text-start font-semibold">{isAr ? "الرمز" : "Code"}</th>
              <th className="px-3 py-2.5 text-start font-semibold">{isAr ? "الاسم" : "Name"}</th>
              <th className="px-3 py-2.5 text-start font-semibold">{isAr ? "التصنيف" : "Category"}</th>
              <th className="px-3 py-2.5 text-start font-semibold">
                {isAr ? "الرصيد الطبيعي" : "Normal balance"}
              </th>
              <th className="px-3 py-2.5 text-start font-semibold">
                {isAr ? "التدفقات النقدية" : "Cash flow"}
              </th>
              <th className="px-3 py-2.5 text-end font-semibold">
                <span className="sr-only">{isAr ? "إجراءات" : "Actions"}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.length ? (
              visible.map((account) => {
                const name = isAr ? account.name_ar : account.name_en;
                const isCollapsed = collapsed.has(account.id);
                return (
                  <tr
                    key={account.id}
                    className={`transition-colors hover:bg-muted/40 ${
                      account.is_active ? "" : "opacity-55"
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                      {account.code}
                    </td>

                    <td className="px-3 py-2">
                      <div
                        className="flex items-center gap-1.5"
                        style={{ paddingInlineStart: `${account.depth * 1.15}rem` }}
                      >
                        {account.childCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggle(account.id)}
                            aria-expanded={!isCollapsed}
                            aria-label={
                              isAr ? `طي أو فتح ${name}` : `Collapse or expand ${name}`
                            }
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="size-3.5 rtl:rotate-180" />
                            ) : (
                              <ChevronDown className="size-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="inline-block w-[1.375rem]" />
                        )}

                        {account.is_group ? (
                          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileText className="size-3.5 shrink-0 text-muted-foreground/60" />
                        )}

                        <span className={account.is_group ? "font-semibold" : ""}>{name}</span>

                        {!account.is_active && (
                          <Badge variant="outline" className="ms-1 border-slate-300 text-[10px] text-slate-500">
                            {isAr ? "موقوف" : "Inactive"}
                          </Badge>
                        )}
                        {account.is_used && (
                          <span
                            className="ms-1 text-[10px] text-muted-foreground"
                            title={isAr ? "توجد قيود مرحّلة على هذا الحساب" : "Has posted entries"}
                          >
                            {isAr ? "مُستخدم" : "in use"}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${categoryTone(
                          account.category,
                        )}`}
                      >
                        {categoryLabel(account.category, isAr)}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {normalBalanceLabel(account.normal_balance, isAr)}
                    </td>

                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {account.is_group ? (
                        <span className="text-muted-foreground/50">{isAr ? "لا ينطبق" : "n/a"}</span>
                      ) : account.is_cash_equivalent ? (
                        <span className="font-medium text-emerald-700">
                          {isAr ? "نقدية وما في حكمها" : "Cash & equivalents"}
                          {account.cash_flow_section && (
                            <span className="ms-1 font-normal text-muted-foreground">
                              · {cashFlowSectionLabel(account.cash_flow_section, isAr)}
                            </span>
                          )}
                        </span>
                      ) : account.cash_flow_section ? (
                        <span className="text-muted-foreground">
                          {cashFlowSectionLabel(account.cash_flow_section, isAr)}
                        </span>
                      ) : (
                        <span className="font-medium text-amber-600">
                          {isAr ? "بلا تصنيف" : "Unclassified"}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-end">
                      {canManage && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(account)}
                          className="h-7 gap-1.5 px-2 text-xs"
                        >
                          <Pencil className="size-3.5" />
                          {isAr ? "تعديل" : "Edit"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {isFiltering
                    ? isAr
                      ? "لا توجد حسابات مطابقة لبحثك."
                      : "No accounts match your search."
                    : isAr
                      ? "لا توجد حسابات بعد."
                      : "No accounts yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditAccountDialog
          account={editing}
          allAccounts={accounts}
          locale={locale}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
