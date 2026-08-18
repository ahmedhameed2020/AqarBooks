import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import type { Jurisdiction } from "@/lib/einvoice/types";
import {
  deriveProfileState,
  JURISDICTION_LABELS,
  STATE_GUIDANCE,
  STATE_LABELS,
  type EInvoiceProfileState,
} from "@/lib/einvoice/profile-status";
import { FilingToggle, ProfileForm } from "./einvoice-forms";

// Only jurisdictions with an adapter are offered. The UAE is intentionally
// absent: its mandate is still phasing in and offering a setting that cannot
// lead anywhere would be a promise the product does not keep.
const OFFERED: Jurisdiction[] = ["EG_ETA", "SA_ZATCA"];

const STATE_TONE: Record<EInvoiceProfileState, "default" | "secondary" | "outline"> = {
  NOT_CONFIGURED: "outline",
  CONFIGURED: "secondary",
  VERIFIED: "secondary",
  ACTIVE: "default",
};

export default async function EInvoiceSettingsPage({
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

  // Uses the permissions that already exist and are already granted; no new
  // permission is introduced by this screen.
  const [canManage, canRead] = await Promise.all([
    hasPermission(organization.id, "finance.einvoice.manage"),
    hasPermission(organization.id, "finance.einvoice.read"),
  ]);
  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          {isAr ? "الفوترة الإلكترونية" : "E-Invoicing"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على إعدادات الفوترة الإلكترونية."
            : "You don't have permission to view e-invoicing settings."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  // Secret columns are deliberately NOT selected: nothing that could carry
  // credential material is loaded, so none can reach props, the HTML, or the
  // client bundle even by accident.
  const { data: profiles } = await supabase
    .from("einvoice_profiles")
    .select("id, jurisdiction, environment, taxpayer_id, branch_code, activity_code, status, enabled, verified_at, last_verification_error, updated_at")
    .eq("organization_id", organization.id);

  const byJurisdiction = new Map((profiles ?? []).map((p) => [p.jurisdiction, p]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "الفوترة الإلكترونية" : "E-Invoicing"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "تسجيل المنشأة لدى مصلحة الضرائب لكل ولاية. البيانات هنا تعريفية فقط."
            : "Your registration with each jurisdiction's tax authority. These settings are identifying details only."}
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        {isAr
          ? "لم يُفعَّل الاتصال بأي مصلحة ضرائب بعد. التحقق والإرسال يتطلبان بيانات اعتماد وشهادة توقيع، ويجري التوقيع في خدمة منفصلة خارج التطبيق. لا يمكن لهذه الشاشة إثبات صحة أي إعداد."
          : "No connection to any tax authority is live yet. Verification and filing need credentials and a signing certificate, and signing runs in a separate service outside this application. This screen cannot prove any setting works."}
      </div>

      <div className="space-y-4">
        {OFFERED.map((jurisdiction) => {
          const profile = byJurisdiction.get(jurisdiction);
          const state = deriveProfileState(profile);
          const labels = JURISDICTION_LABELS[jurisdiction];

          return (
            // Two jurisdictions render identical controls, so each section is
            // labelled. Without it, "the save button" is ambiguous to anything
            // driving this page — a test wrote to the wrong jurisdiction before
            // this existed, and a keyboard user has the same problem.
            <section
              key={jurisdiction}
              data-jurisdiction={jurisdiction}
              aria-label={isAr ? labels.ar : labels.en}
              className="space-y-4 rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">{isAr ? labels.ar : labels.en}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isAr ? STATE_GUIDANCE[state].ar : STATE_GUIDANCE[state].en}
                  </p>
                </div>
                <Badge variant={STATE_TONE[state]}>
                  {isAr ? STATE_LABELS[state].ar : STATE_LABELS[state].en}
                </Badge>
              </div>

              {profile?.last_verification_error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
                  {profile.last_verification_error}
                </p>
              )}

              {canManage ? (
                <ProfileForm
                  // Remount on every save. The inputs are uncontrolled, so
                  // defaultValue applies only at mount: without this key a
                  // save-and-revalidate leaves stale DOM values, and the NEXT
                  // save silently posts what the previous render put there
                  // rather than what the operator just typed. On a settings
                  // screen that gates statutory filing, that is a real hazard,
                  // not a cosmetic one.
                  key={`${jurisdiction}-${profile?.updated_at ?? "new"}`}
                  organizationId={organization.id}
                  jurisdiction={jurisdiction}
                  environment={(profile?.environment as "SANDBOX" | "PRODUCTION") ?? "SANDBOX"}
                  taxpayerId={profile?.taxpayer_id ?? null}
                  branchCode={profile?.branch_code ?? null}
                  activityCode={profile?.activity_code ?? null}
                  locale={locale}
                />
              ) : (
                <dl className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">{isAr ? "البيئة" : "Environment"}</dt>
                    <dd>{profile?.environment ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{isAr ? "الرقم الضريبي" : "Taxpayer ID"}</dt>
                    <dd dir="ltr">{profile?.taxpayer_id ?? "—"}</dd>
                  </div>
                </dl>
              )}

              {canManage && profile && (
                <div className="border-t pt-3">
                  <FilingToggle
                    profileId={profile.id}
                    enabled={profile.enabled}
                    // Mirrors the server rule; the RPC refuses regardless, so a
                    // tampered form cannot switch filing on unverified.
                    canEnable={profile.verified_at !== null && profile.status === "ACTIVE"}
                    locale={locale}
                  />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
