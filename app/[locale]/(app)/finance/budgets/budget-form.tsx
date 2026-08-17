"use client";

import { Fragment, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveBudgets } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";

export type BudgetAccount = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  category: "REVENUE" | "EXPENSE";
  amount: number | null;
};

const GROUPS = [
  { category: "REVENUE" as const, labelAr: "الإيرادات", labelEn: "Revenue" },
  { category: "EXPENSE" as const, labelAr: "المصروفات", labelEn: "Expenses" },
];

export function BudgetForm({
  organizationId,
  fiscalPeriodId,
  accounts,
  locale,
  canManage,
}: {
  organizationId: string;
  fiscalPeriodId: string;
  accounts: BudgetAccount[];
  locale: string;
  canManage: boolean;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(saveBudgets, {
    ok: true,
  });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="fiscalPeriodId" value={fiscalPeriodId} />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الحساب" : "Account"}</TableHead>
              <TableHead className="w-48">{isAr ? "الموازنة التقديرية" : "Budgeted amount"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {GROUPS.map((group) => {
              const groupAccounts = accounts.filter((a) => a.category === group.category);
              return (
                <Fragment key={group.category}>
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-semibold" colSpan={2}>
                      {isAr ? group.labelAr : group.labelEn}
                    </TableCell>
                  </TableRow>
                  {groupAccounts.length === 0 ? (
                    <TableRow>
                      <TableCell className="ps-6 text-muted-foreground" colSpan={2}>
                        {isAr ? "لا توجد حسابات" : "No accounts"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    groupAccounts.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="ps-6">
                          <span className="text-muted-foreground tabular-nums">{a.code}</span>{" "}
                          {isAr ? a.name_ar : a.name_en}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            name={`amount_${a.id}`}
                            defaultValue={a.amount ?? ""}
                            disabled={!canManage}
                            placeholder={isAr ? "غير محدد" : "Not set"}
                            className="tabular-nums"
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {canManage && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending
              ? isAr
                ? "جارٍ الحفظ…"
                : "Saving…"
              : isAr
                ? "حفظ الموازنة"
                : "Save budget"}
          </Button>
          {state.ok === false && (
            <span className="text-sm text-destructive">
              {state.error === "invalid_amount"
                ? isAr
                  ? "المبالغ يجب أن تكون أرقامًا موجبة."
                  : "Amounts must be positive numbers."
                : isAr
                  ? `تعذّر الحفظ: ${state.error}`
                  : `Could not save: ${state.error}`}
            </span>
          )}
        </div>
      )}
      {!canManage && (
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لديك صلاحية الاطلاع فقط. تحتاج صلاحية «إدارة الموازنات» للتعديل."
            : "You have read-only access. The manage budgets permission is required to edit."}
        </p>
      )}
    </form>
  );
}
