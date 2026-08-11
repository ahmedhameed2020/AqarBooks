import { setRequestLocale } from "next-intl/server";
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
import type { Locale } from "@/i18n/routing";
import { CreateResortForm } from "./create-resort-form";

export default async function ResortsPage({
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
  const { data: resorts } = await supabase
    .from("resorts")
    .select("id, name, code, timezone")
    .eq("organization_id", organization.id)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "المنتجعات" : "Resorts"}</h1>
      </div>
      <CreateResortForm organizationId={organization.id} locale={locale} />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الاسم" : "Name"}</TableHead>
              <TableHead>{isAr ? "الرمز" : "Code"}</TableHead>
              <TableHead>{isAr ? "المنطقة الزمنية" : "Timezone"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resorts?.length ? (
              resorts.map((resort) => (
                <TableRow key={resort.id}>
                  <TableCell className="font-medium">{resort.name}</TableCell>
                  <TableCell>{resort.code}</TableCell>
                  <TableCell className="text-muted-foreground">{resort.timezone}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد منتجعات بعد" : "No resorts yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
