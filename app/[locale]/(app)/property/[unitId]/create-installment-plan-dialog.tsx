"use client";

import { useState } from "react";
import { Landmark, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateInstallmentPlanForm } from "./create-installment-plan-form";

type Option = { id: string; label: string };

export function CreateInstallmentPlanDialog({
  organizationId,
  unitId,
  members,
  dueTypes,
  receivableAccounts,
  locale,
}: {
  organizationId: string;
  unitId: string;
  members: Option[];
  dueTypes: Option[];
  receivableAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5">
            <Plus className="size-3.5" />
            {isAr ? "خطة تقسيط جديدة" : "New installment plan"}
          </Button>
        }
      />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Landmark className="size-4.5" />
          </span>
          <div>
            <DialogTitle>{isAr ? "إنشاء خطة تقسيط" : "Create installment plan"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "تُنشأ جميع الأقساط فورًا، ويصبح المشتري مالكًا للوحدة مباشرة."
                : "All installments are generated immediately, and the buyer becomes the unit's owner right away."}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody>
          <CreateInstallmentPlanForm
            organizationId={organizationId}
            unitId={unitId}
            members={members}
            dueTypes={dueTypes}
            receivableAccounts={receivableAccounts}
            locale={locale}
            onSuccess={() => setOpen(false)}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
