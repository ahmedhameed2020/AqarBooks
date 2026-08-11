import { setRequestLocale } from "next-intl/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("platform_audit_logs")
    .select("id, action, entity_type, entity_id, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "سجل التدقيق" : "Audit log"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr ? "آخر 200 حدث على مستوى المنصة" : "Latest 200 platform-level events"}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الإجراء" : "Action"}</TableHead>
              <TableHead>{isAr ? "الكيان" : "Entity"}</TableHead>
              <TableHead>{isAr ? "السبب" : "Reason"}</TableHead>
              <TableHead>{isAr ? "الوقت" : "Time"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries?.length ? (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.entity_type}
                    {entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}` : ""}
                  </TableCell>
                  <TableCell>{entry.reason ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString(locale)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد أحداث بعد" : "No events yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
