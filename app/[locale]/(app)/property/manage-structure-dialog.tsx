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
          <Button size="sm" variant="outline">
            <Building className="size-3.5" />
            {isAr ? "المباني والمناطق" : "Buildings & zones"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPinned className="size-4.5" />
          </span>
          <div>
            <DialogTitle>{isAr ? "إضافة مبنى أو منطقة" : "Add a building or zone"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "أنشئ مبنى أو منطقة جديدة في هذا المنتجع لتظهر عند إضافة وحدة."
                : "Create a new building or zone in this resort so it shows up when adding a unit."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody>
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList>
              <TabsTrigger value="building">
                <span className="flex items-center gap-1.5">
                  <Building className="size-3.5" />
                  {isAr ? "مبنى جديد" : "New building"}
                </span>
              </TabsTrigger>
              <TabsTrigger value="zone">
                <span className="flex items-center gap-1.5">
                  <MapPinned className="size-3.5" />
                  {isAr ? "منطقة جديدة" : "New zone"}
                </span>
              </TabsTrigger>
              <TabsIndicator />
            </TabsList>
            <TabsPanel value="building">
              <CreateBuildingForm
                organizationId={organizationId}
                resortId={resortId}
                zones={zones}
                locale={locale}
                onSuccess={() => setOpen(false)}
              />
            </TabsPanel>
            <TabsPanel value="zone">
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
