import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  UNDER_REVIEW: "secondary",
  POSTED: "default",
  REVERSED: "destructive",
};

export default async function JournalsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("id, entry_number, entry_date, description, status, source_type")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{isAr ? "القيود اليومية" : "Journal Entries"}</h1>
        <Link
          href="/finance/journals/new"
          locale={locale as Locale}
          className={buttonVariants({})}
        >
          {isAr ? "قيد جديد" : "New entry"}
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{isAr ? "التاريخ" : "Date"}</TableHead>
              <TableHead>{isAr ? "البيان" : "Description"}</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries?.length ? (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Link
                      href={`/finance/journals/${entry.id}`}
                      locale={locale as Locale}
                      className="underline"
                    >
                      {entry.entry_number ?? (isAr ? "مسودة" : "draft")}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{entry.entry_date}</TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[entry.status] ?? "outline"}>{entry.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد قيود بعد" : "No entries yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
