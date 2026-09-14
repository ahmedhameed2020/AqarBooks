"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMaintenanceRequestAction } from "@/lib/actions/maintenance";
import type { MaintenancePriority } from "../portal-maintenance-client";

export interface MaintenanceUnitOption {
  id: string;
  label: string;
}

export interface MaintenanceCategoryOption {
  id: string;
  label: string;
  defaultPriority: MaintenancePriority;
}

const PRIORITIES: MaintenancePriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export function NewMaintenanceRequestForm({
  units,
  categories,
  locale,
}: {
  units: MaintenanceUnitOption[];
  categories: MaintenanceCategoryOption[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<MaintenancePriority>(categories[0]?.defaultPriority ?? "NORMAL");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const category = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId]);

  function onCategoryChange(next: string) {
    setCategoryId(next);
    const selected = categories.find((c) => c.id === next);
    if (selected) setPriority(selected.defaultPriority);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createMaintenanceRequestAction({
        unitId,
        categoryId,
        title,
        description,
        priority,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.requestId) {
        setError("failed");
        return;
      }
      router.push(`/portal/maintenance/${result.requestId}`);
    });
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border/70 bg-card p-4 shadow-2xs sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{isAr ? "الوحدة" : "Unit"}</span>
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>{isAr ? "التصنيف" : "Category"}</span>
          <select
            value={categoryId}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      </div>

      <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <span>{isAr ? "عنوان مختصر" : "Short title"}</span>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          className="h-10 rounded-xl"
          placeholder={isAr ? "مثال: تسريب مياه من التكييف" : "Example: AC water leak"}
        />
      </label>

      <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <span>{isAr ? "وصف المشكلة" : "Problem description"}</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          rows={5}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          placeholder={isAr ? "اكتب ما يحدث، المكان داخل الوحدة، وأي تفاصيل تساعد فريق الإدارة." : "Describe what is happening, where it is inside the unit, and any useful context."}
        />
      </label>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{isAr ? "الأولوية" : "Priority"}</p>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                priority === p
                  ? "border-indigo-500 bg-indigo-600 text-white"
                  : "border-border/70 bg-background text-slate-600 hover:bg-slate-50"
              }`}
            >
              {isAr
                ? ({ LOW: "منخفضة", NORMAL: "عادية", HIGH: "عالية", URGENT: "عاجلة" } as const)[p]
                : ({ LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" } as const)[p]}
            </button>
          ))}
        </div>
        {category ? (
          <p className="text-[11px] text-slate-400">
            {isAr ? "الأولوية الافتراضية لهذا التصنيف يمكن تعديلها قبل الإرسال." : "The category default priority can be adjusted before submission."}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{isAr ? "تعذر إنشاء الطلب. تأكد من الوحدة والتصنيف وحاول مرة أخرى." : "Could not create the request. Check the unit/category and try again."}</span>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          disabled={isPending || !unitId || !categoryId || title.trim().length < 3 || description.trim().length < 10}
          onClick={submit}
          className="h-10 gap-2 rounded-xl text-xs font-semibold"
        >
          <Send className="size-4" />
          {isAr ? "إرسال الطلب" : "Submit Request"}
        </Button>
      </div>
    </div>
  );
}
