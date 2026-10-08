import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";

const LAST_UPDATED_AR = "أكتوبر ٢٠٢٦";
const LAST_UPDATED_EN = "October 2026";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "سياسة الخصوصية | AqarBooks" : "Privacy Policy | AqarBooks",
    description: isAr
      ? "ما البيانات التي نجمعها، ولماذا، ومن يمكنه الوصول إليها."
      : "What data we collect, why, and who can access it.",
  };
}

function arabicSections(): LegalSection[] {
  return [
    {
      id: "scope",
      heading: "نطاق هذه السياسة",
      body: (
        <>
          <p>
            توضّح هذه السياسة كيفية تعاملنا مع البيانات في منصة AqarBooks، بما في ذلك تطبيق الهاتف.
            وتختلف التفاصيل بحسب ما تستخدمه:
          </p>
          <ul>
            <li>
              <strong>حسابك:</strong> في تطبيق الهاتف يصدر الحساب من مؤسستك، ولا يوجد تسجيل عام
              للمستخدمين؛ ونستخدم البريد الإلكتروني ومعرّف المستخدم لتسجيل الدخول وربطك بمؤسستك
              ووحداتك. أما في الويب فنستخدم بيانات الحساب الموضحة أدناه.
            </li>
            <li>
              <strong>بيانات المؤسسة ودفاترك:</strong> ما تُدخله أنت أو مؤسستك داخل المنصة عن
              الوحدات والقيود والسجلات التشغيلية. نعالجها لتقديم الخدمة، وتظل مؤسستك مسؤولة عن
              تحديد من يملك حق الوصول إليها.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "collect",
      heading: "البيانات التي نجمعها",
      body: (
        <ul>
          <li>
            <strong>بيانات الحساب والدخول:</strong> الاسم، والبريد الإلكتروني، ومعرّف المستخدم،
            واسم المنشأة، والدولة والعملة، ووقت الدخول، وعنوان بروتوكول الإنترنت (IP)، ونوع
            المتصفح، لأغراض الدخول والأمان وسجل التدقيق.
          </li>
          <li>
            <strong>بيانات الوحدات المالية:</strong> المستحقات والمدفوعات والإيصالات الخاصة
            بوحداتك، لعرضها ومتابعتها.
          </li>
          <li>
            <strong>المحتوى الذي تنشئه:</strong> طلبات الصيانة ووصفها وصورها الاختيارية، وأسماء
            الزوار وأرقام هواتفهم وتصاريح المرور المولّدة لهم ورموز QR الخاصة بها، وبيانات المركبات
            التي تسجلها.
          </li>
          <li>
            <strong>السجلات التشغيلية:</strong> عمليات التحصيل، وتحديثات أوامر الصيانة، وقرارات
            السماح أو الرفض عند البوابة ووقتها، بما في ذلك سجلات الإجراءات اللازمة للأمن والتدقيق.
          </li>
          <li>
            <strong>الكاميرا:</strong> تُستخدم فقط لمسح رموز تصاريح الزوار، وعند اختيارك التقاط
            صور لإثبات حالة الصيانة، ولا تعمل للتصوير في الخلفية.
          </li>
          <li>
            <strong>بيانات الدفع:</strong> تتم المدفوعات الإلكترونية في التطبيق عبر كود مرجعي
            يُسدّد لدى منافذ <strong>Fawry</strong>. ولا يجمع التطبيق أرقام البطاقات أو البيانات
            البنكية.
          </li>
          <li>
            <strong>اطّلاع فريق AqarBooks:</strong> لا يطّلع فريق AqarBooks على دفاترك أو على
            المحتوى الذي تُدخله أنت أو مؤسستك إلا إذا طلبت مؤسستك دعمًا فنيًا يستلزم ذلك. ويبقى
            وصول موظفي مؤسستك المخوّلين إلى هذه البيانات محكومًا بأدوارهم وصلاحياتهم.
          </li>
        </ul>
      ),
    },
    {
      id: "why",
      heading: "أغراض المعالجة",
      body: (
        <>
          <ul>
            <li>تشغيل المنصة والتطبيق وتمكينك من الوصول إلى حسابك ووحداتك.</li>
            <li>تأمين الحساب والأجهزة الموثوقة واكتشاف محاولات الدخول غير المصرّح بها.</li>
            <li>تمكين إدارة المؤسسة وفرقها المخوّلة من تنفيذ أعمال التحصيل والصيانة والبوابة.</li>
            <li>توفير سجل تدقيق سليم، وهو متطلب محاسبي وتشغيلي لا خيار اختياري.</li>
            <li>
              إرسال الرسائل التشغيلية (تأكيد البريد، واستعادة كلمة المرور، وإشعارات الفواتير).
            </li>
            <li>تحسين الخدمة بناءً على أنماط استخدام مجمّعة ومجهولة الهوية.</li>
          </ul>
          <p>
            <strong>لا نجمع موقعك الجغرافي أو جهات اتصالك، ولا نعرض إعلانات، ولا نبيع بياناتك</strong>.
            ولا نشاركها مع أطراف أخرى غير المذكورين أدناه.
          </p>
        </>
      ),
    },
    {
      id: "isolation",
      heading: "العزل بين الكيانات",
      body: (
        <>
          <p>
            بيانات كل كيان معزولة داخل قاعدة البيانات نفسها بسياسات{" "}
            <strong>Row-Level Security</strong> على مستوى PostgreSQL، لا بمجرد الترشيح في كود
            التطبيق.
          </p>
          <p>
            ويعني ذلك أنه حتى في حال وقوع خطأ برمجي في التطبيق، ترفض قاعدة البيانات نفسها
            تسليم بيانات كيان إلى كيان آخر.
          </p>
        </>
      ),
    },
    {
      id: "processors",
      heading: "الجهات التي تعالج البيانات معنا",
      body: (
        <>
          <p>نستعين بعدد محدود من المزوّدين التقنيين، ولكلٍّ منهم دور محدد:</p>
          <ul>
            <li>
              <strong>Supabase:</strong> استضافة البيانات والمصادقة؛ وتُنقل البيانات عبر HTTPS/TLS،
              ويُحكم الوصول إليها بصلاحيات الأدوار وسياسات Row-Level Security داخل مؤسستك.
            </li>
            <li>
              <strong>Cloudflare:</strong> استضافة التطبيق وتوصيل المحتوى والحماية من الهجمات.
            </li>
            <li>
              <strong>Resend:</strong> إرسال الرسائل التشغيلية (تأكيد البريد واستعادة كلمة
              المرور).
            </li>
            <li>
              <strong>مزوّدو خدمات الدفع:</strong> معالجة الاشتراكات والمدفوعات الإلكترونية.
            </li>
          </ul>
          <p>
            وتكون بياناتك مرئية لإدارة مؤسستك وفرقها المخوّلة بالقدر اللازم لأداء الخدمة، كما يصل
            المزوّدون التقنيون إليها بالقدر اللازم لدورهم، وهم ملتزمون تعاقديًا بحمايتها. ولا نشارك
            البيانات مع أطراف خارجية لأغراض تسويقية.
          </p>
        </>
      ),
    },
    {
      id: "transfers",
      heading: "مكان التخزين والنقل الدولي",
      body: (
        <p>
          تُخزَّن البيانات لدى Supabase على بنية تحتية سحابية قد تقع خارج نطاق ولايتك القضائية،
          وتُنقل مشفّرة عبر HTTPS/TLS. وعند نقل البيانات عبر الحدود، نعتمد على ضمانات تعاقدية
          مناسبة مع المزوّدين. أما بيانات اعتماد أجهزة البوابة الموثوقة فتُخزّن في التخزين الآمن
          للجهاز ولا تُستعاد على جهاز آخر.
        </p>
      ),
    },
    {
      id: "retention",
      heading: "مدة الاحتفاظ",
      body: (
        <>
          <p>
            نحتفظ ببياناتك طوال مدة سريان حسابك، ثم نتعامل معها وفق دورة حياة الخدمة
            والالتزامات المطبقة. وقد تُحذف من الأنظمة التشغيلية بعد انتهاء الحاجة إليها، مع مراعاة
            ما يلزم للتصدير أو الإغلاق المنظم.
          </p>
          <p>
            وتشمل الاستثناءات <strong>السجلات المالية والتدقيقية والقيود المرحّلة</strong> التي قد
            يلزم الاحتفاظ بها بالقدر والمدة اللذين تفرضهما الالتزامات النظامية أو المحاسبية أو
            الضريبية للمؤسسة.
          </p>
        </>
      ),
    },
    {
      id: "rights",
      heading: "حقوقك",
      body: (
        <>
          <p>يحق لك ما يلي:</p>
          <ul>
            <li>طلب نسخة من بياناتك الشخصية.</li>
            <li>تصحيح أي بيانات غير دقيقة.</li>
            <li>طلب حذف بياناتك، في حدود ما يسمح به القانون.</li>
            <li>الاعتراض على معالجة معيّنة أو طلب تقييدها.</li>
            <li>تصدير بياناتك بصيغة قابلة للقراءة.</li>
          </ul>
          <p>
            ولممارسة أي من هذه الحقوق، تواصل مع إدارة مؤسستك أو راسلنا على{" "}
            <a href="mailto:support@aqarbooks.com">support@aqarbooks.com</a>.
          </p>
        </>
      ),
    },
    {
      id: "security",
      heading: "الأمان",
      body: (
        <ul>
          <li>التشفير أثناء النقل (TLS) وأثناء التخزين.</li>
          <li>تُخزَّن كلمات المرور مُجزَّأة (hashed)، لا كنص صريح.</li>
          <li>عزل RLS على مستوى قاعدة البيانات بين جميع الكيانات.</li>
          <li>سجل تدقيق غير قابل للحذف لكل إجراء مالي حسّاس.</li>
          <li>دعم المصادقة الثنائية (TOTP) في خدمات الويب عند توفرها.</li>
          <li>تُخزّن بيانات اعتماد أجهزة البوابة في التخزين الآمن للجهاز.</li>
        </ul>
      ),
    },
    {
      id: "cookies",
      heading: "ملفات تعريف الارتباط",
      body: (
        <p>
          نستخدم ملفات تعريف ارتباط ضرورية للتشغيل فحسب: ملف الجلسة الذي يُبقيك مسجّل الدخول،
          وتفضيل اللغة. <strong>ولا توجد ملفات إعلانية ولا تتبّع لأطراف ثالثة.</strong>
        </p>
      ),
    },
    {
      id: "children",
      heading: "الخدمة غير موجّهة للأطفال",
      body: (
        <p>
          المنصة موجّهة للاستخدام المهني والمؤسسي، وليست مصمّمة لمن هم دون الثامنة عشرة. وإذا
          تبيّن لنا أن حسابًا فُتح لقاصر، فسنعمل على إغلاقه.
        </p>
      ),
    },
    {
      id: "contact",
      heading: "التواصل",
      body: (
        <p>
          لأي استفسار بشأن الخصوصية أو لممارسة حقوقك: تواصل مع إدارة مؤسستك أو راسلنا على{" "}
          <a href="mailto:support@aqarbooks.com">support@aqarbooks.com</a>.
        </p>
      ),
    },
  ];
}

function englishSections(): LegalSection[] {
  return [
    {
      id: "scope",
      heading: "What this policy covers",
      body: (
        <>
          <p>
            This policy explains how we handle data in AqarBooks, including the mobile app. The
            details differ depending on what you use:
          </p>
          <ul>
            <li>
              <strong>Your account:</strong> for the mobile app, your organisation issues your
              account and there is no public sign-up. We use your email address and user ID to sign
              you in and link you to your organisation and units. Web account data is described below.
            </li>
            <li>
              <strong>Organisation and ledger data:</strong> data you or your organisation enter
              about units, journal entries, and operational records. We process it to provide the
              service, while your organisation controls who is authorised to access it.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "collect",
      heading: "What we collect",
      body: (
        <ul>
          <li>
            <strong>Account and sign-in data:</strong> name, email, user ID, organisation name,
            country, currency, sign-in timestamp, IP address, and browser type, for sign-in,
            security, and audit purposes.
          </li>
          <li>
            <strong>Unit financial data:</strong> dues, payments, and receipts for your units, so
            you can view and track them.
          </li>
          <li>
            <strong>Content you create:</strong> maintenance requests and descriptions with
            optional photos, visitor names and phone numbers and the passes issued to them, including
            their QR codes, and vehicle details you register.
          </li>
          <li>
            <strong>Operational records:</strong> collections, work-order updates, and gate access
            decisions (allow or deny) and their times, including action logs needed for security and
            audit.
          </li>
          <li>
            <strong>Camera:</strong> used only to scan visitor pass codes and, when you choose, to
            capture maintenance evidence photos; it is not used for background capture.
          </li>
          <li>
            <strong>Payment data:</strong> in-app payment uses a reference code settled at Fawry
            outlets. The app does not collect card numbers or bank details.
          </li>
          <li>
            <strong>AqarBooks team access:</strong> our team does not inspect your ledgers or the
            content you or your organisation enter unless your organisation requests technical
            support that requires it. Inside your organisation, authorised staff keep role-governed
            access to that data.
          </li>
        </ul>
      ),
    },
    {
      id: "why",
      heading: "Why we collect it",
      body: (
        <>
          <ul>
            <li>To run the platform and app and give you access to your account and units.</li>
            <li>To secure your account and trusted devices and detect unauthorised access attempts.</li>
            <li>To allow your organisation and authorised teams to carry out collections, maintenance, and gate operations.</li>
            <li>To maintain a sound accounting and operational audit trail, which is a requirement
              rather than an optional feature.</li>
            <li>
              To send operational email (email confirmation, password reset, billing notices).
            </li>
            <li>To improve the service using aggregated, anonymised usage patterns.</li>
          </ul>
          <p>
            <strong>We do not collect location or contacts, show ads, or sell your data</strong>.
            We do not share it with anyone beyond the processors listed below.
          </p>
        </>
      ),
    },
    {
      id: "isolation",
      heading: "Isolation between entities",
      body: (
        <>
          <p>
            Each entity&apos;s data is isolated inside the database itself using{" "}
            <strong>Row-Level Security</strong> policies at the PostgreSQL level, not merely by
            filtering in application code.
          </p>
          <p>
            That means even if an application bug occurs, the database itself refuses to hand
            one entity&apos;s data to another.
          </p>
        </>
      ),
    },
    {
      id: "processors",
      heading: "Who processes data with us",
      body: (
        <>
          <p>We use a small set of technical providers, each with a defined role:</p>
          <ul>
            <li>
              <strong>Supabase:</strong> data hosting and authentication; data is transmitted over
              HTTPS/TLS, with access governed by role permissions and Row-Level Security within your
              organisation.
            </li>
            <li>
              <strong>Cloudflare:</strong> application hosting, content delivery, and attack
              protection.
            </li>
            <li>
              <strong>Resend:</strong> sending operational email (confirmation, password
              reset).
            </li>
            <li>
              <strong>Payment providers:</strong> processing subscriptions and online payments.
            </li>
          </ul>
          <p>
            Your data is visible to your organisation&apos;s authorised staff as needed to provide the
            service. Technical providers access data only as needed to perform their role, are
            contractually bound to protect it, and we do not share data with third parties for
            marketing.
          </p>
        </>
      ),
    },
    {
      id: "transfers",
      heading: "Storage and international transfers",
      body: (
        <p>
          Data is hosted by Supabase on cloud infrastructure that may be located outside your
          country and is transmitted using HTTPS/TLS. Where data crosses borders we rely on
          appropriate contractual safeguards with our providers. Trusted gate-device credentials are
          kept in the device&apos;s secure storage and cannot be restored onto another device.
        </p>
      ),
    },
    {
      id: "retention",
      heading: "How long we keep it",
      body: (
        <>
          <p>
            We keep your data while your account is active and then handle it according to the
            service lifecycle and applicable obligations. It may be removed from operational systems
            after it is no longer needed, subject to orderly export or closure requirements.
          </p>
          <p>
            This includes an important exception: <strong>financial and audit records and posted
            journal entries</strong> may need to be retained for the period and to the extent required
            by the organisation&apos;s legal, accounting, or tax obligations.
          </p>
        </>
      ),
    },
    {
      id: "rights",
      heading: "Your rights",
      body: (
        <>
          <p>You have the right to:</p>
          <ul>
            <li>Request a copy of your personal data.</li>
            <li>Correct anything inaccurate.</li>
            <li>Request deletion, within what the law allows.</li>
            <li>Object to or restrict certain processing.</li>
            <li>Export your data in a readable format.</li>
          </ul>
          <p>
            To exercise any of these, contact your organisation or email{" "}
            <a href="mailto:support@aqarbooks.com">support@aqarbooks.com</a>.
          </p>
        </>
      ),
    },
    {
      id: "security",
      heading: "Security",
      body: (
        <ul>
          <li>Encryption in transit (TLS) and at rest.</li>
          <li>Passwords are stored hashed, never in plain text.</li>
          <li>Database-level RLS isolation between all entities.</li>
          <li>An immutable audit trail for every sensitive financial action.</li>
          <li>Two-factor authentication support (TOTP) for web services where available.</li>
          <li>Trusted gate-device credentials are kept in the device&apos;s secure storage.</li>
        </ul>
      ),
    },
    {
      id: "cookies",
      heading: "Cookies",
      body: (
        <p>
          We use strictly necessary cookies only: the session cookie that keeps you signed in,
          and your language preference.{" "}
          <strong>No advertising cookies and no third-party tracking.</strong>
        </p>
      ),
    },
    {
      id: "children",
      heading: "Not intended for children",
      body: (
        <p>
          The platform is intended for professional and business use and is not designed for
          anyone under 18. If we find an account was opened by a minor, we will close it.
        </p>
      ),
    },
    {
      id: "contact",
      heading: "Contact",
      body: (
        <p>
          Any privacy question, or to exercise your rights: contact your organisation or email{" "}
          <a href="mailto:support@aqarbooks.com">support@aqarbooks.com</a>.
        </p>
      ),
    },
  ];
}

export default async function PrivacyPage({
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
      title={isAr ? "سياسة الخصوصية" : "Privacy Policy"}
      intro={
        isAr
          ? "دفاترك المالية من أشد بياناتك حساسية. توضّح هذه السياسة بدقة ما نفعله بها، ومن يمكنه الوصول إليها."
          : "Your financial books are among the most sensitive data you hold. This policy says exactly what we do with them, and who can reach them."
      }
      lastUpdated={isAr ? LAST_UPDATED_AR : LAST_UPDATED_EN}
      sections={isAr ? arabicSections() : englishSections()}
    />
  );
}
