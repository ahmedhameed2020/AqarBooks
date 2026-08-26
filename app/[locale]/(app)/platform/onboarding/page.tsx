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

const STATUS_VARIANT: Record<string, "outline" | "default" | "destructive" | "secondary"> = {
  PENDING_APPROVAL: "default",
  APPROVED: "secondary",
  REJECTED: "destructive",
  PROVISIONING: "secondary",
  ACTIVE: "outline",
  FAILED: "destructive",
  DRAFT: "outline",
};

export default async function OnboardingQueuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("onboarding_requests")
    .select("id, organization_name, full_name, work_email, requested_plan_key, status, submitted_at")
    .order("submitted_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "طلبات التفعيل" : "Onboarding requests"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "طلبات التفعيل الواردة من نموذج التسجيل العام. الاعتماد يُنشئ المنظومة تلقائيًا."
            : "Activation requests submitted through the public sign-up form. Approving one provisions the workspace automatically."}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "المنشأة" : "Company"}</TableHead>
              <TableHead>{isAr ? "مقدّم الطلب" : "Requester"}</TableHead>
              <TableHead>{isAr ? "الباقة" : "Plan"}</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
              <TableHead>{isAr ? "تاريخ الإرسال" : "Submitted"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests?.length ? (
              requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">
                    <Link href={`/platform/onboarding/${request.id}`} locale={locale as Locale} className="hover:underline">
                      {request.organization_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{request.full_name}</span>
                      <span className="text-xs text-muted-foreground">{request.work_email}</span>
                    </div>
                  </TableCell>
                  <TableCell>{request.requested_plan_key}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[request.status] ?? "outline"}>{request.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(request.submitted_at).toLocaleString(isAr ? "ar-EG" : "en-US")}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد طلبات بعد" : "No requests yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
