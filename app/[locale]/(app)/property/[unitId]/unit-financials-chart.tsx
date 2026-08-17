"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { MonthlyFinancialPoint } from "@/lib/property/unit-financials";

const SERIES = {
  dued: "#6366f1",
  paid: "#10b981",
} as const;
const GRID = "color-mix(in oklab, currentColor 10%, transparent)";
const INK_MUTED = "color-mix(in oklab, currentColor 60%, transparent)";

export function UnitFinancialsChart({
  data,
  labels,
}: {
  data: MonthlyFinancialPoint[];
  labels: { dued: string; paid: string; empty: string };
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border/60 text-sm text-muted-foreground">
        {labels.empty}
      </div>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={false} width={48} />
          <Tooltip cursor={{ fill: GRID }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="dued" name={labels.dued} fill={SERIES.dued} radius={[4, 4, 0, 0]} />
          <Bar dataKey="paid" name={labels.paid} fill={SERIES.paid} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
