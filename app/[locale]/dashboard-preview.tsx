export function DashboardPreview({ isAr }: { isAr: boolean }) {
  const stats = [
    { label: isAr ? "الإيراد (الفترة)" : "Revenue (period)", value: "412,500", tone: "up" },
    { label: isAr ? "نسبة التحصيل" : "Collection rate", value: "94%", tone: "up" },
    { label: isAr ? "ذمم مستحقة" : "Outstanding", value: "58,200", tone: "flat" },
    { label: isAr ? "رصيد البنك" : "Bank balance", value: "1,204,900", tone: "up" },
  ] as const;

  const rows = [
    { unit: "A-114", desc: isAr ? "رسوم صيانة" : "Maintenance fee", amount: "2,400", status: isAr ? "مدفوع" : "Paid" },
    { unit: "B-032", desc: isAr ? "اشتراك سنوي" : "Annual subscription", amount: "6,000", status: isAr ? "جزئي" : "Partial" },
    { unit: "C-209", desc: isAr ? "رسوم صيانة" : "Maintenance fee", amount: "2,400", status: isAr ? "متأخر" : "Overdue" },
  ] as const;

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="mx-auto w-full max-w-4xl overflow-hidden rounded-xl border border-[var(--mk-border-strong)] bg-[var(--mk-bg-elevated)] shadow-[0_40px_120px_-40px_oklch(0_0_0/0.8)]"
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--mk-border)] px-4 py-3">
        <span className="size-2.5 rounded-full bg-[var(--mk-text-muted)]/30" />
        <span className="size-2.5 rounded-full bg-[var(--mk-text-muted)]/30" />
        <span className="size-2.5 rounded-full bg-[var(--mk-text-muted)]/30" />
        <span className="ms-3 text-xs text-[var(--mk-text-muted)]">
          aqarbooks.app/{isAr ? "ar" : "en"}/finance/reports
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[var(--mk-border)] sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-[var(--mk-bg-elevated)] p-4">
            <p className="text-[11px] text-[var(--mk-text-muted)]">{s.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--mk-text)]">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="p-4">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="text-[11px] text-[var(--mk-text-muted)]">
              <th className="pb-2 text-start font-medium">{isAr ? "الوحدة" : "Unit"}</th>
              <th className="pb-2 text-start font-medium">{isAr ? "البيان" : "Description"}</th>
              <th className="pb-2 text-start font-medium">{isAr ? "المبلغ" : "Amount"}</th>
              <th className="pb-2 text-start font-medium">{isAr ? "الحالة" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.unit} className="border-t border-[var(--mk-border)]">
                <td className="py-2.5 font-medium text-[var(--mk-text)]">{r.unit}</td>
                <td className="py-2.5 text-[var(--mk-text-muted)]">{r.desc}</td>
                <td className="py-2.5 tabular-nums text-[var(--mk-text)]">{r.amount}</td>
                <td className="py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      r.status === (isAr ? "مدفوع" : "Paid")
                        ? "bg-[var(--mk-accent)]/15 text-[var(--mk-accent)]"
                        : r.status === (isAr ? "متأخر" : "Overdue")
                          ? "bg-red-500/15 text-red-400"
                          : "bg-[var(--mk-gold)]/15 text-[var(--mk-gold)]"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
