/**
 * The demo dataset's narrative, as data.
 *
 * WHY THIS IS A SHARED MODULE AND NOT INLINE IN THE SEED
 * The demo dataset is marketing content (spec §21). The entry page advertises
 * its scale before the visitor signs in, and the seed script produces it. If
 * those two lived apart, the page would eventually promise "3 properties" over
 * a database holding four. They read the same constants instead, and the
 * seed's verification pass asserts the database matches what is written here.
 *
 * WHY THE FIGURES HERE ARE STRUCTURAL, NOT FINANCIAL
 * Counts of properties, buildings and units are decided here because the seed
 * creates exactly them. Money is NOT decided here. Receivables, collections
 * and occupancy are consequences of the transactions the seed posts, so
 * quoting them as constants would let the marketing copy drift away from the
 * ledger the moment a fixture changed. Anything financial is read back from
 * the database, never asserted from this file. That is the same discipline the
 * finance reports had to be repaired to follow.
 *
 * Every name below is fictional. None belongs to a customer.
 */

export const DEMO_STORY = {
  organization: {
    // Named so it is unmistakable internally which tenant this is, while still
    // reading as a real operating company on screen.
    nameEn: "AqarBooks Demo Holdings",
    nameAr: "أقاربوكس القابضة — بيئة العرض",
    slug: "aqarbooks-demo",
    entityType: "FACILITY_MANAGEMENT" as const,
    currency: "EGP" as const,
    governorate: "القاهرة",
    city: "القاهرة الجديدة",
    tagline: "إدارة وتشغيل الأصول العقارية",
  },

  /** Shown on the public entry page. The seed asserts each of these. */
  headline: {
    legalEntities: 2,
    properties: 3,
    buildings: 5,
    /** Units created. Eight are archived, leaving 148 active. */
    units: 156,
    activeUnits: 148,
    periodAr: "أغسطس 2026",
    periodEn: "August 2026",
  },

  /**
   * The operating month everything is dated into. Fixed, not derived from the
   * clock: a dataset that silently re-dates itself would stop reconciling with
   * the fiscal period its journal entries were posted into.
   */
  period: {
    year: 2026,
    month: 8,
    start: "2026-08-01",
    end: "2026-08-31",
    /** Opening balances are dated here, one day before the period opens. */
    openingDate: "2026-07-31",
  },

  properties: [
    {
      code: "NH",
      nameEn: "Nile Heights Compound",
      nameAr: "كمبوند نايل هايتس",
      propertyType: "resort" as const,
      governorate: "القاهرة",
      /** Which of the two legal entities operates it. */
      legalEntity: 1,
    },
    {
      code: "MR",
      nameEn: "Marina Residence",
      nameAr: "مارينا ريزيدنس",
      propertyType: "resort" as const,
      governorate: "مطروح",
      legalEntity: 2,
    },
    {
      code: "PG",
      nameEn: "Palm Gate Tower",
      nameAr: "برج بوابة النخيل",
      propertyType: "building" as const,
      governorate: "الجيزة",
      legalEntity: 1,
    },
  ],

  /**
   * Buildings, and the unit block each one carries. `count` sums to
   * headline.units; `archived` sums to headline.units - headline.activeUnits.
   * A mix of unit types is deliberate: a portfolio of nothing but apartments
   * would not demonstrate that the ledger treats a shop and a villa as the
   * same kind of financial dimension.
   */
  buildings: [
    {
      propertyCode: "NH",
      code: "NH-A",
      nameEn: "Nile Heights — Block A",
      nameAr: "نايل هايتس — عمارة أ",
      zoneEn: "Phase One",
      zoneAr: "المرحلة الأولى",
      unitType: "APARTMENT" as const,
      count: 36,
      archived: 2,
      floors: 6,
      areaRange: [96, 178] as const,
    },
    {
      propertyCode: "NH",
      code: "NH-B",
      nameEn: "Nile Heights — Block B",
      nameAr: "نايل هايتس — عمارة ب",
      zoneEn: "Phase One",
      zoneAr: "المرحلة الأولى",
      unitType: "APARTMENT" as const,
      count: 36,
      archived: 2,
      floors: 6,
      areaRange: [96, 178] as const,
    },
    {
      propertyCode: "NH",
      code: "NH-C",
      nameEn: "Nile Heights — Villas",
      nameAr: "نايل هايتس — الفلل",
      zoneEn: "Phase Two",
      zoneAr: "المرحلة الثانية",
      unitType: "VILLA" as const,
      count: 24,
      archived: 1,
      floors: 2,
      areaRange: [240, 420] as const,
    },
    {
      propertyCode: "MR",
      code: "MR-1",
      nameEn: "Marina Residence — Seafront Wing",
      nameAr: "مارينا ريزيدنس — الواجهة البحرية",
      zoneEn: "Seafront",
      zoneAr: "الواجهة البحرية",
      unitType: "CHALET" as const,
      count: 32,
      archived: 2,
      floors: 4,
      areaRange: [78, 145] as const,
    },
    {
      propertyCode: "PG",
      code: "PG-T",
      nameEn: "Palm Gate — Commercial Tower",
      nameAr: "بوابة النخيل — البرج التجاري",
      zoneEn: "Commercial",
      zoneAr: "القطاع التجاري",
      /** Offices on the upper floors, shops at street level — see the seed. */
      unitType: "OFFICE" as const,
      count: 28,
      archived: 1,
      floors: 14,
      areaRange: [55, 320] as const,
    },
  ],

  /**
   * Accounts the demo tenant adds to its own chart on top of the
   * RESORT_STANDARD template.
   *
   * WHY THIS IS NOT A CHANGE TO THE TEMPLATE
   * The global template ships to every customer, and rental income is not
   * universal -- an owners' association has none. Editing it to suit the demo
   * would push a real-estate-specific account onto tenants that do not want it.
   *
   * WHY THE DEMO NEEDS IT ANYWAY
   * The template's nearest fit for rent is `4300 Other Revenue`. A property
   * accountant opening the demo's income statement would see rental income
   * classified as "other", and would reasonably conclude that AqarBooks does
   * not model rent as a first-class revenue stream. That is a claim about the
   * product, made by accident, on the surface built to establish trust.
   *
   * Adding a leaf under the revenue group is exactly what a real operator does
   * during onboarding -- it is tenant-specific chart configuration, not an
   * invented figure. So the demo does what a configured customer would have
   * done, and shows the result.
   */
  tenantAccounts: {
    rentalIncome: {
      /** Free in RESORT_STANDARD, which stops at 4300. Verified before use. */
      code: "4400",
      parentCode: "4000",
      nameAr: "إيرادات الإيجارات",
      nameEn: "Rental Income",
      category: "REVENUE" as const,
      normalBalance: "CREDIT" as const,
      /** Matches its siblings 4100 and 4300. */
      cashFlowSection: "OPERATING" as const,
    },
  },

  /**
   * Targets the seed aims at, expressed as proportions of the unit stock. They
   * shape the fixtures; they are not displayed anywhere, and the reported
   * figures always come from the ledger.
   */
  targets: {
    /** Share of active units that are occupied — leased or owner-resident. */
    occupancy: 0.82,
    /** Share of billed dues left unpaid past their due date. */
    overdueShare: 0.17,
  },
} as const;

export type DemoBuilding = (typeof DEMO_STORY.buildings)[number];
export type DemoProperty = (typeof DEMO_STORY.properties)[number];
