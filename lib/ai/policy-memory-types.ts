export type PolicyStatus = 
  | "ACTIVE"
  | "APPROVED" 
  | "CANDIDATE" 
  | "OBSERVED" 
  | "SUPERSEDED"
  | "DISABLED";

export type TenantAccountingPolicy = {
  id: string;
  policyCode?: string; // e.g. TP-0042
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
  approvedBy?: string;
  lastUsedAt?: string;
};

// Default seed policies for real-estate management ERP
export const DEFAULT_REAL_ESTATE_POLICIES: Omit<TenantAccountingPolicy, "id" | "tenantId">[] = [
  {
    policyCode: "TP-0012",
    vendorPattern: "OTIS|مصر للمصاعد|شندلر|تيسن كروب",
    descriptionPattern: "مصعد|صيانة دورية|elevator",
    preferredAccountId: "",
    preferredAccountCode: "611204",
    preferredAccountName: "مصروف صيانة المصاعد",
    vatTreatment: "INPUT_VAT_14",
    effectiveFrom: "2026-01-01",
    learnedFromApprovalsCount: 25,
    status: "ACTIVE",
    version: 3,
    approvedBy: "Finance Admin",
  },
  {
    policyCode: "TP-0024",
    vendorPattern: "فودافون|أورانج|we|اتصالات|vodafone|orange",
    descriptionPattern: "انترنت|فاتورة خط|تليفون|اتصالات",
    preferredAccountId: "",
    preferredAccountCode: "611301",
    preferredAccountName: "مصروف الاتصالات والانترنت",
    vatTreatment: "INPUT_VAT_14",
    effectiveFrom: "2026-01-01",
    learnedFromApprovalsCount: 40,
    status: "ACTIVE",
    version: 2,
    approvedBy: "Finance Admin",
  },
  {
    policyCode: "TP-0038",
    vendorPattern: "شركة الكهرباء|كهرباء جنوب|شركة مياه",
    descriptionPattern: "استهلاك|عداد|كهرباء|مياه|مرافق",
    preferredAccountId: "",
    preferredAccountCode: "611401",
    preferredAccountName: "مصروف الكهرباء والمرافق العامة",
    vatTreatment: "NONE",
    effectiveFrom: "2026-01-01",
    learnedFromApprovalsCount: 50,
    status: "ACTIVE",
    version: 4,
    approvedBy: "Finance Admin",
  },
  {
    policyCode: "TP-0042",
    vendorPattern: "البنك الأهلي|بنك مصر|cib|qnb",
    descriptionPattern: "عمولة|مصاريف بنكية|دمغة|bank fee|comm",
    preferredAccountId: "",
    preferredAccountCode: "611802",
    preferredAccountName: "عمولات ومصروفات بنكية",
    vatTreatment: "NONE",
    effectiveFrom: "2026-01-01",
    learnedFromApprovalsCount: 30,
    status: "ACTIVE",
    version: 1,
    approvedBy: "Finance Admin",
  },
];
