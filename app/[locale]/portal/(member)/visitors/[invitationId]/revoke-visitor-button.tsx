"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revokeVisitorInvitationAction } from "@/lib/actions/visitors";

export function RevokeVisitorButton({
  invitationId,
  locale,
}: {
  invitationId: string;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function revoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeVisitorInvitationAction({ invitationId });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={revoke}
        disabled={isPending}
        className="h-9 gap-2 rounded-xl border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
        {isAr ? "إلغاء التصريح" : "Revoke Pass"}
      </Button>
      {error ? <p className="text-xs font-semibold text-rose-600">{isAr ? "تعذر إلغاء التصريح." : "Could not revoke this pass."}</p> : null}
    </div>
  );
}
