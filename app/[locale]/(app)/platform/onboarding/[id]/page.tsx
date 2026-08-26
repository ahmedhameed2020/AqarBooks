import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { ApproveForm } from "./approve-form";
import { RejectForm } from "./reject-form";

const ENTITY_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  DEVELOPER: { ar: "مطوّر عقاري", en: "Developer" },
  FACILITY_MANAGEMENT: { ar: "إدارة مرافق", en: "Facility Management" },
  OWNERS_ASSOCIATION: { ar: "اتحاد ملاك", en: "Owners Association" },
  INDIVIDUAL_OWNER: { ar: "مالك فردي", en: "Individual Owner" },
  TOURIST_RESORT: { ar: "منتجع سياحي", en: "Tourist Resort" },
  TOURIST_VILLAGE: { ar: "قرية سياحية", en: "Tourist Village" },
  RESIDENTIAL_COMPOUND: { ar: "كمبوند سكني", en: "Residential Compound" },
  OTHER: { ar: "أخرى", en: "Other" },
};

const EVENT_LABELS: Record<string, { ar: string; en: string }> = {
  SUBMITTED: { ar: "تم الإرسال", en: "Submitted" },
  APPROVED: { ar: "تم الاعتماد", en: "Approved" },
  REJECTED: { ar: "تم الرفض", en: "Rejected" },
  PROVISIONING_STARTED: { ar: "بدأ التأسيس", en: "Provisioning started" },
  PROVISIONED: { ar: "تم التأسيس", en: "Provisioned" },
  PROVISIONING_FAILED: { ar: "فشل التأسيس", en: "Provisioning failed" },
};

export default async function OnboardingRequestDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("onboarding_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (!request) {
    notFound();
  }

  const { data: events } = await supabase
    .from("onboarding_request_events")
    .select("id, event_type, notes, created_at")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const entityLabel =
    request.entity_type === "OTHER"
      ? request.entity_type_custom_label
      : isAr
        ? ENTITY_TYPE_LABELS[request.entity_type]?.ar ?? request.entity_type
        : ENTITY_TYPE_LABELS[request.entity_type]?.en ?? request.entity_type;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{request.organization_name}</h1>
        <Badge>{request.status}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2 rounded-lg border p-4">
          <h2 className="text-sm font-medium">{isAr ? "مقدّم الطلب" : "Requester"}</h2>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{isAr ? "الاسم" : "Name"}</dt>
            <dd>{request.full_name}</dd>
            <dt className="text-muted-foreground">{isAr ? "البريد" : "Email"}</dt>
            <dd dir="ltr" className="text-end">{request.work_email}</dd>
            <dt className="text-muted-foreground">{isAr ? "الهاتف" : "Phone"}</dt>
            <dd dir="ltr" className="text-end">{request.phone ?? "—"}</dd>
          </dl>
        </section>

        <section className="space-y-2 rounded-lg border p-4">
          <h2 className="text-sm font-medium">{isAr ? "المنشأة" : "Company"}</h2>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{isAr ? "النوع" : "Type"}</dt>
            <dd>{entityLabel}</dd>
            <dt className="text-muted-foreground">{isAr ? "الموقع" : "Location"}</dt>
            <dd>{[request.city, request.country].filter(Boolean).join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">{isAr ? "المشاريع المتوقعة" : "Expected properties"}</dt>
            <dd>{request.expected_properties_count ?? "—"}</dd>
            <dt className="text-muted-foreground">{isAr ? "الوحدات المتوقعة" : "Expected units"}</dt>
            <dd>{request.expected_units_count ?? "—"}</dd>
            <dt className="text-muted-foreground">{isAr ? "الباقة المطلوبة" : "Requested plan"}</dt>
            <dd>{request.requested_plan_key}</dd>
          </dl>
          {request.notes && (
            <p className="mt-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">{request.notes}</p>
          )}
        </section>
      </div>

      {request.status === "PENDING_APPROVAL" && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">{isAr ? "القرار" : "Decision"}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <ApproveForm requestId={request.id} locale={locale} />
            <RejectForm requestId={request.id} locale={locale} />
          </div>
        </section>
      )}

      {request.status === "ACTIVE" && request.organization_id && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
          {isAr ? "تم تأسيس المنظمة: " : "Workspace provisioned: "}
          <Link href={`/platform/organizations/${request.organization_id}`} locale={locale as Locale} className="font-medium underline">
            {isAr ? "عرض المنظمة" : "View organization"}
          </Link>
        </section>
      )}

      {request.status === "FAILED" && request.failure_reason && (
        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {isAr ? "سبب الفشل: " : "Failure reason: "}
          {request.failure_reason}
        </section>
      )}

      {request.status === "REJECTED" && request.review_notes && (
        <section className="rounded-lg border p-4 text-sm text-muted-foreground">
          {isAr ? "سبب الرفض: " : "Rejection reason: "}
          {request.review_notes}
        </section>
      )}

      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="text-sm font-medium">{isAr ? "السجل الزمني" : "Timeline"}</h2>
        <ul className="space-y-2 text-sm">
          {events?.length ? (
            events.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium">{isAr ? EVENT_LABELS[event.event_type]?.ar ?? event.event_type : EVENT_LABELS[event.event_type]?.en ?? event.event_type}</p>
                  {event.notes && <p className="text-xs text-muted-foreground">{event.notes}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(event.created_at).toLocaleString(isAr ? "ar-EG" : "en-US")}
                </span>
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">{isAr ? "لا يوجد سجل بعد" : "No events yet"}</li>
          )}
        </ul>
      </section>
    </div>
  );
}
