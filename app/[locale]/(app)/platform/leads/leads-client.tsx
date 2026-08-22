"use client";

import { useState, useMemo } from "react";
import { 
  Inbox, 
  Search, 
  Mail, 
  Phone, 
  Building2, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Filter,
  ExternalLink,
  MessageSquare
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

export interface DemoLeadItem {
  id: string;
  full_name: string;
  organization_name: string | null;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
}

export function LeadsClient({
  leads,
  locale,
}: {
  leads: DemoLeadItem[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const matchesSearch =
        l.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (l.organization_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        l.email.toLowerCase().includes(search.toLowerCase()) ||
        (l.phone ?? "").includes(search);
      const matchesStatus = statusFilter === "ALL" || l.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, search, statusFilter]);

  const newCount = leads.filter((l) => l.status === "NEW").length;
  const contactedCount = leads.filter((l) => l.status === "CONTACTED").length;

  return (
    <div className="space-y-6 max-w-7xl">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              {isAr ? "طلبات العرض التوضيحي (Inbound Leads)" : "Inbound Demo Leads"}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              {leads.length} {isAr ? "طلب" : "leads"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isAr
              ? "متابعة طلبات العروض الواردة من الصفحة التسويقية، التواصل مع العملاء المحتملين وتأهيلهم."
              : "Track incoming demo inquiries from the marketing portal and follow up with prospects."}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-2 rounded-2xl border bg-card/60 backdrop-blur-md shadow-xs">
        
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
              statusFilter === "ALL"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {isAr ? "الكل" : "All"} ({leads.length})
          </button>
          
          <button
            type="button"
            onClick={() => setStatusFilter("NEW")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === "NEW"
                ? "bg-purple-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <span className="size-1.5 rounded-full bg-purple-400" />
            <span>{isAr ? "طلبات جديدة" : "New"} ({newCount})</span>
          </button>

          {contactedCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("CONTACTED")}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === "CONTACTED"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <span className="size-1.5 rounded-full bg-blue-400" />
              <span>{isAr ? "تم التواصل" : "Contacted"} ({contactedCount})</span>
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "بحث بالاسم، المنظمة، أو البريد..." : "Search name, org, or email..."}
            className="ps-9 pe-3 h-9 text-xs rounded-xl bg-background"
          />
        </div>

      </div>

      {/* Leads Table */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
              <TableHead className="font-bold">{isAr ? "العميل المحتمل" : "Prospect"}</TableHead>
              <TableHead className="font-bold">{isAr ? "المنظمة / الشركة" : "Organization"}</TableHead>
              <TableHead className="font-bold">{isAr ? "بيانات الاتصال" : "Contact Details"}</TableHead>
              <TableHead className="font-bold">{isAr ? "الحالة" : "Status"}</TableHead>
              <TableHead className="font-bold">{isAr ? "تاريخ الطلب" : "Request Date"}</TableHead>
              <TableHead className="text-end font-bold">{isAr ? "إجراء سريع" : "Quick Action"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeads.length ? (
              filteredLeads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-muted/30 transition-colors">
                  
                  {/* Name */}
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-xs flex items-center justify-center">
                        {lead.full_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-foreground text-sm">{lead.full_name}</span>
                    </div>
                  </TableCell>

                  {/* Organization */}
                  <TableCell>
                    <span className="text-xs font-semibold text-foreground">
                      {lead.organization_name ?? "—"}
                    </span>
                  </TableCell>

                  {/* Contact Details */}
                  <TableCell>
                    <div className="space-y-0.5 text-xs font-mono">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Mail className="size-3 text-primary shrink-0" />
                        <span>{lead.email}</span>
                      </div>
                      {lead.phone && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="size-3 text-emerald-500 shrink-0" />
                          <span>{lead.phone}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge variant={lead.status === "NEW" ? "default" : "outline"} className="text-[10px] font-bold">
                      {lead.status}
                    </Badge>
                  </TableCell>

                  {/* Date */}
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString(isAr ? "ar-EG" : "en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>

                  {/* Quick Action */}
                  <TableCell className="text-end">
                    <a
                      href={`mailto:${lead.email}?subject=AqarBooks Demo Request - ${encodeURIComponent(lead.full_name)}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-foreground transition-colors"
                    >
                      <Mail className="size-3 text-primary" />
                      <span>{isAr ? "مراسلة" : "Email"}</span>
                    </a>
                  </TableCell>

                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  <Inbox className="size-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="font-semibold">{isAr ? "لا توجد طلبات تطابق معايير البحث" : "No matching leads found"}</p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

    </div>
  );
}
