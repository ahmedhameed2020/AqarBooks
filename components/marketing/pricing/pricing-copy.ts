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
        : "AqarBooks Pricing | Accounting Built for Real-Estate Entities",
      description: isAr
        ? "تعرف على أسعار AqarBooks، منصة المحاسبة العقارية لإدارة الوحدات والملاك والمستحقات والتحصيل والقيود والتقارير المالية. برنامج إطلاق خاص لأول 10 كيانات عقارية."
        : "AqarBooks pricing — the real-estate accounting platform for units, owners, dues, collections, journal entries and financial reports. A limited launch program for our first 10 real-estate entities.",
    },

    hero: {
      eyebrow: isAr ? "أسعار AqarBooks" : "AqarBooks Pricing",
      headline: isAr
        ? "محاسبة عقارية تنمو مع حجم أعمالك"
        : "Real-estate accounting that scales with the entity you run",
      support: isAr
        ? "ادفع حسب حجم الكيان الذي تديره، لا مقابل عشرات الإضافات التي لا تحتاجها."
        : "Pay for the size of the entity you actually manage — not for dozens of add-ons you will never open.",
      trust: isAr
        ? ["قيد مزدوج حقيقي", "تتبع مالي على مستوى الوحدة", "سجل مالي مترابط"]
        : ["True double-entry", "Unit-level financial tracking", "A connected financial record"],
    },

    plan: {
      eyebrow: isAr ? "برنامج المؤسسين" : "Founding Program",
      headline: isAr ? "أول 10 كيانات عقارية" : "The first 10 real-estate entities",
      description: isAr
        ? "AqarBooks Founding Professional — المنصة المالية المتخصصة لإدارة الحسابات العقارية، بسعر إطلاق مخصص لأول عملائنا."
        : "AqarBooks Founding Professional — the specialised financial platform for real-estate accounting, at a launch price reserved for our first customers.",
      planName: "Founding Professional",
      slotsBadge: (remaining: number) =>
        isAr
          ? `متبقي ${remaining} أماكن في برنامج المؤسسين`
          : `${remaining} places remaining in the Founding Program`,

      monthly: {
        label: isAr ? "اشتراك شهري" : "Monthly",
        period: isAr ? "شهريًا" : "per month",
        support: isAr ? "دفع شهري مرن" : "Flexible month-to-month billing",
      },
      annual: {
        label: isAr ? "اشتراك سنوي" : "Annual",
        period: isAr ? "سنويًا — يُدفع مقدمًا" : "per year — paid upfront",
        support: (monthlyEq: string) =>
          isAr ? `ما يعادل ${monthlyEq} جنيه/شهر` : `Equivalent to EGP ${monthlyEq}/month`,
        recommended: isAr ? "الأفضل للتوفير السنوي" : "Best annual value",
        saving: (amount: string) =>
          isAr
            ? `وفّر ${amount} جنيه سنويًا مقارنة بالدفع الشهري.`
            : `Save EGP ${amount} a year compared with paying monthly.`,
      },
      currency: isAr ? "جنيه" : "EGP",

      capacityTitle: isAr ? "حدود الباقة" : "Plan capacity",
      capacityUnits: (n: string) =>
        isAr ? `حتى ${n} وحدة عقارية` : `Up to ${n} real-estate units`,
      capacityUsers: (n: string) => (isAr ? `حتى ${n} مستخدمين` : `Up to ${n} system users`),

      cta: isAr ? "احجز عرض AqarBooks" : "Book an AqarBooks walkthrough",
      ctaMicrocopy: isAr
        ? "تجربة موجهة تناسب طبيعة الكيان قبل اتخاذ قرار الاشتراك."
        : "A guided walkthrough shaped around your entity, before you commit to a subscription.",
      taxNote: isAr
        ? "الأسعار لا تشمل الضرائب المستحقة قانونًا."
        : "Prices exclude any legally due taxes.",
    },

    features: {
      eyebrow: isAr ? "ما الذي يشمله الاشتراك" : "What is included",
      headline: isAr ? "منظومة محاسبية عقارية كاملة" : "A complete real-estate accounting stack",
      items: [
        { ar: "حتى 500 وحدة عقارية", en: "Up to 500 real-estate units", ai: false },
        { ar: "حتى 10 مستخدمين", en: "Up to 10 system users", ai: false },
        { ar: "محاسبة بالقيد المزدوج", en: "True double-entry accounting", ai: false },
        {
          ar: "دفتر الأستاذ والتقارير المالية",
          en: "General ledger and financial reports",
          ai: false,
        },
        { ar: "إدارة الملاك والوحدات", en: "Owner and unit management", ai: false },
        { ar: "المستحقات والتحصيل", en: "Dues and collections", ai: false },
        { ar: "القبض والصرف والخزينة", en: "Receipts, payments and treasury", ai: false },
        {
          ar: "تهيئة ضريبية ودعم متطلبات الفواتير وفق نطاق النظام",
          en: "Tax configuration and invoicing support within the scope of the system",
          ai: false,
        },
        { ar: "الصلاحيات وسجل المراجعة", en: "Permissions and audit trail", ai: false },
        {
          ar: "AqarBooks AI وفق سياسة الاستخدام العادل",
          en: "AqarBooks AI under a fair-use policy",
          ai: true,
        },
        { ar: "واجهة عربية وإنجليزية", en: "Arabic and English interface", ai: false },
      ],
      aiNote: isAr
        ? "الذكاء الاصطناعي يقترح ويساعد — النظام المحاسبي يظل المرجع."
        : "AI proposes and assists — the accounting system remains the record of truth.",
    },

    why: {
      eyebrow: isAr ? "منطق التسعير" : "Why one plan",
      headline: isAr ? "ليه بنبدأ بباقة واحدة؟" : "Why we start with a single plan",
      support: isAr
        ? "نركز في مرحلة الإطلاق على الكيانات التي تحتاج محاسبة عقارية فعلية من اليوم الأول، بحدود واضحة وتجربة تشغيل متكاملة بدل تشتيت العميل بين باقات مبكرة لم تُبنَ بعد على بيانات السوق."
        : "At launch we focus on entities that need real real-estate accounting from day one — with clear limits and one complete operating experience, instead of splitting customers across early tiers that no market data supports yet.",
      blocks: [
        {
          title: isAr ? "حجم عملي" : "A practical size",
          value: isAr ? "حتى 500 وحدة" : "Up to 500 units",
          body: isAr
            ? "مساحة مناسبة للأبراج والمجمعات والقرى واتحادات الملاك والكيانات العقارية المتوسطة."
            : "Enough room for towers, compounds, resorts, owner associations and mid-sized real-estate entities.",
        },
        {
          title: isAr ? "فريق متكامل" : "A complete team",
          value: isAr ? "حتى 10 مستخدمين" : "Up to 10 users",
          body: isAr
            ? "للمحاسبة والإدارة والتحصيل والموظفين المخولين بالعمل داخل النظام."
            : "For accounting, management, collections and any staff authorised to work inside the system.",
        },
        {
          title: isAr ? "محاسبة فعلية" : "Real accounting",
          value: isAr ? "دورة واحدة مترابطة" : "One connected cycle",
          body: isAr
            ? "من الوحدة والمستحقات والتحصيل إلى القيد والأستاذ والتقرير المالي في دورة واحدة مترابطة."
            : "From unit, dues and collection through to journal entry, ledger and financial report — in one connected cycle.",
        },
      ],
    },

    onboarding: {
      eyebrow: isAr ? "التهيئة" : "Onboarding",
      headline: isAr
        ? "النظام المالي الجيد يبدأ بتهيئة صحيحة"
        : "A sound financial system starts with sound setup",
      support: isAr
        ? "لا نكتفي بإنشاء حساب فارغ. نساعدك على تجهيز هيكل الكيان والحسابات والبيانات الأساسية قبل بدء التشغيل."
        : "We do not simply hand over an empty account. We prepare your entity structure, chart of accounts and core data before you go live.",
      priceLabel: isAr ? "مرة واحدة" : "one-time",
      planLabel: isAr
        ? "تهيئة أساسية لعملاء برنامج المؤسسين"
        : "Core setup for Founding Program customers",
      requiredNote: isAr
        ? "التهيئة خطوة مطلوبة للتشغيل الفعلي."
        : "Onboarding is a required step before actual go-live.",
      itemsTitle: isAr ? "ما تشمله التهيئة" : "What core setup covers",
      items: [
        { ar: "إعداد بيانات الكيان", en: "Entity data setup" },
        { ar: "تهيئة دليل الحسابات", en: "Chart of accounts configuration" },
        { ar: "إعداد الوحدات والملاك", en: "Units and owners setup" },
        {
          ar: "تهيئة الأرصدة الافتتاحية المعتمدة التي يزوّدنا بها العميل",
          en: "Loading the approved opening balances you provide",
        },
        { ar: "إعداد المستخدمين والصلاحيات الأساسية", en: "Users and core permissions setup" },
        { ar: "تدريب الفريق", en: "Team training" },
        {
          ar: "استيراد البيانات الأساسية من Excel ضمن النطاق المتفق عليه",
          en: "Core data import from Excel within the agreed scope",
        },
      ],
      scopeNote: isAr
        ? "التهيئة الأساسية تغطي النطاق الموضح أعلاه فقط، ولا تشمل أعمال تنظيف أو مراجعة محاسبية مفتوحة."
        : "Core setup covers the scope listed above only. It does not include open-ended accounting cleanup or review work.",
    },

    migration: {
      eyebrow: isAr ? "ترحيل البيانات" : "Data migration",
      headline: isAr
        ? "لديك Excel أو Access أو نظام قديم؟"
        : "Coming from Excel, Access or a legacy system?",
      support: isAr
        ? "يمكننا مساعدتك في الانتقال، لكن ترحيل البيانات المعقدة يحتاج أولًا إلى فحص حقيقي للبيانات قبل تحديد التكلفة."
        : "We can help you move, but a complex migration needs a genuine inspection of your data before any cost can be set.",
      price: isAr ? "يُسعّر بعد فحص البيانات" : "Quoted after a data inspection",
      scopeTitle: isAr ? "نطاق محتمل للعمل" : "Potential scope of work",
      items: [
        {
          ar: "ترحيل قواعد بيانات Access والأنظمة القديمة",
          en: "Migrating Access databases and legacy systems",
        },
        { ar: "تنظيف البيانات", en: "Data cleansing" },
        { ar: "إعادة هيكلة العلاقات", en: "Restructuring data relationships" },
        { ar: "مطابقة الأرصدة التاريخية", en: "Reconciling historical balances" },
        {
          ar: "ترحيل القيود التاريخية عند الاتفاق عليها",
          en: "Migrating historical journal entries where agreed",
        },
        {
          ar: "معالجة البيانات الناقصة أو المتكررة",
          en: "Handling missing or duplicated data",
        },
      ],
      scopeNote: isAr
        ? "تنظيف البيانات، إعادة بناء الأرصدة، المطابقة التاريخية وترحيل القيود السابقة خارج نطاق التهيئة الأساسية ويتم تسعيرها بعد الفحص."
        : "Data cleansing, balance rebuilding, historical reconciliation and prior-entry migration fall outside core onboarding and are quoted after inspection.",
      trustNote: isAr
        ? "لن نفرض تكلفة ترحيل قبل فهم حجم العمل الفعلي."
        : "We will not put a migration price on the table before we understand the actual volume of work.",
    },

    after: {
      eyebrow: isAr ? "المرحلة التالية" : "What comes next",
      headline: isAr ? "ماذا بعد برنامج المؤسسين؟" : "What happens after the Founding Program?",
      body: isAr
        ? "بعد اكتمال برنامج المؤسسين، ستنتقل AqarBooks إلى باقات تجارية تعتمد على حجم الكيان واحتياجاته التشغيلية."
        : "Once the Founding Program is complete, AqarBooks will move to commercial plans based on entity size and operational needs.",
      anchorLabel: isAr
        ? "السعر التجاري المستهدف لباقتنا الاحترافية هو"
        : "The target commercial price for our professional plan is",
      anchorPeriod: isAr ? "شهريًا" : "per month",
      support: isAr
        ? "برنامج المؤسسين هو سعر إطلاق محدود لأول عملائنا، وليس تخفيضًا دائمًا على القيمة التجارية للمنصة."
        : "The Founding Program is a limited launch price for our first customers — not a permanent discount on the platform's commercial value.",
    },

    faq: {
      eyebrow: isAr ? "أسئلة متكررة" : "FAQ",
      headline: isAr ? "أسئلة قبل اتخاذ القرار" : "Questions before you decide",
      items: [
        {
          q: { ar: "إيه اللي بيحصل بعد العرض؟", en: "What happens after the walkthrough?" },
          a: {
            ar: [
              "لو AqarBooks مناسب لطبيعة الكيان، تقدر تفعّل اشتراك Founding Professional بالسعر الشهري أو السنوي المتاح لعملاء برنامج المؤسسين.",
            ],
            en: [
              "If AqarBooks fits your entity, you can activate a Founding Professional subscription at the monthly or annual price available to Founding Program customers.",
            ],
          },
        },
        {
          q: { ar: "هل التهيئة مطلوبة؟", en: "Is onboarding required?" },
          a: {
            ar: [
              "نعم. للتشغيل الفعلي لأول مرة نبدأ بتهيئة أساسية للكيان والتأكد من إعداد الهيكل والحسابات والبيانات الأساسية بصورة صحيحة.",
              "رسوم التهيئة لعملاء برنامج المؤسسين هي 2,900 جنيه مرة واحدة.",
              "أما ترحيل البيانات المعقدة أو تنظيف ومطابقة البيانات التاريخية فيتم تقييمه وتسعيره بشكل منفصل.",
            ],
            en: [
              "Yes. For a first real go-live we start with core setup of the entity and verify that the structure, accounts and core data are configured correctly.",
              "The onboarding fee for Founding Program customers is EGP 2,900, one time.",
              "Complex data migration, cleansing and historical reconciliation are assessed and quoted separately.",
            ],
          },
        },
        {
          q: { ar: "هل يوجد حد أدنى للالتزام؟", en: "Is there a minimum commitment?" },
          a: {
            ar: [
              "يمكن الاشتراك شهريًا بسعر 3,490 جنيه.",
              "أما الاشتراك السنوي فيبلغ 35,880 جنيه ويُدفع مقدمًا، بما يعادل 2,990 جنيه شهريًا ويوفر 6,000 جنيه مقارنة بالدفع الشهري طوال العام.",
            ],
            en: [
              "You can subscribe monthly at EGP 3,490.",
              "The annual subscription is EGP 35,880 paid upfront — equivalent to EGP 2,990 per month, saving EGP 6,000 compared with paying monthly across the year.",
            ],
          },
        },
        {
          q: { ar: "هل الأسعار تشمل الضرائب؟", en: "Do the prices include tax?" },
          a: {
            ar: [
              "الأسعار المعروضة لا تشمل الضرائب المستحقة قانونًا، وتُضاف — إن وجدت — وفق المعاملة الضريبية المطبقة وقت إصدار الفاتورة.",
            ],
            en: [
              "The prices shown exclude any legally due taxes. Where applicable, tax is added according to the tax treatment in force at the time the invoice is issued.",
            ],
          },
        },
        {
          q: { ar: "هل يوجد اشتراك مجاني؟", en: "Is there a free plan?" },
          a: {
            ar: [
              "لا نقدم حاليًا باقة مجانية دائمة.",
              "AqarBooks منصة مالية متخصصة تحتاج إلى تهيئة صحيحة للكيان قبل التشغيل الفعلي.",
            ],
            en: [
              "We do not currently offer a permanent free plan.",
              "AqarBooks is a specialised financial platform that needs the entity to be configured properly before real operation.",
            ],
          },
        },
        {
          q: { ar: "ماذا يحدث إذا تجاوزنا 500 وحدة؟", en: "What if we go beyond 500 units?" },
          a: {
            ar: [
              "نتواصل معك لترتيب الخطة التجارية المناسبة لحجم الكيان.",
              "لن يتم إيقاف النظام فجأة بسبب إضافة وحدة جديدة.",
            ],
            en: [
              "We contact you to arrange the commercial plan that suits the size of the entity.",
              "The system will not be cut off abruptly because a new unit was added.",
            ],
          },
        },
        {
          q: { ar: "هل الـ10 مستخدمين هم ملاك الوحدات؟", en: "Are the 10 users the unit owners?" },
          a: {
            ar: [
              "لا.",
              "المقصود مستخدمو النظام من المحاسبين والإدارة والتحصيل والموظفين المخولين باستخدام AqarBooks.",
            ],
            en: [
              "No.",
              "These are system users: accountants, management, collections staff and any employees authorised to use AqarBooks.",
            ],
          },
        },
        {
          q: { ar: "هل يشمل السعر الدعم؟", en: "Does the price include support?" },
          a: {
            ar: [
              "يشمل الاشتراك الدعم المعتاد لتشغيل المنصة ضمن نطاق الخدمة.",
              "التطويرات الخاصة والتكاملات المخصصة وترحيل البيانات المعقدة والأعمال الاستشارية يتم تقييمها بصورة مستقلة.",
            ],
            en: [
              "The subscription includes standard support for operating the platform within the scope of service.",
              "Custom development, bespoke integrations, complex data migration and advisory work are assessed independently.",
            ],
          },
        },
        {
          q: { ar: "هل استخدام AqarBooks AI غير محدود؟", en: "Is AqarBooks AI usage unlimited?" },
          a: {
            ar: [
              "ميزات AqarBooks AI متاحة ضمن سياسة استخدام عادل.",
              "سيتم ضبط حدود الاستخدام التجاري مستقبلًا بناءً على الاستخدام الفعلي وتكلفة التشغيل، دون ربط الوظائف المحاسبية الأساسية باستهلاك AI.",
            ],
            en: [
              "AqarBooks AI features are available under a fair-use policy.",
              "Commercial usage limits will be set later based on actual usage and operating cost, without tying core accounting functions to AI consumption.",
            ],
          },
        },
      ],
    },

    finalCta: {
      headline: isAr
        ? "انقل حسابات عقارك من الجداول المتفرقة إلى نظام مالي واحد"
        : "Move your property accounts from scattered spreadsheets into one financial system",
      support: isAr
        ? "شاهد كيف يربط AqarBooks الوحدة والمالك والاستحقاق والتحصيل والقيد والتقرير في دورة مالية واحدة."
        : "See how AqarBooks connects unit, owner, due, collection, journal entry and report into a single financial cycle.",
      cta: isAr ? "احجز عرض AqarBooks" : "Book an AqarBooks walkthrough",
      microcopy: isAr
        ? "لن نطلب منك نقل بياناتك قبل التأكد أن AqarBooks مناسب لطبيعة عملك."
        : "We will not ask you to move your data before we are sure AqarBooks fits how you work.",
      trust: isAr
        ? ["قيد مزدوج حقيقي", "تتبع مالي على مستوى الوحدة", "عزل بيانات كل كيان"]
        : ["True double-entry", "Unit-level financial tracking", "Per-entity data isolation"],
    },
  };
}
