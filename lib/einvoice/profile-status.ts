import type { Jurisdiction } from "./types";

/**
 * The four states an operator is shown, derived from what the database already
 * records. No column stores this: deriving it means the badge cannot drift from
 * the row it describes, and it needed no migration.
 *
 *   NOT_CONFIGURED  no profile row exists
 *   CONFIGURED      a row exists but has never been verified
 *   VERIFIED        credentials were proven against the authority's sandbox
 *   ACTIVE          verified AND switched on for filing
 *
 * VERIFIED is deliberately unreachable today. Nothing in the product can set
 * verified_at except set_einvoice_profile_verification, which is called only
 * after a real exchange with a tax authority — and no adapter can perform one
 * yet. A settings screen that could show VERIFIED without that exchange would
 * be asserting something nobody checked, which is exactly the failure mode this
 * whole feature has to avoid.
 */
export type EInvoiceProfileState = "NOT_CONFIGURED" | "CONFIGURED" | "VERIFIED" | "ACTIVE";

export interface ProfileRow {
  status: "DRAFT" | "ACTIVE" | "SUSPENDED";
  enabled: boolean;
  verified_at: string | null;
}

export function deriveProfileState(profile: ProfileRow | null | undefined): EInvoiceProfileState {
  if (!profile) return "NOT_CONFIGURED";
  if (!profile.verified_at) return "CONFIGURED";
  // Enabled is the human decision to start filing; verified is only evidence
  // that filing would work. Both are required before anything is called ACTIVE.
  if (profile.enabled && profile.status === "ACTIVE") return "ACTIVE";
  return "VERIFIED";
}

export const JURISDICTION_LABELS: Record<Jurisdiction, { ar: string; en: string }> = {
  EG_ETA: { ar: "مصر — مصلحة الضرائب المصرية (ETA)", en: "Egypt — Tax Authority (ETA)" },
  SA_ZATCA: { ar: "السعودية — هيئة الزكاة والضريبة (ZATCA)", en: "Saudi Arabia — ZATCA (Fatoora)" },
  AE_PEPPOL: { ar: "الإمارات — Peppol (قريبًا)", en: "UAE — Peppol (upcoming)" },
};

export const STATE_LABELS: Record<EInvoiceProfileState, { ar: string; en: string }> = {
  NOT_CONFIGURED: { ar: "غير مُعَد", en: "Not configured" },
  CONFIGURED: { ar: "مُعَد — لم يُتحقق منه", en: "Configured — not verified" },
  VERIFIED: { ar: "تم التحقق — الإرسال متوقف", en: "Verified — filing off" },
  ACTIVE: { ar: "نشط — الإرسال مُفعَّل", en: "Active — filing on" },
};

/**
 * What the operator should do next. Written as an instruction rather than a
 * status restatement, and honest that verification is not yet possible.
 */
export const STATE_GUIDANCE: Record<EInvoiceProfileState, { ar: string; en: string }> = {
  NOT_CONFIGURED: {
    ar: "أدخل بيانات التسجيل الضريبي لبدء الإعداد. لن يُرسَل أي مستند قبل التحقق والتفعيل.",
    en: "Enter the tax registration details to begin. Nothing is filed until the profile is verified and switched on.",
  },
  CONFIGURED: {
    ar: "البيانات محفوظة، لكن لم يجرِ أي اتصال بمصلحة الضرائب بعد. التحقق يتطلب بيانات اعتماد وشهادة توقيع غير متاحة حاليًا.",
    en: "Details are saved, but no exchange with the tax authority has taken place. Verification needs credentials and a signing certificate, which are not available yet.",
  },
  VERIFIED: {
    ar: "تم إثبات بيانات الاعتماد مقابل البيئة التجريبية. فعِّل الإرسال عندما تكون جاهزًا.",
    en: "Credentials were proven against the sandbox. Switch filing on when you are ready.",
  },
  ACTIVE: {
    ar: "الإرسال مُفعَّل. تُرسَل المستندات المؤهَّلة إلى مصلحة الضرائب.",
    en: "Filing is on. Eligible documents are submitted to the tax authority.",
  },
};
