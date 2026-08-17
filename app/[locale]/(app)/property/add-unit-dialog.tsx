"use client";

import { useState } from "react";
import { Building2, Plus } from "lucide-react";
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
          <Button size="sm" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold shadow-md shadow-purple-600/20 cursor-pointer">
            <Plus className="size-4" />
            {isAr ? "إضافة وحدة جديدة" : "Add Unit"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-xs">
            <Building2 className="size-4.5" />
          </span>
          <div>
            <DialogTitle className="text-base font-black text-slate-900 dark:text-white">
              {isAr ? "إضافة وحدة عقارية جديدة" : "Add a New Unit"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 font-medium">
              {isAr
                ? "أضف وحدة جديدة إلى هذا الكيان العقاري وسجّل تفاصيل المساحة ونوع الاستخدام."
                : "Add a new unit to this real estate entity with area and usage specifications."}
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
