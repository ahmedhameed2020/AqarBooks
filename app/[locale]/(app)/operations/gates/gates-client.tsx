"use client";

import { useMemo, useState, useTransition } from "react";
import { DoorOpen, Plus, Save, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createGateAction, updateGateAction } from "@/lib/actions/gates";

export interface GateManagementItem {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  directionMode: "ENTRY" | "EXIT" | "BOTH";
  isActive: boolean;
  propertyId: string;
  propertyName: string;
}

export interface GatePropertyOption {
  id: string;
  name: string;
}

type DraftGate = {
  propertyId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  directionMode: "ENTRY" | "EXIT" | "BOTH";
  isActive: boolean;
};

const emptyDraft = (propertyId = ""): DraftGate => ({
  propertyId,
  code: "",
  nameAr: "",
  nameEn: "",
  directionMode: "BOTH",
  isActive: true,
});

export function GatesClient({
  gates,
  properties,
  canManage,
  locale,
}: {
  gates: GateManagementItem[];
  properties: GatePropertyOption[];
  canManage: boolean;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftGate>(emptyDraft(properties[0]?.id));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return gates;
    return gates.filter((gate) =>
      [gate.code, gate.nameAr, gate.nameEn, gate.propertyName].some((value) => value.toLowerCase().includes(q)),
    );
  }, [gates, query]);

  function editGate(gate: GateManagementItem) {
    setEditingId(gate.id);
    setDraft({
      propertyId: gate.propertyId,
      code: gate.code,
      nameAr: gate.nameAr,
      nameEn: gate.nameEn,
      directionMode: gate.directionMode,
      isActive: gate.isActive,
    });
    setMessage(null);
  }

  function resetForm() {
    setEditingId(null);
    setDraft(emptyDraft(properties[0]?.id));
    setMessage(null);
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = editingId
        ? await updateGateAction({ gateId: editingId, ...draft })
        : await createGateAction(draft);
      setMessage(result.ok ? (isAr ? "تم حفظ البوابة" : "Gate saved") : result.error);
      if (result.ok) resetForm();
    });
  }

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
          {isAr ? "إدارة البوابات" : "Gate Management"}
        </h1>
        <p className="text-xs font-medium text-slate-500">
          {isAr ? "تعريف بوابات العقارات واتجاهات الدخول والخروج." : "Configure property gates and their supported directions."}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plus className="size-4 text-slate-500" />
            <h2 className="text-sm font-black text-slate-950 dark:text-white">
              {editingId ? (isAr ? "تعديل بوابة" : "Edit gate") : isAr ? "بوابة جديدة" : "New gate"}
            </h2>
          </div>
          <div className="space-y-3">
            <label className="space-y-1 text-xs font-bold text-slate-600 dark:text-slate-300">
              <span>{isAr ? "العقار" : "Property"}</span>
              <select
                value={draft.propertyId}
                onChange={(event) => setDraft((value) => ({ ...value, propertyId: event.target.value }))}
                disabled={!canManage || Boolean(editingId)}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>{property.name}</option>
                ))}
              </select>
            </label>
            <Input value={draft.code} onChange={(event) => setDraft((value) => ({ ...value, code: event.target.value }))} disabled={!canManage} placeholder={isAr ? "الكود" : "Code"} className="h-10 rounded-xl" />
            <Input value={draft.nameAr} onChange={(event) => setDraft((value) => ({ ...value, nameAr: event.target.value }))} disabled={!canManage} placeholder="اسم البوابة بالعربية" className="h-10 rounded-xl" />
            <Input value={draft.nameEn} onChange={(event) => setDraft((value) => ({ ...value, nameEn: event.target.value }))} disabled={!canManage} placeholder="Gate name in English" className="h-10 rounded-xl" />
            <select
              value={draft.directionMode}
              onChange={(event) => setDraft((value) => ({ ...value, directionMode: event.target.value as DraftGate["directionMode"] }))}
              disabled={!canManage}
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="BOTH">{isAr ? "دخول وخروج" : "Entry and exit"}</option>
              <option value="ENTRY">{isAr ? "دخول فقط" : "Entry only"}</option>
              <option value="EXIT">{isAr ? "خروج فقط" : "Exit only"}</option>
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-border/70 p-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft((value) => ({ ...value, isActive: event.target.checked }))}
                disabled={!canManage}
                className="size-4"
              />
              {isAr ? "البوابة مفعلة" : "Gate active"}
            </label>
            {message ? <p className="text-xs font-semibold text-slate-500">{message}</p> : null}
            <div className="flex gap-2">
              <Button type="button" onClick={submit} disabled={!canManage || isPending || properties.length === 0} className="h-10 gap-2 rounded-xl">
                <Save className="size-4" />
                {isAr ? "حفظ" : "Save"}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={resetForm} className="h-10 rounded-xl">
                  {isAr ? "إلغاء" : "Cancel"}
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card">
          <div className="border-b border-border/70 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isAr ? "بحث في البوابات" : "Search gates"} className="h-10 rounded-xl ps-9" />
            </div>
          </div>
          <div className="divide-y divide-border/70">
            {visible.length === 0 ? (
              <div className="p-10 text-center">
                <DoorOpen className="mx-auto mb-3 size-8 text-slate-400" />
                <p className="text-sm font-bold text-slate-900 dark:text-white">{isAr ? "لا توجد بوابات" : "No gates yet"}</p>
              </div>
            ) : visible.map((gate) => (
              <div key={gate.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_.7fr_.5fr_auto] lg:items-center">
                <div>
                  <p className="text-[11px] font-bold text-slate-400">{gate.code}</p>
                  <p className="text-sm font-black text-slate-950 dark:text-white">{isAr ? gate.nameAr : gate.nameEn}</p>
                  <p className="text-xs text-slate-500">{gate.propertyName}</p>
                </div>
                <Badge variant="outline" className="w-fit">{gate.directionMode}</Badge>
                <Badge variant="outline" className={gate.isActive ? "w-fit border-emerald-200 bg-emerald-50 text-emerald-700" : "w-fit border-slate-200 bg-slate-50 text-slate-600"}>
                  {gate.isActive ? (isAr ? "مفعلة" : "Active") : isAr ? "متوقفة" : "Inactive"}
                </Badge>
                {canManage ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => editGate(gate)} className="h-8 rounded-xl text-xs">
                    {isAr ? "تعديل" : "Edit"}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
