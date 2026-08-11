"use client";

import { Button } from "@/components/ui/button";
import { useMembersNav } from "./members-nav-context";

export function MembersPagination({
  page,
  totalPages,
  totalCount,
  locale,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  locale: string;
}) {
  const isAr = locale === "ar";
  const { pushParams } = useMembersNav();

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between text-sm">
      <p className="text-muted-foreground">
        {isAr ? `صفحة ${page} من ${totalPages} (${totalCount} عضو)` : `Page ${page} of ${totalPages} (${totalCount} members)`}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Button variant="outline" size="sm" onClick={() => pushParams({ page: String(page - 1) })}>
            {isAr ? "السابق" : "Previous"}
          </Button>
        )}
        {page < totalPages && (
          <Button variant="outline" size="sm" onClick={() => pushParams({ page: String(page + 1) })}>
            {isAr ? "التالي" : "Next"}
          </Button>
        )}
      </div>
    </div>
  );
}
