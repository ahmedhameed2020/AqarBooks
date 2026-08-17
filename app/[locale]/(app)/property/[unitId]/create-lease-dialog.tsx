"use client";

import { useState } from "react";
import { UserPlus, Plus } from "lucide-react";
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
import { CreateLeaseForm } from "./create-lease-form";

type Option = { id: string; label: string };

export function CreateLeaseDialog({
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
            {isAr ? "عقد إيجار جديد" : "New lease"}
          </Button>
        }
      />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UserPlus className="size-4.5" />
          </span>
          <div>
            <DialogTitle>{isAr ? "إنشاء عقد إيجار" : "Create lease"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "يُنشأ العقد كمسودة أولًا، ثم يمكن تفعيله لاحقًا."
                : "The lease is created as a draft first, then can be activated later."}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody>
          <CreateLeaseForm
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
