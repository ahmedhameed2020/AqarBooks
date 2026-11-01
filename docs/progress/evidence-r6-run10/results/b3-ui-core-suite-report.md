# نواة الواجهة المالية/المحاسبية على r6 — تقرير الحصيلة (مصحح بعد المراجعة المعادية)

**التاريخ:** 2026-10-31 · **البيئة:** حاويات `g0r6-*` المعزولة، خادم مُدار على المنفذ 3176 · **المنفذ:** وكيل `test-engineer` (coder) ضمن نظام التفويض، تحقق المنسق من الأدلة الحرجة، ثم مراجعة معادية `final-reviewer` (plan) دحضت التقرير الأول وصححته.
**المبدأ:** قراءة فقط طوال المهمة — لا تعديل كود، لا حذف fixtures، لا git actions. الزمن الإجمالي ≈ 47 دقيقة.
**السجلات:** `docs/progress/evidence-r6-run10/results/b3-ui-<name>.txt` (+ `-retry1`، ‏`-server.txt`، ‏`-artifacts/`).

## جدول الحصيلة (الأرقام المصححة بعد المراجعة المعادية)

| # | spec | exit | النتيجة | التصنيف |
|---|------|------|---------|---------|
| 1 | accounting-journey | 1 (retry 1) | قُتل عند حد 300s، صفر فشل تأكيدات | ENVIRONMENT_OR_HARNESS |
| 2 | accounting-duplicates | 1 (retry 1) | الأصلي: قُتل عند 300s؛ **الإعادة: فشل تأكيد حقيقي D4** | الأصلي HARNESS / الإعادة TEST_EXPECTATION_BUG |
| 3 | accounting-open-period-required | 1 | رفض RPC سليم لكن الواجهة لا تعرض السبب | PRODUCTION_BUG (متوسط — قرار مالك) |
| 4 | accounting-bank-reconciliation | 0 | 9/9 | GREEN |
| 5 | accounting-bank-unhandled-lines | 0 | 4/4 | GREEN |
| 6 | accounting-void-permission | 1 | لا يعالج حوار سبب الإلغاء الجديد | TEST_EXPECTATION_BUG |
| 7 | accounting-receivable-default | 0 | 5/5 | GREEN |
| 8 | accounting-issue-partial-success | 0 | 3/3 | GREEN |
| 9 | accounting-demo-defects | 1 | ‏baseURL ثابت ‏:3100 | TEST_EXPECTATION_BUG |
| 10 | asset-disposal | 0 | 1/1 | GREEN |
| 11 | projects-wip | 0 | 8/8 | GREEN |
| 12 | fixed-assets | 0 | 4/4 | GREEN |
| 13 | reports-suite-flow | 0 | 1/1 | GREEN |
| 14 | supplier-invoice-fx | 0 | 1/1 | GREEN |
| 15 | finance-screens-show-their-data | 0 | 1/1 | GREEN |
| 16 | enterprise-suite-pillars | 1 | نصوص معالج قديم أُزيلت (Batch 3) | TEST_EXPECTATION_BUG |
| 17 | einvoice-flow | 0 | 1/1 | GREEN |
| 18 | trial-balance-opening-db | 0 | 4/4 | GREEN |
| 19 | dashboard-bi1 | 0 | 1/1 | GREEN |
| 20 | year-end-closing-journey | 0 | 1/1 | GREEN |

**المجموع المصحح:** 14 GREEN (44 test) + ‏2 harness + ‏1 production + ‏4 test-expectation = 20. (تقرير الوكيل الأول قال خطأً 13/47 و«صفر فشل تأكيدات» — دحضه المراجع المعادي من `b3-ui-accounting-duplicates-retry1.txt:14,20-41`).

## تفاصيل التصنيفات (بعد التصحيح)

1. **HARNESS — المُشغّل**: `run-r6-e2e-managed.mjs:62` يثبت `timeout: 300000`. journey يحتاج ~8–9 دقائق لـ 15 اختبارًا. المعالجة المقترحة: رفع الحد إلى 600s أو تقسيم الـ spec. exit=1 هنا artifact لا إشارة منتج.
2. **PRODUCTION_BUG — الفجوة الوحيدة في المنتج** (`accounting-open-period-required:149`): مسار «Issue Due & Post» بتاريخ بلا فترة — RPC يرفض ذريًا بالرمز الصحيح (فحوص O0–O3 ناجحة)، لكن `issueDueAction` يمرر الخطأ عبر `dbErrorCode` (`lib/actions/receivables.ts:104`) وخريطته (`lib/actions/db-error-code.ts:4-15`) **بلا أي إدخال `FISCAL_PERIOD_*`** فيسقط على `query_failed`. والأدق من وصف الوكيل الأول (أثبته المراجع من artifact): الأزرار بقيت معطلة حتى مهلة الاختبار — أي أن السلوك المرصود **صمت معلّق** لا رسالة عامة. سياسة «لا نص خام من القاعدة للمحاسب» موثقة ومقصودة (`error-messages.ts:1-7`)، والحل يشبه F1: خريطة آمنة `FISCAL_PERIOD_*` ← رسالة ثنائية اللغة، مع تخفيف توقع الاختبار من الرمز الخام إلى الرسالة المخصصة.
3. **TEST_EXPECTATION_BUGs (4) — جذر مشترك لاثنين**: `void-permission:126` و`duplicates:137` يسجلان `page.on("dialog")` للنوافذ الأصيلة بينما المنتج يفتح **حوارًا داخليًا** «Reverse receipt» بسبب مطلوب وزر معطل — المعالج لا يشتغل أبدًا. الثالث: `demo-defects:116` منفذ ثابت. الرابع: `enterprise-suite-pillars` مكتوب ضد معالج Batch 3 القديم (النصوص غير موجودة في المنتج إطلاقًا؛ الحوار الجديد يصرح صراحة أنه لا يرحّل أرصدة).
4. **Skips محجوبة خارجيًا (6، موثقة لا فاشلة):** Fawry×2 + payment-provider-settings (البند 2)، tax-mapping-review (البند 1)، reports-unbuilt-sections (قرار 2026-10-29)، release-a-production-gate (البند 11).
5. **خارج الموجة (28 spec):** لم تُشغل — تبقى للموجة الثانية عند الحاجة.

## مخلفات على r6 (لم تُمس — قرار المالك)

- منظمة `pillar-org-*` يتيمة + مستخدم `pillar-owner-*@aqarbooks-test.local` (الفشل سبق التنظيف في السطر 119 بعد التأكيد 104).
- منظمتان إضافيتان من إعادتي journey/duplicates.
- حالة المدفوعات آمنة: حوار الإلغاء لم يُنفَّذ (السندات POSTED كما كانت).

## خلاصة قابلة للاعتماد

- المنتج في النواة المشغولة: **14/20 خضراء تمامًا، والفشل الوحيد في المنتج فجوة رسالة واحدة** (وسيئة بصمتها المعلّق أكثر من نصها).
- كل فشل آخر إما أداة تشغيل (حدّ المُشغّل) أو اختبارات متقادمة عن قرارات المنتج الموثقة.
- لا FLAKY ولا فشل غير مصنف.

---

## جولة التحقق بعد الإصلاحات (2026-11-01)

**البناء:** Webpack على r6، خرج 0 (601s). **اختبارات الوحدة المتأثرة:** 47/47 (`db-error-code` ‏16 + `finance-error-message` ‏31). **حد المُشغّل:** رُفع 300s→600s (`run-r6-e2e-managed.mjs:62`).

| spec | النتيجة | الدليل |
|---|---|---|
| accounting-journey | ✅ **15/15** تحت حد 600s (كانت تُقتل عند 300s) | `b3-fix-accounting-journey.txt` |
| accounting-void-permission | ✅ 4/4 — إصلاح حوار سبب الإلغاء مثبت | `b3-fix-accounting-void-permission.txt` |
| accounting-demo-defects | ✅ 6/6 — إصلاح baseURL مثبت | `b3-fix-accounting-demo-defects.txt` |
| enterprise-suite-pillars | ✅ 1/1 — إعادة كتابة قسم المعالج على الحوار الجديد مثبتة | `b3-fix-enterprise-suite-pillars.txt` |
| accounting-open-period-required | إصلاح الرسالة **مثبت**: تجاوز تأكيد السطر 149 ووصل السطر 155؛ ثم تعليق `page.goto` (بيئي) | `b3-fix-accounting-open-period-required.txt` |
| accounting-duplicates | D1 نجح؛ D2 تعليق `page.goto` عند `/en/finance/dues` قبل الجزء المعني | `b3-fix-accounting-duplicates.txt` |

**تشخيص التعليق البيئي (2026-11-01):** `page.goto` يتجاوز 120s (ثم يُغلق المتصفح)، بينما:
- قاعدة r6: صفر جلسات نشطة/أقفال (`pg_stat_activity` و`pg_blocking_pids` فارغان)
- الخادم المجهول يستجيب فورًا: `/en/login` ‏200 في 0.16s، صفحات محمية 307 في 0.15–0.28s
- سجل خادم التطبيق نظيف عدا `destination stream closed early` (نتيجة إغلاق المتصفح)
⇒ تصنيف مبدئي: `ENVIRONMENT_OR_HARNESS` (توقف تدفق SSR لطلب مصادَق بعينه)، لا علاقة له بالإصلاحات — في open-period نجح تأكيد الرسالة، وفي duplicates التوقف سبق منطق الحوار. جولة ثالثة (retry2) تحسم: عابر أم متكرر.

**جولة retry2 (2026-11-01):** التعليق عابر — الإعادتان النظيفتان نجحتا بالكامل:
- `accounting-open-period-required` → **exit=0، 6/6** (`b3-retry2-accounting-open-period-required.txt`)
- `accounting-duplicates` → **exit=0، 5/5** (`b3-retry2-accounting-duplicates.txt`)

**النتيجة النهائية: الست specs كلها خضراء** (open-period 6، void-permission 4، duplicates 5، demo-defects 6، pillars 1، journey 15 = 37 اختبارًا) + 47/47 وحدة + بناء exit 0. الإصلاحات الخمسة (2 منتج + 4 اختبارات + حد المُشغّل) مثبتة على r6.
