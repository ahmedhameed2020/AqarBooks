"use client";

import { useState, useMemo } from "react";
import { 
  Activity, 
  Search, 
  ShieldCheck, 
  Clock, 
  Filter, 
  Layers, 
  Hash,
  AlertCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AuditLogItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  created_at: string;
}

export function AuditClient({
  entries,
  locale,
}: {
  entries: AuditLogItem[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");

  const actionTypes = useMemo(() => {
    return Array.from(new Set(entries.map((e) => e.action)));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchesSearch =
        e.action.toLowerCase().includes(search.toLowerCase()) ||
        e.entity_type.toLowerCase().includes(search.toLowerCase()) ||
        (e.entity_id ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (e.reason ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesAction = actionFilter === "ALL" || e.action === actionFilter;
      return matchesSearch && matchesAction;
    });
  }, [entries, search, actionFilter]);

  return (
    <div className="space-y-6 max-w-7xl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              {isAr ? "سجل تدقيق وأمان المنصة" : "Platform Audit & Security Trail"}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              {entries.length} {isAr ? "حدث موثّق" : "events"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isAr
              ? "سجل غير قابل للتعديل يوثق كافة الإجراءات الحساسة، تعديل الحالات، وإسناد الاشتراكات."
              : "Immutable audit log tracking all high-privilege operations, status changes, and plan updates."}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-2 rounded-2xl border bg-card/60 backdrop-blur-md shadow-xs">
        
        {/* Actions Dropdown / Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setActionFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
              actionFilter === "ALL"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {isAr ? "جميع الإجراءات" : "All Actions"} ({entries.length})
          </button>
          
          {actionTypes.slice(0, 4).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => setActionFilter(action)}
              className={`px-3 py-1.5 rounded-xl font-mono text-[11px] font-bold transition-all cursor-pointer ${
                actionFilter === action
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {action}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "بحث بالإجراء، الكيان، أو السبب..." : "Search action, entity or reason..."}
            className="ps-9 pe-3 h-9 text-xs rounded-xl bg-background"
          />
        </div>

      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
              <TableHead className="font-bold">{isAr ? "الإجراء الموثّق" : "Action"}</TableHead>
              <TableHead className="font-bold">{isAr ? "نوع الكيان" : "Entity Type"}</TableHead>
              <TableHead className="font-bold">{isAr ? "المعرّف (Entity ID)" : "Entity ID"}</TableHead>
              <TableHead className="font-bold">{isAr ? "السبب / الملاحظات" : "Reason"}</TableHead>
              <TableHead className="font-bold text-end">{isAr ? "التوقيت الدقيق" : "Timestamp"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.length ? (
              filteredEntries.map((entry) => (
                <TableRow key={entry.id} className="hover:bg-muted/30 transition-colors">
                  
                  {/* Action */}
                  <TableCell>
                    <span className="font-mono text-xs font-bold text-foreground px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                      {entry.action}
                    </span>
                  </TableCell>

                  {/* Entity Type */}
                  <TableCell>
                    <span className="text-xs font-semibold text-foreground">
                      {entry.entity_type}
                    </span>
                  </TableCell>

                  {/* Entity ID */}
                  <TableCell>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {entry.entity_id ? entry.entity_id.slice(0, 8) + "..." : "—"}
                    </span>
                  </TableCell>

                  {/* Reason */}
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {entry.reason ?? "—"}
                    </span>
                  </TableCell>

                  {/* Timestamp */}
                  <TableCell className="text-end text-xs text-muted-foreground font-mono">
                    {new Date(entry.created_at).toLocaleString(isAr ? "ar-EG" : "en-US")}
                  </TableCell>

                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                  <Activity className="size-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="font-semibold">{isAr ? "لا توجد أحداث تدقيق مسجلة تطابق البحث" : "No matching audit entries found"}</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

    </div>
  );
}
