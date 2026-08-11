"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  submitForReviewAction,
  postJournalEntryAction,
  reverseJournalEntryAction,
} from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";

export function EntryActions({
  journalEntryId,
  status,
  openPeriods,
  locale,
}: {
  journalEntryId: string;
  status: string;
  openPeriods: { id: string; name: string }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [showReverse, setShowReverse] = useState(false);

  const [submitState, submitAction, submitPending] = useActionState<ActionResult, FormData>(
    submitForReviewAction,
    { ok: true },
  );
  const [postState, postAction, postPending] = useActionState<ActionResult, FormData>(
    postJournalEntryAction,
    { ok: true },
  );
  const [reverseState, reverseAction, reversePending] = useActionState<ActionResult, FormData>(
    reverseJournalEntryAction,
    { ok: true },
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" && (
          <form action={submitAction}>
            <input type="hidden" name="journalEntryId" value={journalEntryId} />
            <Button type="submit" variant="outline" disabled={submitPending}>
              {isAr ? "إرسال للمراجعة" : "Submit for review"}
            </Button>
          </form>
        )}
        {(status === "DRAFT" || status === "UNDER_REVIEW") && (
          <form action={postAction}>
            <input type="hidden" name="journalEntryId" value={journalEntryId} />
            <Button type="submit" disabled={postPending}>
              {isAr ? "ترحيل" : "Post"}
            </Button>
          </form>
        )}
        {status === "POSTED" && (
          <Button type="button" variant="destructive" onClick={() => setShowReverse((s) => !s)}>
            {isAr ? "عكس القيد" : "Reverse entry"}
          </Button>
        )}
      </div>

      {!submitState.ok && <p className="text-sm text-destructive">{submitState.error}</p>}
      {!postState.ok && <p className="text-sm text-destructive">{postState.error}</p>}
      {!reverseState.ok && <p className="text-sm text-destructive">{reverseState.error}</p>}

      {showReverse && (
        <form action={reverseAction} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
          <input type="hidden" name="journalEntryId" value={journalEntryId} />
          <div className="space-y-2">
            <Label htmlFor="reversalFiscalPeriodId">{isAr ? "فترة العكس" : "Reversal period"}</Label>
            <Select name="reversalFiscalPeriodId" defaultValue={openPeriods[0]?.id}>
              <SelectTrigger id="reversalFiscalPeriodId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {openPeriods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reversalDate">{isAr ? "تاريخ العكس" : "Reversal date"}</Label>
            <Input id="reversalDate" name="reversalDate" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">{isAr ? "السبب" : "Reason"}</Label>
            <Input id="reason" name="reason" />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" variant="destructive" disabled={reversePending}>
              {isAr ? "تأكيد العكس" : "Confirm reversal"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
