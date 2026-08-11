"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  AreaChart,
  Area,
} from "recharts";

const SERIES = {
  light: { revenue: "#2563eb", expense: "#f59e0b", forecast: "#10b981" },
  dark: { revenue: "#3b82f6", expense: "#fbbf24", forecast: "#34d399" },
} as const;

const GRID = "color-mix(in oklab, currentColor 10%, transparent)";
const INK_MUTED = "color-mix(in oklab, currentColor 60%, transparent)";

export type MonthPoint = {
  month: string;
  revenue: number;
  expenses: number;
};

export type AgingPoint = {
  bucket: string;
  amount: number;
};

export type ForecastPoint = {
  period: string;
  projectedIncoming: number;
  expectedExpenses: number;
};

function useIsDark() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function ChartTooltip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  fmt: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-popover/90 px-3.5 py-2.5 text-xs shadow-lg backdrop-blur-md">
      <p className="mb-1.5 font-semibold text-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map((p) => (
          <p key={p.name} className="flex items-center justify-between gap-3 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-semibold tabular-nums text-foreground">{fmt(p.value)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function RevenueExpenseTrend({
  data,
  isAr,
  currency,
}: {
  data: MonthPoint[];
  isAr: boolean;
  currency: string;
}) {
  const dark = useIsDark();
  const colors = dark ? SERIES.dark : SERIES.light;
  const fmt = (n: number) => n.toLocaleString(isAr ? "ar-EG" : "en-US", { maximumFractionDigits: 0 });
  const revLabel = isAr ? "الإيرادات" : "Revenue";
  const expLabel = isAr ? "المصروفات" : "Expenses";

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 12, left: isAr ? 0 : 4, right: isAr ? 4 : 0 }}>
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.revenue} stopOpacity={0.4} />
            <stop offset="95%" stopColor={colors.revenue} stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={colors.expense} stopOpacity={0.3} />
            <stop offset="95%" stopColor={colors.expense} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: INK_MUTED }}
          axisLine={false}
          tickLine={false}
          reversed={isAr}
        />
        <YAxis
          tick={{ fontSize: 11, fill: INK_MUTED }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmt}
          width={54}
          orientation={isAr ? "right" : "left"}
        />
        <Tooltip
          cursor={{ stroke: "color-mix(in oklab, currentColor 15%, transparent)", strokeDasharray: "3 3" }}
          content={<ChartTooltip fmt={(n) => `${fmt(n)} ${currency}`} />}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          name={revLabel}
          stroke={colors.revenue}
          strokeWidth={2.5}
          fillOpacity={1}
          fill="url(#revenueGrad)"
        />
        <Area
          type="monotone"
          dataKey="expenses"
          name={expLabel}
          stroke={colors.expense}
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#expenseGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function AgingChart({
  data,
  isAr,
  currency,
}: {
  data: AgingPoint[];
  isAr: boolean;
  currency: string;
}) {
  const dark = useIsDark();
  // Color palette transition from Current (Emerald/Blue) to Severe Overdue (Rose/Red)
  const RAMP = dark
    ? ["#34d399", "#60a5fa", "#fbbf24", "#f97316", "#f43f5e"]
    : ["#10b981", "#3b82f6", "#f59e0b", "#ea580c", "#e11d48"];

  const fmt = (n: number) => n.toLocaleString(isAr ? "ar-EG" : "en-US", { maximumFractionDigits: 0 });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: INK_MUTED }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmt}
          reversed={isAr}
        />
        <YAxis
          type="category"
          dataKey="bucket"
          tick={{ fontSize: 11, fill: INK_MUTED }}
          axisLine={false}
          tickLine={false}
          width={76}
          orientation={isAr ? "right" : "left"}
        />
        <Tooltip
          cursor={{ fill: "color-mix(in oklab, currentColor 6%, transparent)" }}
          content={<ChartTooltip fmt={(n) => `${fmt(n)} ${currency}`} />}
        />
        <Bar dataKey="amount" name={isAr ? "المتبقي" : "Outstanding"} radius={[0, 6, 6, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={i} fill={RAMP[Math.min(i, RAMP.length - 1)]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CollectionTargetGauge({
  rate,
  isAr,
}: {
  rate: number | null;
  isAr: boolean;
}) {
  const val = rate ?? 0;
  const target = 90;
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (val / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div className="relative flex size-32 items-center justify-center">
        <svg className="size-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            className="stroke-muted"
            strokeWidth="8"
            fill="transparent"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            className="stroke-primary transition-all duration-1000 ease-out"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <div className="absolute text-center">
          <span className="text-2xl font-bold tabular-nums text-foreground">{val}%</span>
          <p className="text-[10px] text-muted-foreground">{isAr ? "نسبة التحصيل" : "Collected"}</p>
        </div>
      </div>
      <div className="mt-3 text-center text-xs text-muted-foreground">
        {isAr ? `الهدف الشهري: ${target}%` : `Monthly Goal: ${target}%`}
        {val >= target ? (
          <span className="ms-1 font-semibold text-emerald-500">🎉 {isAr ? "تم تحقيق الهدف!" : "Target met!"}</span>
        ) : (
          <span className="ms-1 font-semibold text-amber-500">({target - val}% {isAr ? "متبقي" : "remaining"})</span>
        )}
      </div>
    </div>
  );
}
