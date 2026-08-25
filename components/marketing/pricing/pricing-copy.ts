import type { Locale } from "@/i18n/routing";

/* Arabic is the authoritative copy for this page; the English strings are the
   equivalent commercial message, not a mechanical translation. Marketing
   routes in this project carry their copy inline per-locale rather than in
   messages/*.json (which serves the authenticated app), so this module keeps
   the same convention while holding the whole pricing narrative in one place. */

export type PricingCopy = ReturnType<typeof getPricingCopy>;

export function getPricingCopy(locale: Locale) {
  const isAr = locale === "ar";

  return {
    meta: {
      title: isAr
        ? "أسعار AqarBooks | نظام محاسبي لإدارة الكيانات العقارية"
        : "AqarBooks Pricing | Enterprise Real Estate Accounting ERP",
      description: isAr
        ? "تسعير مبني على حجم الكيان المالي ومستوى الحوكمة. قيد مزدوج حقيقي، إدارة رسوم الصيانة والـ CAM، فواتير إلكترونية، وذكاء اصطناعي محكوم."
        : "Pricing structured for your property scale and financial governance depth. True double-entry, CAM funds, e-invoicing architecture, and governed AI.",
    },

    hero: {
      eyebrow: isAr ? "نظام مالي يتوسع مع حجم أعمالك" : "Pricing Built Around Your Operating Scale",
      headline: isAr
        ? "نظام مالي يناسب هيكل أعمالك العقارية اليوم، ويتوسع معك غدًا."
        : "A financial system built for your property structure today, expanding with you tomorrow.",
      support: isAr
        ? "ابدأ بمستوى الرقابة والضوابط التي تحتاجها الآن. وتوسّع في عدد الكيانات، المباني، والصلاحيات مع نمو محفظتك العقارية — بدون أي رسوم خفية أو إضافات معقدة."
        : "Start with the financial controls you need now. Scale entities, properties, teams, and workflows as your operations grow — with zero hidden fees.",
      trustAnchors: isAr
        ? [
            "قيد مزدوج حقيقي لدفتر الأستاذ",
            "محاسبة تفصيلية على مستوى الوحدة",
            "مطابقة الأرصدة الافتتاحية قبل الإطلاق",
            "ملكية البيانات وتصديرها 100%",
          ]
        : [
            "True double-entry general ledger",
            "Unit-level granular sub-ledgers",
            "Opening balance reconciliation before go-live",
            "100% data ownership & instant export",
          ],
    },

    billing: {
      monthly: isAr ? "اشتراك شهري" : "Monthly Billing",
      annual: isAr ? "اشتراك سنوي" : "Annual Billing",
      saveBadge: isAr ? "وفّر 20%" : "Save 20%",
      annualBilledSuffix: (totalStr: string) =>
        isAr ? `${totalStr} ج.م تُدفع سنويًا` : `EGP ${totalStr} billed annually`,
      monthlySuffix: isAr ? "جنيه / شهر" : "EGP / month",
      customSuffix: isAr ? "تسعير سنوي مخصص" : "Tailored Annual Contract",
    },

    tiers: {
      essential: {
        id: "essential",
        name: isAr ? "Essential (الأساسيات)" : "Essential",
        eyebrow: isAr ? "كيان فردي أو اتحاد ملاك" : "Single Property Entity",
        description: isAr
          ? "للعمارات الفردية، المباني المستقلة، واتحادات الملاك المحدودة التي تحتاج محاسبة حقيقية بدون تعقيد."
          : "For single-building HOAs and boutique properties requiring auditable double-entry accounting without enterprise bloat.",
        capacityLabel: isAr ? "حتى 100 وحدة · 3 مستخدمين" : "Up to 100 units · 3 users",
        highlights: isAr
          ? [
              "محرك قيد مزدوج حقيقي ودفتر أستاذ عام",
              "كشف حساب تفصيلي لكل شقة ومالك",
              "إصدار سندات قبض وفواتير صيانة دورية",
              "إدارة الخزينة ومتابعة المقبوضات النقدية",
              "تقارير ميزان المراجعة وقائمة الدخل الأساسية",
            ]
          : [
              "True double-entry GL & standard chart of accounts",
              "Unit & owner detailed statement sub-ledgers",
              "Periodic assessment levy receipts & bills",
              "Treasury cashbox tracking & payment vouchers",
              "Basic trial balance & income statement reports",
            ],
        ctaText: isAr ? "ابدأ مع باقة الأساسيات" : "Start with Essential",
        ctaSubtext: isAr ? "إعداد سريع وترحيل منظم للأرصدة" : "Fast setup & structured opening balances",
      },

      professional: {
        id: "professional",
        name: isAr ? "Professional" : "Professional",
        isPopular: true,
        popularBadge: isAr ? "الأكثر طلباً" : "Most Popular",
        foundingBadge: isAr ? "برنامج المؤسسين" : "Founding Customer Program",
        foundingCohortNote: isAr
          ? "سعر الإطلاق متاح لأول 10 كيانات عقارية معتمدة."
          : "Founding rate available to the first 10 eligible approved entities.",
        slotsRemainingText: (remaining: number) =>
          isAr
            ? `متبقي ${remaining} مقاعد فقط في دفعة الإطلاق`
            : `Only ${remaining} slots remaining in launch cohort`,
        eyebrow: isAr ? "المجمعات والكمبوندات والأبراج" : "Compounds, Towers & Multi-Building",
        description: isAr
          ? "المنظومة المالية القياسية للكمبوندات والأبراج والمشاريع متعددة المباني التي تتطلب حوكمة، وفصل لودائع الصيانة، وتدقيق مالي صارم."
          : "The flagship financial ERP for residential compounds, towers, and commercial properties requiring CAM ring-fencing, Maker-Checker workflows, and audit governance.",
        capacityLabel: isAr ? "حتى 500 وحدة · 10 مستخدمين · متعدد الكيانات" : "Up to 500 units · 10 users · Multi-entity",
        highlights: isAr
          ? [
              "فصل تلقائي لحسابات تشغيل الـ CAM عن ودائع الصيانة الرأسمالية",
              "حوكمة الصلاحيات والاعتماد الثنائي (Maker-Checker)",
              "مطابقة بنكية ذكية واستيراد كشوف الحسابات",
              "بنية مهيأة لمتطلبات الفاتورة الإلكترونية والضرائب (ETA / ZATCA)",
              "ذكاء اصطناعي لقراءة فواتير الموردين (OCR) واقتراح القيود",
              "أعمار الديون والتحصيل الذكي عبر روابط الدفع",
            ]
          : [
              "Automated CAM operating vs capital sinking reserve splits",
              "Two-tier Maker-Checker financial approval governance",
              "Smart multi-bank statement feed reconciliation",
              "E-invoicing architecture designed for ETA / ZATCA workflows",
              "AI supplier invoice OCR extraction & journal drafting",
              "Aging buckets & automated resident collection links",
            ],
        ctaText: isAr ? "انضم لبرنامج المؤسسين ↗" : "Join Founding Program ↗",
        ctaSubtext: isAr ? "تثبيت سعر الإطلاق مدى الحياة للكيانات المؤهلة" : "Locked launch rate for approved entities",
      },

      enterprise: {
        id: "enterprise",
        name: isAr ? "Enterprise (المؤسسات)" : "Enterprise & Custom",
        eyebrow: isAr ? "المحافظ العقارية والمنتجعات القابضة" : "Portfolios, Holdings & Resorts",
        description: isAr
          ? "للمحافظ العقارية الكبرى، المجموعات القابضة، والقرى السياحية التي تحتاج تسويات بينية، قوائم مالية مجمعة، وربط مخصص."
          : "For large property developers, multi-holding groups, and resort portfolios requiring intercompany settlements, consolidation, and dedicated SLAs.",
        capacityLabel: isAr ? "نطاق تشغيل مخصص (1,000+ وحدة) · مستخدمين بلا قيود" : "Custom operating scale (1,000+ units) · Custom users",
        highlights: isAr
          ? [
              "قوائم مالية مجمعة للمجموعة وتسويات بينية (Intercompany)",
              "مراكز تكلفة مستقلة لكل مرحلة أو قرية سياحية (Phase P&L)",
              "شجرة حسابات مخصصة بالكامل وربط API مفتوح",
              "طبقة ذكاء اصطناعي مخصصة وكوبيلوت محاسبي كامل",
              "مدير حسابات مخصص ومطابقة بيانات ميدانية",
              "اتفاقية مستوى خدمة مخصصة (Enterprise SLA)",
            ]
          : [
              "Consolidated holding financials & intercompany clearing",
              "Isolated P&Ls per development phase or resort bay",
              "Fully custom chart of accounts & enterprise API integrations",
              "Dedicated AI Copilot & custom rule engines",
              "Dedicated implementation team & on-site data audit",
              "Enterprise SLA & custom contract terms",
            ],
        ctaText: isAr ? "صمم باقة المؤسسات المخصصة" : "Design Enterprise Plan",
        ctaSubtext: isAr ? "جلسة استشارية فنية ومالية مع فريق الحلول" : "Direct consultation with our solutions architects",
      },
    },
    scaleMatcher: {
      eyebrow: isAr ? "حدد الباقة المناسبة" : "FIND YOUR PLAN",
      headline: isAr
        ? "مش عارف أنهي باقة تناسبك؟ طابق هيكل أعمالك في ثواني."
        : "Unsure which plan fits? Match your operating structure in seconds.",
      support: isAr
        ? "AqarBooks مش بيبيع مساحة تخزين؛ إحنا بنقدم قدرات تشغيلية ومالية تتناسب مع درجة تعقيد نشاطك."
        : "AqarBooks doesn't sell database rows; we deliver financial operating capability tuned to your organizational complexity.",
      labels: {
        units: isAr ? "إجمالي الوحدات المدارة:" : "Total Units Managed:",
        entities: isAr ? "عدد الشركات أو الكيانات المستقلة:" : "Legal Entities / Companies:",
        users: isAr ? "أعضاء الفريق المالي والمشغلين:" : "Finance & Operations Users:",
        complexity: isAr ? "درجة التعقيد المحاسبي والتشغيلي:" : "Accounting & Workflow Complexity:",
      },
      complexityOptions: [
        { id: "simple", labelAr: "تشغيل بسيط (خزينة وبنك ومصاريف دورية)", labelEn: "Standard (Cashbox, bank & periodic expenses)" },
        { id: "moderate", labelAr: "متوسط (ودائع صيانة CAM + فواتير ضرائب + عدة بنوك)", labelEn: "Moderate (CAM splits, tax invoices & multiple banks)" },
        { id: "complex", labelAr: "متقدم (اعتمادات Maker-Checker + تسويات بينية + شركات متعددة)", labelEn: "Advanced (Maker-Checker, intercompany & multi-entity)" },
      ],
      resultTitle: isAr ? "الباقة الموصى بها لهيكل أعمالك:" : "Recommended Plan for Your Operating Model:",
      resultReasonAr: (plan: string) =>
        `بناءً على المعطيات المحددة، باقة ${plan} تمنحك التوازن المثالي بين دقة الرقابة المالية وتكلفة التشغيل.`,
      resultReasonEn: (plan: string) =>
        `Based on your inputs, the ${plan} plan provides the optimal balance between financial control depth and operating cost.`,
    },

    executiveComparison: {
      eyebrow: isAr ? "مقارنة سريعة" : "EXECUTIVE SUMMARY",
      headline: isAr ? "الفروق الجوهرية بين الباقات" : "Decisive Differences at a Glance",
      support: isAr
        ? "أهم 10 قدرات مالية وتشغيلية تفصل بين مستويات التشغيل في AqarBooks."
        : "The top 10 financial and operational capabilities defining each tier.",
    },

    capabilityMatrix: {
      eyebrow: isAr ? "دليل القدرات المحاسبية الكامل" : "FULL CAPABILITY MATRIX",
      headline: isAr ? "المقارنة التفصيلية عبر 8 إدارات مالية" : "Detailed Comparison Across 8 Financial Domains",
      support: isAr
        ? "تصفح جميع القدرات بالتفصيل وفق معايير التشغيل والتدقيق الحقيقية."
        : "Explore all 35+ capabilities categorized by actual real-estate finance departments.",
      expandAll: isAr ? "فتح كل الإدارات" : "Expand All Domains",
      collapseAll: isAr ? "إغلاق الكل" : "Collapse All",
      statusLabels: {
        included: isAr ? "مشمول بالكامل" : "Included",
        advanced: isAr ? "متقدم" : "Advanced",
        custom: isAr ? "حسب التهيئة" : "Custom setup",
        onActivation: isAr ? "متاح عند التفعيل" : "On activation",
        notIncluded: isAr ? "غير مشمول" : "Not included",
      },
      domains: [
        {
          id: "gl",
          num: "01",
          titleAr: "1. المحرك المحاسبي ودفتر الأستاذ (Accounting & General Ledger)",
          titleEn: "1. Accounting & General Ledger",
          items: [
            { nameAr: "قيد مزدوج حقيقي متوازن ذرياً (Debit = Credit)", nameEn: "True Double-Entry Atomic Core (Dr = Cr)", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "شجرة حسابات عقارية معيارية (Chart of Accounts)", nameEn: "Real Estate Standard Chart of Accounts", essential: "included", professional: "included", enterprise: "custom" },
            { nameAr: "سجلات أستاذ مساعدة للوحدات والملاك (Sub-Ledgers)", nameEn: "Unit & Member Sub-Ledgers", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "إقفال الفترات المالية وترحيل الأرصدة (Period Locking)", nameEn: "Financial Period Locking & Year-End Close", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "قيود التسوية والتصحيح العكسي (Reversing Entries)", nameEn: "Audited Reversing & Correction Entries", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "تسويات المعاملات البينية بين الشركات (Intercompany)", nameEn: "Intercompany Transfers & Multi-Entity Clear", essential: "notIncluded", professional: "advanced", enterprise: "custom" },
            { nameAr: "قوائم مالية مجمعة للمجموعة القابضة (Consolidation)", nameEn: "Consolidated Holding P&L & Balance Sheet", essential: "notIncluded", professional: "notIncluded", enterprise: "custom" },
          ],
        },
        {
          id: "billing",
          num: "02",
          titleAr: "2. المستحقات والفوترة والتحصيل (Billing, AR & Collections)",
          titleEn: "2. Billing, AR & Collections",
          items: [
            { nameAr: "توليد مطالبات الرسوم الدورية وأقساط الصيانة", nameEn: "Periodic Assessment Dues Generation", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "إصدار إيصالات وسندات قبض معتمدة للملاك", nameEn: "Certified Member Payment Vouchers & Receipts", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "أعمار الديون وتقارير المتأخرات (Aging 30/60/90)", nameEn: "Receivables Aging Buckets (30/60/90 Days)", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "إشعارات المطالبة وروابط التحصيل الإلكتروني", nameEn: "Direct Payment Links & Digital Collections", essential: "notIncluded", professional: "included", enterprise: "included" },
            { nameAr: "جدولة غرامات التأخير وتوزيع الخصومات المعتمدة", nameEn: "Automated Late Fee Rules & Approved Discounts", essential: "notIncluded", professional: "advanced", enterprise: "custom" },
            { nameAr: "تطبيق بوابات الدفع الإلكتروني وفوري (Payment Gateways)", nameEn: "Online Payment Gateways & Card Processing", essential: "notIncluded", professional: "onActivation", enterprise: "custom" },
          ],
        },
        {
          id: "cam",
          num: "03",
          titleAr: "3. رسوم الصيانة والتشغيل وودائع الاحتياطي (CAM & Property Funds)",
          titleEn: "3. CAM & Property Funds",
          items: [
            { nameAr: "توزيع المصروفات بنسب المساحة وحصص الأرض (Pro-Rata)", nameEn: "Pro-Rata Land Share CAM Allocation", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "فصل محاسبي معزول لوديعة الصيانة الرأسمالية (Sinking Fund)", nameEn: "Ring-Fenced Capital Sinking Reserve Trust", essential: "notIncluded", professional: "included", enterprise: "included" },
            { nameAr: "موازنات تقديرية معتمدة من الجمعية العمومية (AGM Budgets)", nameEn: "AGM-Approved Budget Variance Tracking", essential: "notIncluded", professional: "included", enterprise: "included" },
            { nameAr: "توزيع فواتير الكهرباء والمياه المركزية على الوحدات", nameEn: "Central Utility & Chiller Sub-Metering Splits", essential: "notIncluded", professional: "advanced", enterprise: "custom" },
            { nameAr: "مراكز تكلفة مستقلة للمراحل والقرى السياحية (Phase P&L)", nameEn: "Isolated Phase & Resort Operational Cost Centers", essential: "notIncluded", professional: "notIncluded", enterprise: "custom" },
          ],
        },
        {
          id: "treasury",
          num: "04",
          titleAr: "4. الخزينة والبنوك والمطابقة (Treasury & Bank Reconciliation)",
          titleEn: "4. Treasury & Bank Reconciliation",
          items: [
            { nameAr: "إدارة الخزينة ومتابعة المقبوضات والمدفوعات اليومية", nameEn: "Daily Treasury Cashbox & Float Tracking", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "جلسات الكاشير وإقفال عُهد الشيفتات (Cashier Shifts)", nameEn: "Cashbox Session Lock & Float Variance Audit", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "حفظ ومتابعة دورة الشيكات (استلام → إيداع → مقاصة)", nameEn: "Post-Dated Cheque (PDC) Lifecycle Tracking", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "استيراد كشوف الحسابات البنكية والمطابقة الآلية", nameEn: "Bank Statement Import & Automated Match", essential: "notIncluded", professional: "included", enterprise: "included" },
            { nameAr: "ربط الحسابات البنكية المتعددة والودائع الاستثمارية", nameEn: "Multi-Bank Account & Investment Escrow Feeds", essential: "notIncluded", professional: "advanced", enterprise: "custom" },
          ],
        },
        {
          id: "tax",
          num: "05",
          titleAr: "5. الضرائب والفوترة الإلكترونية (Tax & E-Invoicing)",
          titleEn: "5. Tax & E-Invoicing",
          items: [
            { nameAr: "احتساب ضريبة القيمة المضافة وإعداد الإقرار (14% VAT)", nameEn: "VAT Return Preparation & 14% Tax Engine", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "خصم وتحصيل ضرائب الموردين ونموذج 41 (WHT)", nameEn: "Vendor Withholding Tax (WHT) Deductions", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "بنية معمارية مهيأة للتكامل مع الفاتورة الإلكترونية (ETA / ZATCA)", nameEn: "E-Invoicing Architecture Ready for ETA / ZATCA", essential: "notIncluded", professional: "onActivation", enterprise: "custom" },
            { nameAr: "التوقيع الإلكتروني والاعتماد المباشر للفواتير (SDK / HSM)", nameEn: "Digital Signature & Direct Tax API Dispatch", essential: "notIncluded", professional: "onActivation", enterprise: "custom" },
          ],
        },
        {
          id: "governance",
          num: "06",
          titleAr: "6. الحوكمة والرقابة وسجل التدقيق (Controls, Governance & Audit)",
          titleEn: "6. Controls, Governance & Audit",
          items: [
            { nameAr: "صلاحيات المستخدمين حسب الأدوار الوظيفية (RBAC)", nameEn: "Role-Based Access Control (RBAC)", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "سجل تدقيق غير قابل للحذف أو التعديل (Audit Trail)", nameEn: "Immutable Cryptographic Audit Trail", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "اعتماد مالي ثنائي وفصل الصلاحيات (Maker-Checker)", nameEn: "Maker-Checker Two-Tier Approval Gate", essential: "notIncluded", professional: "included", enterprise: "included" },
            { nameAr: "عزل أمني تام لبيانات كل كيان ومؤسسة (Row-Level Security)", nameEn: "Tenant Data Isolation (PostgreSQL RLS)", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "إشعارات الرقابة المالية وتنبيهات تجاوز الموازنة", nameEn: "Budget Overrun & Financial Anomaly Alerts", essential: "notIncluded", professional: "included", enterprise: "included" },
          ],
        },
        {
          id: "ai",
          num: "07",
          titleAr: "7. الذكاء الاصطناعي والمطابقة الآلية (AI & Automation)",
          titleEn: "7. AI & Automation",
          items: [
            { nameAr: "استخراج بيانات فواتير الصيانة من الصور والمستندات (OCR)", nameEn: "Supplier Invoice OCR & Line-Item Extraction", essential: "notIncluded", professional: "included", enterprise: "custom" },
            { nameAr: "اقتراح القيود اليومية الذكية مع التحقق البشري", nameEn: "AI Journal Drafting with Human Approval", essential: "notIncluded", professional: "included", enterprise: "included" },
            { nameAr: "اقتراح مطابقة حركات البنك المعقدة وفروق السداد", nameEn: "Smart Bank Transaction Matching Suggestions", essential: "notIncluded", professional: "included", enterprise: "included" },
            { nameAr: "كوبيلوت الذكاء الاصطناعي للاستفسارات المالية (Ask AqarBooks)", nameEn: "Financial Copilot Assistant (Ask AqarBooks)", essential: "notIncluded", professional: "advanced", enterprise: "custom" },
          ],
        },
        {
          id: "support",
          num: "08",
          titleAr: "8. الترحيل والتدريب والدعم الفني (Implementation, Support & SLA)",
          titleEn: "8. Implementation, Support & SLA",
          items: [
            { nameAr: "قوالب ترحيل بيانات الوحدات والملاك المعتمدة", nameEn: "Standard Data Import Templates (Units & Members)", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "مطابقة وتدقيق الأرصدة الافتتاحية قبل الإطلاق", nameEn: "Opening Balance Reconciliation Sign-Off", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "جلسات تدريب حية للفريق المحاسبي والمشغلين", nameEn: "Live Role-Specific Team Training Sessions", essential: "included", professional: "included", enterprise: "custom" },
            { nameAr: "دعم فني عبر القنوات المباشرة والبريد", nameEn: "Direct Support Channels & Ticketing", essential: "included", professional: "included", enterprise: "included" },
            { nameAr: "مدير حسابات مخصص واتفاقية مستوى خدمة مؤسسية (SLA)", nameEn: "Dedicated Account Manager & Enterprise SLA", essential: "notIncluded", professional: "notIncluded", enterprise: "custom" },
          ],
        },
      ],
    },

    migrationAssurance: {
      eyebrow: isAr ? "ضمان بدء التشغيل والترحيل" : "IMPLEMENTATION & GO-LIVE ASSURANCE",
      headline: isAr
        ? "أرصدتك الافتتاحية متطابقة ومعتمدة قبل بدء التشغيل الفعلي."
        : "Your opening balances are reconciled before go-live.",
      support: isAr
        ? "الانتقال إلى نظام محاسبي جديد خطوة حساسة. نضمن لك دورة ترحيل آمنة ومنهجية تضمن سلامة أرقامك القديمة دون أي انقطاع في العمليات."
        : "Migrating financial systems is critical. We ensure a structured, zero-gap implementation guaranteeing that every historical balance matches before you post a single new entry.",
      steps: [
        {
          num: "01",
          titleAr: "اكتشاف الهيكل المالي (Financial Discovery)",
          titleEn: "Financial Discovery",
          descAr: "مراجعة شجرة الحسابات، الكيانات، مراكز التكلفة، وطبيعة الرسوم الخاصة بعقارك.",
          descEn: "Reviewing chart of accounts, legal entities, cost centers, and property fee models.",
        },
        {
          num: "02",
          titleAr: "تجهيز وتنظيف البيانات (Data Preparation)",
          titleEn: "Data Preparation",
          descAr: "حصر الوحدات، الملاك، العقود، ومديونيات كل وحدة في قوالب ترحيل مهيأة.",
          descEn: "Compiling units, members, contracts, and outstanding balances into verified schemas.",
        },
        {
          num: "03",
          titleAr: "الترحيل المحكوم والربط (Controlled Migration)",
          titleEn: "Controlled Migration",
          descAr: "استيراد البيانات وإجراء القيود الافتتاحية ومطابقتها مع كشوفاتك السابقة.",
          descEn: "Importing records, posting opening journals, and verifying sub-ledger integrity.",
        },
        {
          num: "04",
          titleAr: "تدريب الفريق المالي (Team Enablement)",
          titleEn: "Team Enablement",
          descAr: "تدريب عملي لكل موظف (محاسب، كاشير، مدير مالي) على سيناريوهات عمله اليومية.",
          descEn: "Hands-on role training for accountants, cashiers, and finance heads on live workflows.",
        },
        {
          num: "05",
          titleAr: "اعتماد الانطلاق (Go-Live Sign-Off)",
          titleEn: "Go-Live Verification",
          descAr: "مطابقة ميزان المراجعة الافتتاحي وتوقيع محضر الانطلاق الرسمي مع فريقنا.",
          descEn: "Opening balance verification sign-off and official operational launch.",
        },
      ],
    },

    trustLayer: {
      blocks: [
        {
          titleAr: "بياناتك ملكك بالكامل (Data Ownership)",
          titleEn: "Your data remains 100% yours",
          descAr: "تصدير فوري لكافة السجلات المالية، قيود اليومية، وكشوف الحسابات بصيغ قياسية (Excel, CSV, PDF) في أي وقت بدون أي عوائق.",
          descEn: "Export all financial ledgers, journal entries, and statements in open standard formats anytime without lock-in.",
        },
        {
          titleAr: "لا ترحيل أعمى (Zero Blind Migration)",
          titleEn: "Zero blind migration",
          descAr: "لا يبدأ العمل على النظام إلا بعد مطابقة ميزان المراجعة والأرصدة الافتتاحية والتأكد من مطابقة مدين = دائن بالكامل.",
          descEn: "System go-live occurs only after opening trial balance and sub-ledgers are strictly reconciled and signed off.",
        },
        {
          titleAr: "دعم بشري متخصص (Human Implementation)",
          titleEn: "Specialized human support",
          descAr: "فريق محاسبي وتقني متخصص يرافقك في التأسيس والتهيئة ويتحدث لغتك المحاسبية — مش مجرد شروحات عامة.",
          descEn: "Qualified real-estate finance specialists guide your setup and speak your accounting language — not generic bots.",
        },
      ],
    },

    faq: {
      eyebrow: isAr ? "الأسئلة الشائعة للمديرين الماليين والملاك" : "CFO & AUDITOR FAQ",
      headline: isAr ? "كل ما تحتاج معرفته حول التعاقد والتشغيل" : "Everything You Need to Know",
      items: [
        {
          qAr: "ما الذي يُحسب كوحدة عقارية (What counts toward unit capacity)؟",
          qEn: "What counts toward my unit capacity?",
          aAr: "تُحسب الوحدة العقارية كأي عقار مستقل يولد استحقاقاً مالياً أو كشف حساب مستقل (شقة سكنية، محل تجاري، مكتب إداري، فيلا، أو شاليه). الجراجات أو المخازن التابعة لنفس الوحدة لا تُحسب كوحدات إضافية، والوحدات المؤرشفة تاريخياً لا تستهلك من باقتك النشطة.",
          aEn: "A unit is defined as any discrete physical real estate space with its own sub-ledger or billing schedule (e.g. apartment, retail shop, office, villa, or chalet). Parking spaces or storage units linked to an existing unit do not count separately, and archived units do not consume active quota.",
        },
        {
          qAr: "كيف يعمل برنامج المؤسسين (Founding Customer Program)؟",
          qEn: "How does the Founding Customer Program work?",
          aAr: "برنامج المؤسسين هو مبادرة إطلاق حصرية مخصصة لأول 10 كيانات عقارية معتمدة. يمنح العملاء المؤهلين تثبيتاً لسعر باقة Professional المخفض (2,790 ج.م/شهر عند الدفع السنوي) مدى الحياة، بالإضافة إلى باقة ترحيل الأرصدة وتدريب الفريق.",
          aEn: "The Founding Customer Program is an exclusive launch cohort for our first 10 approved real-estate entities. It locks in the discounted Professional rate (EGP 2,790/mo on annual billing) for the life of the account, along with priority onboarding.",
        },
        {
          qAr: "هل النظام يدعم متطلبات الفاتورة الإلكترونية والضرائب في مصر والمنطقة؟",
          qEn: "Does AqarBooks support e-invoicing & tax regulations?",
          aAr: "نعم. تم بناء المحرك المحاسبي لـ AqarBooks وفق المعايير المحاسبية المصرية والدولية (EAS / IFRS)، مع بنية معمارية مجهزة للربط مع منظومة الفاتورة الإلكترونية والإيصال الإلكتروني لمصلحة الضرائب المصرية (ETA) وهيئة الزكاة والضريبة والجمارك (ZATCA)، مع احتساب ضريبة القيمة المضافة (14% VAT) وضرائب الخصم والتحصيل (WHT).",
          aEn: "Yes. The core accounting engine adheres to Egyptian and International Accounting Standards (EAS / IFRS), with architecture ready for ETA e-invoicing and ZATCA compliance, automatically handling 14% VAT and vendor withholding tax (WHT) calculations.",
        },
        {
          qAr: "هل يمكنني تصدير بياناتي ودفاتري إذا قررت إلغاء الاشتراك؟",
          qEn: "Can I export all financial data if I ever cancel?",
          aAr: "نعم، بياناتك ملكك بنسبة 100%. يمكنك تصدير كافة دفاتر الأستاذ العام، كشوف حسابات الملاك، قيود اليومية، والفواتير بصيغ Excel و CSV و PDF قابلة للتدقيق في أي لحظة وبكل سهولة.",
          aEn: "Yes, you maintain 100% data ownership. You can export complete general ledgers, journal entries, unit statements, and tax reports into standard Excel, CSV, and PDF formats at any time.",
        },
        {
          qAr: "كيف يتم ترحيل الأرصدة الافتتاحية القديمة والمديونيات السابقة؟",
          qEn: "How are historical balances and dues migrated?",
          aAr: "نوفر قوالب استيراد معتمدة ونقوم بمراجعة كشوف المتأخرات وأرصدة البنوك والخزينة معك خطوة بخطوة، مع تسجيل قيد افتتاحي متوازن يضمن بدء العمل بأرقام مطابقة تماماً لدفاترك السابقة قبل إطلاق النظام للتشغيل اليومي.",
          aEn: "We provide standardized migration templates and work alongside your team to reconcile historical receivables, bank balances, and cashbooks into an opening balanced journal before live daily operations commence.",
        },
        {
          qAr: "ما الفرق بين المستخدم المالي (User) والمالك أو الساكن؟",
          qEn: "What is the difference between a system User and an Owner/Resident?",
          aAr: "المستخدم (User) هو عضو فريقك الإداري والمحاسبي الذي يملك صلاحيات الدخول للوحة التحكم وتسجيل القيود والتحصيلات. أما الملاك والسكان فيمكنهم استلام كشوف الحسابات والإشعارات وإجراء السداد دون أن يستهلكوا من عدد مستخدمي النظام.",
          aEn: "A system user is an administrative or accounting staff member who logs into the management portal to post entries and review ledgers. Property owners and tenants receive invoices and statements without consuming system user seats.",
        },
      ],
    },

    finalCta: {
      eyebrow: isAr ? "جاهز لترتيب حسابات عقارك؟" : "READY TO UPGRADE YOUR PROPERTY BOOKS?",
      headline: isAr ? "افتح الدفتر المالي الحقيقي لعقارك اليوم." : "Open the true financial ledger for your property today.",
      support: isAr
        ? "الوحدة، المالك، التحصيل، فواتير الصيانة، والقيد المالي — في منظومة واحدة تريحك وتضمن حق كل طرف."
        : "Units, members, collections, maintenance bills, and balanced journals — in a single platform protecting every party's rights.",
      primaryCta: isAr ? "استكشف AqarBooks الآن ↗" : "Explore AqarBooks Now ↗",
      secondaryCta: isAr ? "احجز جلسة استشارية وعرض حي" : "Book a Live Walkthrough",
      trustStrip: isAr
        ? "قيد مزدوج حقيقي · ترحيل آمن للأرصدة · دعم محاسبي متخصص · ملكية تامة للبيانات"
        : "True Double-Entry · Reconciled Migration · Specialized Accounting Support · 100% Data Ownership",
    },
  };
}
