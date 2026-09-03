"use client";

import { useState } from "react";
import { Link2, UserPlus } from "lucide-react";
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
import { CreateMemberForm } from "./create-member-form";
import { LinkOwnershipForm } from "./link-ownership-form";

export function AddMemberDialog({
  organizationId,
  members,
  units,
  locale,
}: {
  organizationId: string;
  members: { id: string; full_name: string }[];
  units: { id: string; code: string; building_name_ar: string | null; building_name_en: string | null }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("member");

  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
      <DialogTrigger
        render={
          <Button size="sm">
            <UserPlus className="size-3.5" />
            {isAr ? "إضافة عضو" : "Add member"}
          </Button>
        }
      />
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <UserPlus className="size-4.5" />
          </span>
          <div>
            <DialogTitle>{isAr ? "إضافة عضو أو ربط ملكية" : "Add member or link ownership"}</DialogTitle>
            <DialogDescription>
              {isAr ? "أنشئ عضوًا جديدًا أو اربط عضوًا حاليًا بوحدة." : "Create a new member or link an existing one to a unit."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody>
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList>
              <TabsTrigger value="member">
                <span className="flex items-center gap-1.5">
                  <UserPlus className="size-3.5" />
                  {isAr ? "عضو جديد" : "New member"}
                </span>
              </TabsTrigger>
              <TabsTrigger value="ownership">
                <span className="flex items-center gap-1.5">
                  <Link2 className="size-3.5" />
                  {isAr ? "ربط ملكية" : "Link ownership"}
                </span>
              </TabsTrigger>
              <TabsIndicator />
            </TabsList>
            <TabsPanel value="member">
              <CreateMemberForm
                organizationId={organizationId}
                units={units}
                locale={locale}
                onSuccess={() => setOpen(false)}
              />
            </TabsPanel>
            <TabsPanel value="ownership">
              <LinkOwnershipForm
                organizationId={organizationId}
                members={members}
                units={units}
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
