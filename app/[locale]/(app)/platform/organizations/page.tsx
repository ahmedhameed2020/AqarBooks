import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
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
import { CreateOrganizationForm } from "./create-organization-form";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  TRIAL: "secondary",
  ACTIVE: "default",
  SUSPENDED: "destructive",
  ARCHIVED: "outline",
};

export default async function OrganizationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name, slug, status, default_currency, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {isAr ? "المنظمات" : "Organizations"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "إنشاء وإدارة المنظمات (المستأجرين) على المنصة"
            : "Create and manage tenant organizations on the platform"}
        </p>
      </div>

      <CreateOrganizationForm locale={locale} />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الاسم" : "Name"}</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
              <TableHead>{isAr ? "العملة" : "Currency"}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations?.length ? (
              organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[org.status] ?? "outline"}>
                      {org.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{org.default_currency}</TableCell>
                  <TableCell>
                    <Link
                      href={`/platform/organizations/${org.id}`}
                      locale={locale as Locale}
                      className="text-sm underline"
                    >
                      {isAr ? "التفاصيل" : "Details"}
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد منظمات بعد" : "No organizations yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
