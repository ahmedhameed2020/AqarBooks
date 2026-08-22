export type PolicyStatus = 
  | "APPROVED" 
  | "HIGH_CONFIDENCE_CANDIDATE" 
  | "SUGGESTED_PATTERN" 
  | "OBSERVATION" 
  | "DISABLED";

export type TenantAccountingPolicy = {
  id: string;
  tenantId: string;
  vendorPattern: string;
  descriptionPattern?: string;
  preferredAccountId: string;
  preferredAccountCode: string;
  preferredAccountName: string;
  vatTreatment?: "INPUT_VAT_14" | "ZERO_RATED" | "EXEMPT" | "NONE";
  effectiveFrom: string;
  learnedFromApprovalsCount: number;
  status: PolicyStatus;
  version: number;
  lastUsedAt?: string;
};

// Default seed policies for real-estate management ERP
export const DEFAULT_REAL_ESTATE_POLICIES: Omit<TenantAccountingPolicy, "id" | "tenantId">[] = [
  {
    vendorPattern: "OTIS|مصر للمصاعد|شندلر|تيسن كروب",
    descriptionPattern: "مصعد|صيانة دورية|elevator",
    preferredAccountId: "",
    preferredAccountCode: "611204",
    preferredAccountName: "مصروف صيانة المصاعد",
    vatTreatment: "INPUT_VAT_14",
    effectiveFrom: "2026-01-01",
    learnedFromApprovalsCount: 25,
    status: "APPROVED",
    version: 1,
  },
  {
    vendorPattern: "فودافون|أورانج|we|اتصالات|vodafone|orange",
    descriptionPattern: "انترنت|فاتورة خط|تليفون|اتصالات",
    preferredAccountId: "",
    preferredAccountCode: "611301",
    preferredAccountName: "مصروف الاتصالات والانترنت",
    vatTreatment: "INPUT_VAT_14",
    effectiveFrom: "2026-01-01",
    learnedFromApprovalsCount: 40,
    status: "APPROVED",
    version: 1,
  },
  {
    vendorPattern: "شركة الكهرباء|كهرباء جنوب|شركة مياه",
    descriptionPattern: "استهلاك|عداد|كهرباء|مياه|مرافق",
    preferredAccountId: "",
    preferredAccountCode: "611401",
    preferredAccountName: "مصروف الكهرباء والمرافق العامة",
    vatTreatment: "NONE",
    effectiveFrom: "2026-01-01",
    learnedFromApprovalsCount: 50,
    status: "APPROVED",
    version: 1,
  },
  {
    vendorPattern: "البنك الأهلي|بنك مصر|cib|qnb",
    descriptionPattern: "عمولة|مصاريف بنكية|دمغة|bank fee|comm",
    preferredAccountId: "",
    preferredAccountCode: "611802",
    preferredAccountName: "عمولات ومصروفات بنكية",
    vatTreatment: "NONE",
    effectiveFrom: "2026-01-01",
    learnedFromApprovalsCount: 30,
    status: "APPROVED",
    version: 1,
  },
];
