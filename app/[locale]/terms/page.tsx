import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";

const LAST_UPDATED_AR = "٢٠ أغسطس ٢٠٢٦";
const LAST_UPDATED_EN = "20 August 2026";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "شروط الخدمة | عقار بوكس" : "Terms of Service | AqarBooks",
    description: isAr
      ? "الشروط التي تحكم استخدامك لمنصة عقار بوكس المحاسبية."
      : "The terms that govern your use of the AqarBooks accounting platform.",
  };
}

function arabicSections(): LegalSection[] {
  return [
    {
      id: "agreement",
      heading: "نطاق هذه الاتفاقية",
      body: (
        <>
          <p>
            تحكم هذه الشروط استخدامك لمنصة عقار بوكس (AqarBooks)، وهي منصة محاسبية لإدارة
            العقارات والمنتجعات واتحادات الملاك. بفتحك حسابًا أو باستخدامك المنصة، فإنك توافق
            على هذه الشروط.
          </p>
          <p>
            إذا كنت تستخدم المنصة نيابة عن شركة أو كيان، فإنك تقرّ بأن لديك الصلاحية لإلزام
            ذلك الكيان بهذه الشروط، وتشير كلمة <strong>&quot;أنت&quot;</strong> هنا إلى الكيان
            نفسه.
          </p>
        </>
      ),
    },
    {
      id: "account",
      heading: "الحساب والصلاحيات",
      body: (
        <>
          <p>
            أنت مسؤول عن دقة البيانات التي تسجّل بها، وعن الحفاظ على سرية كلمة المرور، وعن كل
            نشاط يتم من خلال حسابك.
          </p>
          <ul>
            <li>يجب أن تتمتع بالأهلية القانونية للتعاقد.</li>
            <li>
              أنت من يدير صلاحيات فريقك داخل المنصة، وأنت المسؤول عمّن تمنحه حق الوصول.
            </li>
            <li>
              إذا اشتبهت في وصول غير مصرّح به إلى حسابك، فأبلغنا فورًا على{" "}
              <a href="mailto:security@aqarbooks.com">security@aqarbooks.com</a>.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "data-ownership",
      heading: "بياناتك ملك لك",
      body: (
        <>
          <p>
            جميع البيانات التي تُدخلها (دليل الحسابات، القيود، بيانات الملاك والوحدات،
            المستندات) <strong>ملك لك</strong>، وليست ملكًا لنا. نحن نستضيفها ونعالجها لتمكيننا
            من تقديم الخدمة إليك، لا غير.
          </p>
          <p>
            وتمنحنا ترخيصًا محدودًا باستخدام بياناتك لهذا الغرض وحده: تشغيل المنصة، والنسخ
            الاحتياطي، والدعم الفني عند طلبك، والتحسينات التشغيلية.{" "}
            <strong>نحن لا نبيع بياناتك</strong> ولا نستخدمها لأغراض إعلانية.
          </p>
          <p>
            ويمكنك تصدير بياناتك في أي وقت. وفي حال إنهاء اشتراكك، يظل بإمكانك تصديرها لمدة{" "}
            <strong>ثلاثين يومًا</strong> بعد الإنهاء.
          </p>
        </>
      ),
    },
    {
      id: "ledger",
      heading: "طبيعة القيود المحاسبية",
      body: (
        <>
          <p>
            تقوم المنصة على مبدأ القيد المزدوج والقيود غير القابلة للتعديل. ويعني ذلك أن أي قيد
            جرى ترحيله <strong>لا يمكن تعديله أو حذفه</strong>. ويتم التصحيح بقيد عكسي موثّق
            يظل ظاهرًا في سجل التدقيق.
          </p>
          <p>
            وهذا تصميم مقصود لحماية سلامة دفاترك، وليس قيدًا يمكن التنازل عنه. وإذا لزم تعديل
            بيانات مرحّلة، فالسبيل الوحيد هو القيد العكسي.
          </p>
        </>
      ),
    },
    {
      id: "not-advice",
      heading: "المنصة أداة، لا مستشار",
      body: (
        <>
          <p>
            يوفّر عقار بوكس أدوات حسابية وتقارير، من بينها احتساب ضريبة القيمة المضافة وضرائب
            الخصم والتحصيل والجاهزية للفوترة الإلكترونية. غير أن المنصة{" "}
            <strong>ليست بديلًا عن محاسب قانوني أو مستشار ضريبي أو محامٍ</strong>.
          </p>
          <p>
            وتظل مسؤولية صحة الإقرارات المقدّمة إلى الجهات الضريبية، والالتزام بالقوانين
            السارية في نطاق ولايتك القضائية، مسؤوليتك أنت. وقد تتغير النسب الضريبية
            المهيّأة مسبقًا في المنصة بقرارات حكومية، ومراجعتها تقع على عاتقك.
          </p>
        </>
      ),
    },
    {
      id: "acceptable-use",
      heading: "الاستخدام المقبول",
      body: (
        <>
          <p>يُحظر استخدام المنصة في أيٍّ ممّا يلي:</p>
          <ul>
            <li>أي نشاط مخالف للقانون، أو غسل أموال، أو تهرّب ضريبي.</li>
            <li>محاولة الوصول إلى بيانات كيانات أخرى أو اختراق العزل بين المستأجرين.</li>
            <li>تعطيل الخدمة عمدًا أو تحميلها فوق طاقتها.</li>
            <li>إعادة بيع الخدمة أو ترخيصها من الباطن دون اتفاق مكتوب معنا.</li>
            <li>رفع برمجيات ضارة أو محتوى ينتهك حقوق الغير.</li>
          </ul>
        </>
      ),
    },
    {
      id: "subscription",
      heading: "الاشتراك والدفع",
      body: (
        <>
          <p>
            يتجدد الاشتراك تلقائيًا وفق الدورة التي اخترتها إلى أن تقوم بإلغائه. والأسعار هي
            المعلنة وقت الاشتراك، وسنُشعرك بأي تغيير فيها قبل{" "}
            <strong>ثلاثين يومًا</strong> على الأقل.
          </p>
          <p>
            وفي حال إخفاق عملية الدفع، سنعيد المحاولة ونُشعرك بذلك. وإذا ظل المبلغ متأخرًا،
            فقد نوقف الوصول إلى الحساب مؤقتًا، مع{" "}
            <strong>عدم حذف بياناتك</strong> خلال فترة السماح.
          </p>
        </>
      ),
    },
    {
      id: "availability",
      heading: "التوافر والدعم",
      body: (
        <>
          <p>
            نعمل على إبقاء الخدمة متاحة باستمرار، غير أنه قد يحدث توقف مخطط له لأغراض الصيانة،
            أو توقف طارئ خارج عن إرادتنا. وسنسعى إلى الإشعار المسبق بالصيانة المخطط لها.
          </p>
          <p>
            أما اتفاقيات مستوى الخدمة (SLA) المُلزِمة فتُحدَّد في عقد منفصل لباقات المؤسسات،
            وليست جزءًا من هذه الشروط العامة.
          </p>
        </>
      ),
    },
    {
      id: "liability",
      heading: "حدود المسؤولية",
      body: (
        <>
          <p>
            تُقدَّم الخدمة <strong>&quot;كما هي&quot;</strong>. وفي الحدود التي يسمح بها
            القانون، تقتصر مسؤوليتنا الإجمالية تجاهك عن أي مطالبة متصلة بالخدمة على المبالغ
            التي سدّدتها لنا خلال <strong>الاثني عشر شهرًا</strong> السابقة للمطالبة.
          </p>
          <p>
            ولا نتحمل المسؤولية عن الخسائر غير المباشرة أو التبعية، ولا عن الأخطاء الناشئة عن
            بيانات أدخلتها على نحو غير صحيح، ولا عن قرارات مالية اتخذتها بناءً على تقارير دون
            مراجعة مهنية.
          </p>
        </>
      ),
    },
    {
      id: "termination",
      heading: "الإنهاء",
      body: (
        <>
          <p>
            يمكنك إلغاء اشتراكك في أي وقت من إعدادات الحساب أو بمراسلتنا. ويجوز لنا إيقاف حسابك
            في حال مخالفتك هذه الشروط مخالفة جوهرية، مع إشعارك بالسبب.
          </p>
          <p>
            وبعد الإنهاء تظل بياناتك متاحة للتصدير مدة <strong>ثلاثين يومًا</strong>، ثم تُحذف
            من أنظمتنا التشغيلية خلال مدة معقولة، فيما عدا ما يُلزمنا القانون بالاحتفاظ به.
          </p>
        </>
      ),
    },
    {
      id: "law",
      heading: "القانون الحاكم",
      body: (
        <p>
          تخضع هذه الشروط لقوانين جمهورية مصر العربية. ويُسوّى أي نزاع بالتفاهم أولًا، فإن تعذّر
          ذلك، ينعقد الاختصاص للمحاكم المصرية المختصة، ما لم يُتفق على خلاف ذلك كتابةً في عقد
          مؤسسي منفصل.
        </p>
      ),
    },
    {
      id: "changes",
      heading: "تعديل الشروط",
      body: (
        <p>
          يجوز لنا تعديل هذه الشروط. وإذا كان التعديل جوهريًا، فسنُشعرك عبر البريد الإلكتروني أو
          داخل المنصة قبل سريانه بمدة معقولة. واستمرارك في استخدام المنصة بعد تاريخ السريان
          يُعدّ موافقةً منك على التعديل.
        </p>
      ),
    },
    {
      id: "contact",
      heading: "التواصل",
      body: (
        <p>
          لأي استفسار بشأن هذه الشروط:{" "}
          <a href="mailto:legal@aqarbooks.com">legal@aqarbooks.com</a>
        </p>
      ),
    },
  ];
}

function englishSections(): LegalSection[] {
  return [
    {
      id: "agreement",
      heading: "What this agreement covers",
      body: (
        <>
          <p>
            These terms govern your use of AqarBooks, an accounting platform for real estate
            properties, resorts, and owners&apos; associations. By opening an account or using
            the platform, you agree to them.
          </p>
          <p>
            If you use the platform on behalf of a company or entity, you confirm you have the
            authority to bind that entity, and <strong>&quot;you&quot;</strong> refers to that
            entity.
          </p>
        </>
      ),
    },
    {
      id: "account",
      heading: "Your account and access",
      body: (
        <>
          <p>
            You are responsible for the accuracy of your registration details, for keeping your
            password confidential, and for all activity under your account.
          </p>
          <ul>
            <li>You must have the legal capacity to enter into a contract.</li>
            <li>
              You manage your team&apos;s permissions inside the platform, and you are
              responsible for who you grant access to.
            </li>
            <li>
              If you suspect unauthorised access, tell us immediately at{" "}
              <a href="mailto:security@aqarbooks.com">security@aqarbooks.com</a>.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "data-ownership",
      heading: "Your data belongs to you",
      body: (
        <>
          <p>
            Everything you enter (your chart of accounts, journal entries, owner and unit
            records, documents) <strong>belongs to you</strong>, not to us. We host and process
            it so we can provide the service, and for nothing else.
          </p>
          <p>
            You grant us a limited licence to use your data only for that purpose: running the
            platform, backups, support when you request it, and operational improvements. We{" "}
            <strong>do not sell your data</strong> and we do not use it for advertising.
          </p>
          <p>
            You can export your data at any time. If you cancel, you keep export access for{" "}
            <strong>30 days</strong> after termination.
          </p>
        </>
      ),
    },
    {
      id: "ledger",
      heading: "How the ledger behaves",
      body: (
        <>
          <p>
            The platform is built on double-entry accounting with immutable postings. Once an
            entry is posted it <strong>cannot be edited or deleted</strong>. Corrections are
            made through a logged reversing entry that stays visible in the audit trail.
          </p>
          <p>
            This is deliberate, and it protects the integrity of your books. It is not a
            limitation we can waive. If posted data needs correcting, a reversal is the only
            route.
          </p>
        </>
      ),
    },
    {
      id: "not-advice",
      heading: "The platform is a tool, not an adviser",
      body: (
        <>
          <p>
            AqarBooks provides calculation tools and reports, including VAT, withholding tax,
            and e-invoicing readiness. The platform is{" "}
            <strong>not a substitute for a licensed accountant, tax adviser, or lawyer</strong>.
          </p>
          <p>
            Responsibility for the accuracy of filings submitted to tax authorities, and for
            compliance with the laws of your jurisdiction, remains with you. Preconfigured tax
            rates may change by government decision, and reviewing them is your responsibility.
          </p>
        </>
      ),
    },
    {
      id: "acceptable-use",
      heading: "Acceptable use",
      body: (
        <>
          <p>You may not use the platform for:</p>
          <ul>
            <li>Any unlawful activity, money laundering, or tax evasion.</li>
            <li>Attempting to access another tenant&apos;s data or break tenant isolation.</li>
            <li>Deliberately disrupting or overloading the service.</li>
            <li>Reselling or sublicensing the service without a written agreement with us.</li>
            <li>Uploading malware or content that infringes others&apos; rights.</li>
          </ul>
        </>
      ),
    },
    {
      id: "subscription",
      heading: "Subscription and payment",
      body: (
        <>
          <p>
            Subscriptions renew automatically on your chosen cycle until cancelled. Prices are
            those published at the time of subscription, and we will give you at least{" "}
            <strong>30 days&apos;</strong> notice of any price change.
          </p>
          <p>
            If a payment fails we will retry and notify you. If it stays overdue we may suspend
            access, but <strong>we will not delete your data</strong> during the grace period.
          </p>
        </>
      ),
    },
    {
      id: "availability",
      heading: "Availability and support",
      body: (
        <>
          <p>
            We work to keep the service continuously available, but planned maintenance and
            events outside our control can cause downtime. We aim to give advance notice of
            planned maintenance.
          </p>
          <p>
            Binding service level agreements are set out in a separate enterprise contract and
            are not part of these general terms.
          </p>
        </>
      ),
    },
    {
      id: "liability",
      heading: "Limits of liability",
      body: (
        <>
          <p>
            The service is provided <strong>&quot;as is&quot;</strong>. To the extent permitted
            by law, our total liability to you for any claim relating to the service is limited
            to the amounts you paid us in the <strong>12 months</strong> before the claim.
          </p>
          <p>
            We are not liable for indirect or consequential loss, for errors arising from data
            you entered incorrectly, or for financial decisions you took based on reports
            without professional review.
          </p>
        </>
      ),
    },
    {
      id: "termination",
      heading: "Termination",
      body: (
        <>
          <p>
            You may cancel at any time from your account settings or by contacting us. We may
            suspend your account for a material breach of these terms, and we will tell you why.
          </p>
          <p>
            After termination your data stays available for export for <strong>30 days</strong>,
            after which it is removed from our operational systems within a reasonable period,
            except where law requires us to retain it.
          </p>
        </>
      ),
    },
    {
      id: "law",
      heading: "Governing law",
      body: (
        <p>
          These terms are governed by the laws of the Arab Republic of Egypt. Disputes are first
          addressed in good faith; failing that, the competent Egyptian courts have jurisdiction,
          unless otherwise agreed in writing in a separate enterprise contract.
        </p>
      ),
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      body: (
        <p>
          We may update these terms. If a change is material we will notify you by email or
          in-app a reasonable time before it takes effect. Continuing to use the platform after
          that date means you accept the change.
        </p>
      ),
    },
    {
      id: "contact",
      heading: "Contact",
      body: (
        <p>
          Questions about these terms:{" "}
          <a href="mailto:legal@aqarbooks.com">legal@aqarbooks.com</a>
        </p>
      ),
    },
  ];
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  return (
    <LegalPage
      locale={locale as Locale}
      eyebrow={isAr ? "المستندات القانونية" : "Legal"}
      title={isAr ? "شروط الخدمة" : "Terms of Service"}
      intro={
        isAr
          ? "صِيغت هذه الشروط بلغة واضحة قدر الإمكان، لأنه ينبغي أن تكون قادرًا على قراءتها فعليًا قبل الموافقة عليها."
          : "We wrote these in plain language, because you should actually be able to read them before agreeing."
      }
      lastUpdated={isAr ? LAST_UPDATED_AR : LAST_UPDATED_EN}
      sections={isAr ? arabicSections() : englishSections()}
    />
  );
}
