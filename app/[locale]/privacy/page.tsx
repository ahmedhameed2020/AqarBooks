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
    title: isAr ? "سياسة الخصوصية | عقار بوكس" : "Privacy Policy | AqarBooks",
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
            توضّح هذه السياسة كيفية تعاملنا مع البيانات في منصة عقار بوكس. وثمة نوعان من
            البيانات، والتمييز بينهما مهم:
          </p>
          <ul>
            <li>
              <strong>بيانات حسابك:</strong> بياناتك بصفتك مستخدمًا (الاسم، البريد الإلكتروني،
              سجل الدخول). ونحن المتحكم فيها.
            </li>
            <li>
              <strong>بيانات دفاترك:</strong> ما تُدخله داخل المنصة عن الملاك والوحدات
              والقيود. ونحن <strong>معالج</strong> لها فحسب، وأنت المتحكم فيها.
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
            <strong>بيانات التسجيل:</strong> الاسم، والبريد الإلكتروني، واسم المنشأة، والدولة
            والعملة.
          </li>
          <li>
            <strong>بيانات الدخول:</strong> وقت الدخول، وعنوان بروتوكول الإنترنت (IP)، ونوع
            المتصفح، لأغراض الأمان وسجل التدقيق.
          </li>
          <li>
            <strong>سجل الإجراءات:</strong> من رحّل قيدًا، ومن أقفل صندوقًا، ومن عدّل صلاحية.
            وهذا جزء أساسي من التدقيق المحاسبي.
          </li>
          <li>
            <strong>بيانات الدفع:</strong> تُعالَج مباشرة لدى مزوّدي خدمات الدفع. ونحن{" "}
            <strong>لا نخزّن أرقام البطاقات</strong>.
          </li>
          <li>
            <strong>محتوى دفاترك:</strong> ما تُدخله بنفسك. ولا نطّلع عليه إلا إذا طلبت دعمًا
            فنيًا يستلزم ذلك.
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
            <li>تشغيل المنصة وتمكينك من الوصول إلى حسابك.</li>
            <li>تأمين الحساب واكتشاف محاولات الدخول غير المصرّح بها.</li>
            <li>توفير سجل تدقيق سليم، وهو متطلب محاسبي لا خيار اختياري.</li>
            <li>
              إرسال الرسائل التشغيلية (تأكيد البريد، واستعادة كلمة المرور، وإشعارات الفواتير).
            </li>
            <li>تحسين الخدمة بناءً على أنماط استخدام مجمّعة ومجهولة الهوية.</li>
          </ul>
          <p>
            <strong>نحن لا نبيع بياناتك لأي جهة</strong>، ولا نستخدمها في الإعلانات، ولا
            نشاركها مع أطراف أخرى غير المذكورين أدناه.
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
              <strong>Supabase:</strong> استضافة قاعدة البيانات والمصادقة.
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
            ولا يصل هؤلاء المزوّدون إلى البيانات إلا بالقدر اللازم لأداء دورهم، وهم ملتزمون
            تعاقديًا بحمايتها.
          </p>
        </>
      ),
    },
    {
      id: "transfers",
      heading: "مكان التخزين والنقل الدولي",
      body: (
        <p>
          تُخزَّن البيانات على بنية تحتية سحابية قد تقع خارج نطاق ولايتك القضائية. وعند نقل
          البيانات عبر الحدود، نعتمد على ضمانات تعاقدية مناسبة مع المزوّدين. وإذا كان لديك
          متطلب تنظيمي بتخزين البيانات داخل دولة بعينها، فهذا متاح ضمن باقات المؤسسات، ونرحّب
          بالتواصل معنا بشأنه.
        </p>
      ),
    },
    {
      id: "retention",
      heading: "مدة الاحتفاظ",
      body: (
        <>
          <p>
            نحتفظ ببياناتك طوال مدة سريان حسابك. وبعد الإنهاء تظل متاحة للتصدير مدة{" "}
            <strong>ثلاثين يومًا</strong>، ثم تُحذف من الأنظمة التشغيلية خلال مدة معقولة.
          </p>
          <p>
            وثمة استثناء مهم: <strong>سجلات التدقيق والقيود المرحّلة</strong> قد يلزم الاحتفاظ
            بها مدة أطول متى اقتضت ذلك القوانين المحاسبية أو الضريبية السارية عليك.
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
            ولممارسة أي من هذه الحقوق:{" "}
            <a href="mailto:privacy@aqarbooks.com">privacy@aqarbooks.com</a>. ونرد خلال مدة
            معقولة، لا تتجاوز ثلاثين يومًا في المعتاد.
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
          <li>دعم المصادقة الثنائية (TOTP).</li>
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
          لأي استفسار بشأن الخصوصية أو لممارسة حقوقك:{" "}
          <a href="mailto:privacy@aqarbooks.com">privacy@aqarbooks.com</a>
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
            This policy explains how we handle data in AqarBooks. There are two kinds of data,
            and the distinction matters:
          </p>
          <ul>
            <li>
              <strong>Your account data:</strong> your details as a user (name, email, sign-in
              history). We are the controller of this.
            </li>
            <li>
              <strong>Your ledger data:</strong> what you enter about your owners, units, and
              journal entries. Here we are only a <strong>processor</strong>, and you are the
              controller.
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
            <strong>Registration details:</strong> name, email, organisation name, country and
            currency.
          </li>
          <li>
            <strong>Sign-in data:</strong> timestamp, IP address, and browser type, for
            security and audit purposes.
          </li>
          <li>
            <strong>Action logs:</strong> who posted an entry, who closed a cashbox, who changed
            a permission. This is a core part of accounting audit.
          </li>
          <li>
            <strong>Payment data:</strong> handled directly by payment providers. We{" "}
            <strong>do not store card numbers</strong>.
          </li>
          <li>
            <strong>Your ledger content:</strong> what you enter yourself. We do not look at it
            unless you request support that requires it.
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
            <li>To run the platform and give you access to your account.</li>
            <li>To secure your account and detect unauthorised access attempts.</li>
            <li>To maintain a sound audit trail, an accounting requirement rather than a choice.</li>
            <li>
              To send operational email (email confirmation, password reset, billing notices).
            </li>
            <li>To improve the service using aggregated, anonymised usage patterns.</li>
          </ul>
          <p>
            <strong>We do not sell your data</strong>, we do not use it for advertising, and we
            do not share it with anyone beyond the processors listed below.
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
              <strong>Supabase:</strong> database hosting and authentication.
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
            These providers access data only as needed to perform their role and are
            contractually bound to protect it.
          </p>
        </>
      ),
    },
    {
      id: "transfers",
      heading: "Storage and international transfers",
      body: (
        <p>
          Data is stored on cloud infrastructure that may be located outside your country. Where
          data crosses borders we rely on appropriate contractual safeguards with our providers.
          If you have a regulatory requirement to keep data within a specific country, that is
          available on enterprise plans. Talk to us.
        </p>
      ),
    },
    {
      id: "retention",
      heading: "How long we keep it",
      body: (
        <>
          <p>
            We keep your data while your account is active. After termination it remains
            available for export for <strong>30 days</strong>, then is removed from operational
            systems within a reasonable period.
          </p>
          <p>
            One important exception: <strong>audit logs and posted journal entries</strong> may
            need to be retained longer where accounting or tax law in your jurisdiction requires
            it.
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
            To exercise any of these:{" "}
            <a href="mailto:privacy@aqarbooks.com">privacy@aqarbooks.com</a>. We respond within a
            reasonable period, usually within 30 days.
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
          <li>Two-factor authentication support (TOTP).</li>
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
          Any privacy question, or to exercise your rights:{" "}
          <a href="mailto:privacy@aqarbooks.com">privacy@aqarbooks.com</a>
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
