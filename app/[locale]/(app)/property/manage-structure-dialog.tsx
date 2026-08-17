"use client";

import { useState } from "react";
import { Building, MapPinned } from "lucide-react";
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
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import { CreateBuildingForm } from "./create-building-form";
import { CreateZoneForm } from "./create-zone-form";

export function ManageStructureDialog({
  organizationId,
  resortId,
  zones,
  locale,
}: {
  organizationId: string;
  resortId: string;
  zones: { id: string; name_ar: string; name_en: string }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("building");

  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold shadow-2xs dark:border-slate-700 dark:bg-slate-900 dark:text-white cursor-pointer">
            <Building className="size-3.5 text-purple-600" />
            {isAr ? "إدارة المباني والمناطق" : "Buildings & Zones"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-xs">
            <MapPinned className="size-4.5" />
          </span>
          <div>
            <DialogTitle className="text-base font-black text-slate-900 dark:text-white">
              {isAr ? "إضافة مبنى أو منطقة عقارية" : "Add a Building or Zone"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 font-medium">
              {isAr
                ? "أنشئ مبنى أو منطقة جديدة في هذا الكيان العقاري لتظهر تلقائياً عند إضافة وتوزيع الوحدات."
                : "Create a new building or zone in this entity so it is selectable when adding units."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody>
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList className="grid w-full grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <TabsTrigger value="building" className="rounded-lg font-bold text-xs">
                <span className="flex items-center gap-1.5">
                  <Building className="size-3.5" />
                  {isAr ? "مبنى جديد" : "New Building"}
                </span>
              </TabsTrigger>
              <TabsTrigger value="zone" className="rounded-lg font-bold text-xs">
                <span className="flex items-center gap-1.5">
                  <MapPinned className="size-3.5" />
                  {isAr ? "منطقة جديدة" : "New Zone"}
                </span>
              </TabsTrigger>
              <TabsIndicator />
            </TabsList>
            <TabsPanel value="building" className="mt-4">
              <CreateBuildingForm
                organizationId={organizationId}
                resortId={resortId}
                zones={zones}
                locale={locale}
                onSuccess={() => setOpen(false)}
              />
            </TabsPanel>
            <TabsPanel value="zone" className="mt-4">
              <CreateZoneForm
                organizationId={organizationId}
                resortId={resortId}
                locale={locale}
                onSuccess={() => setOpen(false)}
              />
            </TabsPanel>
          </Tabs>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
