"use client";

import { useRouter } from "@/i18n/navigation";

export function AccountPicker({
  accounts,
  selectedId,
  locale,
}: {
  accounts: { id: string; code: string; name_ar: string; name_en: string }[];
  selectedId?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();

  return (
    <select
      className="rounded-md border border-input bg-transparent p-1.5 text-sm"
      defaultValue={selectedId ?? ""}
      onChange={(e) => router.push(`/finance/reports/general-ledger?accountId=${e.target.value}`)}
    >
      <option value="" disabled>
        {isAr ? "اختر حسابًا" : "Select an account"}
      </option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.code} — {isAr ? a.name_ar : a.name_en}
        </option>
      ))}
    </select>
  );
}
