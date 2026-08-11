"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
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
import { CreateUnitForm } from "./create-unit-form";

export function AddUnitDialog({
  organizationId,
  resortId,
  buildings,
  zones,
  locale,
}: {
  organizationId: string;
  resortId: string;
  buildings: { id: string; name_ar: string; name_en: string }[];
  zones: { id: string; name_ar: string; name_en: string }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Building2 className="size-3.5" />
            {isAr ? "إضافة وحدة" : "Add unit"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-4.5" />
          </span>
          <div>
            <DialogTitle>{isAr ? "إضافة وحدة جديدة" : "Add a new unit"}</DialogTitle>
            <DialogDescription>
              {isAr ? "أضف وحدة جديدة إلى هذا المنتجع." : "Add a new unit to this resort."}
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody>
          <CreateUnitForm
            organizationId={organizationId}
            resortId={resortId}
            buildings={buildings}
            zones={zones}
            locale={locale}
            onSuccess={() => setOpen(false)}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
