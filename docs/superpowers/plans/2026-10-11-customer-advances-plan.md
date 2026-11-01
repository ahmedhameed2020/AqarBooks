# خطة تنفيذ الدفعات المقدمة (Customer Advances) — للمراجعة

**الحالة:** مسودة للمراجعة (المراجعة 2 للخطة، بعد المهمة 0) — **لا ترحيلات ولا كود قبل اعتمادها**. المواصفة المعتمدة: `docs/superpowers/specs/2026-10-11-customer-advances-design.md` (المراجعة 3).
**الهدف:** تنفيذ V1 كما في المواصفة: إيصال مقدم، تطبيق يدوي، إلغاء تطبيق، إلغاء إيصال بشروطه، قرّاء فعّالون بالتاريخ، أحكام D12/D13.
**البنية:** ترحيلان أماميان (مخطط وبيانات + عروض؛ ثم دوال)، طبقة أفعال خادم، واجهة، اختبارات DB ومتصفح، تحديث الوثائق والحزمة.
**التقنية:** PostgreSQL/Supabase (SECURITY DEFINER مع `search_path` ثابت)، Next.js 16، Vitest، Playwright على بناء الإنتاج.

## قيود عامة (من القواعد الدائمة)
* محلي فقط على الـstack المعزول (`npm run demo:stack-*` و`run-vitest-local.mjs`/`demo:e2e`)؛ لا إنتاج، لا commit/push/نشر، لا لمس لقاعدة التطوير ولا تنظيفها.
* ترحيلات أمامية فقط، لا تعديل لترحيل مطبَّق؛ كل ترحيل يُسجَّل في `tests/migration-directory-guard.test.ts` (الحجم وsha256 ومصدر `new_authorized_migration`) ويُتحقق من `npm run demo:stack-verify` (سجل = ملفات، بلا انحراف).
* كل دالة جديدة: `SECURITY DEFINER`, `SET search_path = ''` (أو `'public'` حيث تتطلب الأنماط الحالية)، `REVOKE ALL … FROM PUBLIC, anon` و`GRANT EXECUTE … TO authenticated` فقط، فحص صلاحية داخلي، وإدراج في `tests/security-function-grants.integration.test.ts`.
* قراءة دليل Next.js 16 في `node_modules/next/dist/docs/` قبل لمس أي route أو صفحة خادم.
* لا ميزات خارج المواصفة (لا استرداد، لا تطبيق تلقائي، لا إيداع مجهول).
* أي فشل اختبار يُصنَّف بالدليل (PRODUCTION_BUG / TEST_EXPECTATION_BUG / ENVIRONMENT_OR_HARNESS / FLAKY) قبل المتابعة.

## بوابات المراجعة
بعد كل مهمة أتوقف عند نقطة تحقق وأقدّم تقريرًا قصيرًا (أوامر وأرقام)؛ المهام 1 و3 و5 نقاط توقف إلزامية لاعتمادك قبل ما بعدها.

## المهمة 0 — خط أساس محلي (نُفِّذت، على الـstack المعزول فقط)
**التصنيف:** «خط أساس محلي» وليس «قراءة فقط»: تشغيل الاختبارات ينشئ fixtures في الـstack المعزول (`aqarbooks_clean`). لقطات الأرقام نفسها بجلسات قراءة فقط. لا لمس لقاعدة التطوير (456 مؤسسة، دون تغيير)، ولا تنظيف لتوفير المساحة.
**ما نُفِّذ:**
* سكربت `scripts/demo-local/advances-baseline.mjs` (`snapshot` / `compare <ملف>`): يلتقط `units_with_financials`, `members_with_financials`, رصيد كل استحقاق (`due_outstanding`), الإيصالات والتخصيصات (أعمدتها القديمة فقط) وعدّادات الجداول، مع بصمات SHA-256؛ يكتب التفريغ الكامل في مجلد temp وملخصًا في `docs/audits/phase3-evidence/advances-baseline-summary.json`.
* مراجع تشغيل قبل اللقطة: vitest (20 ملفًا، **251/251**): `tests/payments`, `receipt-methods-contract`, `payment-permission-key-guard`, `owner-portal-functions-authz`, `member-opening-balance`, `record-online-payment-concurrency`, `membership-status-access`, `security-function-grants`, `online-payment-production-foundation-rls`, `migration-directory-guard`؛ ومتصفح على بناء الإنتاج (**29/29**): `accounting-journey`, `accounting-void-permission`, `accounting-receivable-default`, `accounting-duplicates`. السجلات: `docs/audits/phase3-evidence/advances-baseline-{vitest,e2e}.log`.
* اللقطة (2026-10-11 12:08 UTC): 277 مؤسسة، 160 استحقاقًا، 53 إيصالًا (41 POSTED + الباقي REVERSED)، 16 تخصيصًا، 76 قيدًا؛ لا إيصال برصيد `unallocated_amount > 0`. `demo:stack-verify`: 73/73 بلا انحراف.
* **قيد:** لقطة اليوم مرجع للسجل فقط؛ تبقى اللقطة الملزِمة هي التي تُؤخذ **مباشرة قبل تطبيق الترحيل A** (الـstack يتغير مع كل تشغيل اختبارات)، ثم `compare` بعده.
* القرص: C: 5.4GB وD: 2.9GB حرة (99% مستخدم) — لا بناء إنتاج في المهمة 6 قبل التحقق وطلب موافقتك إن لم تكفِ المساحة.

## المهمة 1 — الترحيل A: المخطط والعروض (`20261017100000_phase3a_customer_advances_schema.sql`)
**الملفات:** ترحيل جديد، `tests/migration-directory-guard.test.ts`، `tests/customer-advances-schema.integration.test.ts` (جديد).
1. **اختبارات تفشل أولًا** (تُكتب وتُشغَّل على الـstack قبل الترحيل): وجود الأعمدة والقيود، trigger عدم تعديل `advance_amount`/`advance_account_id`، trigger التقاط `applied_on`/`kind` الافتراضيين لإدراج تخصيص بلا قيم (محاكاة `record_online_payment`)، التحقق من حساب الإعداد (LIABILITY فرعي فعّال في نفس المؤسسة)، معادلات السلامة، backfill (`applied_on = payment_date`، `reversed_on` من تاريخ الإلغاء المخزَّن)، والمطابقة مع `advances-baseline.json` (نفس `units_with_financials` والأرصدة).
2. **الترحيل (معاملة واحدة)** — يتضمن أيضًا:
   * **توافق مع `void_payment` القديمة (نُفِّذ):** trigger على `payments` يملأ `reversed_on` من `entry_date` لقيد العكس الفعلي عند ربطه (للتخصيصات المعكوسة غير المؤرَّخة فقط) + constraint trigger مؤجَّل يتحقق عند COMMIT + عدم قابلية تغيير تاريخ محفوظ. **اختبار التوافق** يمرّ بالدالة القديمة بعد A: التاريخ المشتق = تاريخ قيد العكس = اليوم.
   * backfill لـ`reversed_on` من `entry_date` لقيد عكس الإيصال (وإلا من تاريخ `reversed_at`).
   * `payment_allocations_as_of` و`payment_credit_balances` يستبعدان الإيصالات بلا قيد استلام مرحَّل (POSTED/REVERSED فقط).
   * `organization_finance_settings.customer_advance_account_id` + trigger تحقق + (لاحقًا في الترحيل B) دالة الضبط.
   * `payments`: `advance_amount`, `advance_account_id`, `request_hash` + القيود والـtrigger.
   * `payment_allocations`: `applied_on`, `reversed_on`, `kind`, `journal_entry_id`, `reversal_journal_entry_id`, `credit_account_id`, `created_at`, `created_by` + القيود؛ trigger إدخال يملأ `applied_on` من `payments.payment_date` و`kind='RECEIPT'` عند غيابهما؛ **backfill** للصفوف القائمة ثم `SET NOT NULL`.
   * `payment_credit_requests` (RLS مفعّلة، بلا منح للعملاء؛ تقرأها الدوال فقط).
   * `effective_payment_allocations` (security_invoker)، `payment_allocations_as_of(org, date)`، `payment_credit_balances` (مع `is_stranded`).
   * `CREATE OR REPLACE` لـ`units_with_financials` لتقرأ العرض الفعّال (نفس الأعمدة والأنواع بالضبط؛ التحقق من التبعيات `members_with_financials`).
   * حساب `2250 Customer Advances` في قالب `RESORT_STANDARD` (للمؤسسات الجديدة فقط) — دالة الاستنساخ الحالية تُعدَّل بإضافة صف واحد.
3. تطبيق عبر `npm run demo:stack-migrate`، ثم `demo:stack-verify` (سجل=ملفات، لا انحراف)، ثم تشغيل اختبارات الخطوة 1 (يجب أن تنجح) واختبار الترقية.
4. `advances-baseline.mjs snapshot` مباشرة قبل التطبيق و`compare` بعده (يجب IDENTICAL).
5. اختبار توافق الإلغاء القديم (أعلاه) قبل الانتقال إلى المهمة 3.
**نقطة توقف 1:** تقرير: لقطة قبل/بعد متطابقة، الأعمدة، الأعداد، نتيجة توافق الإلغاء القديم.

## المهمة 2 — توحيد القرّاء (نُفِّذت؛ بانتظار اعتمادك قبل المهمة 3)
**ما نُفِّذ:** 11 قارئًا انتقلوا إلى `effective_payment_allocations` (tenant-dashboard، cashier، dues، payments، aging، cash-flow-forecast، owner-statement، property drawer، property/[unitId]، بوابة المالك: dues والصفحة الرئيسية — الأخيرتان حذفتا عمود `reversed_at` وفلترته لأن العرض يستبعده). `lib/finance/payment-allocations.ts` (القارئ الموحّد: الفعّال الآن و`as_of` ومجموع كل استحقاق)، وأنواع TypeScript للعرضين والدالتين وأعمدة الجدولين.
**مبقى مباشرةً على الجدول (قائمة بيضاء بسبب مكتوب، يحرسها اختبار ثابت):** `property/payments-table.tsx` (سجل تاريخي يعرض الإيصالات الملغاة بحالتها عمدًا) و`lib/actions/member-portal-receipts.ts` (بحث لتخصيصات إيصال واحد يعرضه المالك). يُعاد النظر فيهما في المهمة 5 مع أسطر التطبيق.
**as_of:** لا توجد شاشة حالية تحسب أرقامًا مبنية على التخصيصات لتاريخ ماضٍ (الكل «الآن»)؛ لذلك أُضيف القارئ وأُثبت تطابقه مع الفعّال على البيانات القديمة، وتتبنّاه الكشوف عند إضافة البطاقات المؤرَّخة في المهمة 5.
**التحقق:** حارس ثابت (5 اختبارات)، اختبار تكافؤ على البيانات القديمة (9) بجلسات RLS حقيقية للموظف وللمالك، 65/65 متصفح محاسبة، 14/14 بوابة وشاشات، `tsc` نظيف، سجل=ملفات 74/74 بلا انحراف.

## المهمة 3 — الترحيل B: الدوال (نُفِّذت؛ بانتظار اعتمادك قبل المهمة 4)
`supabase/migrations/20261017100100_phase3b_customer_advances_functions.sql`: `set_default_customer_advance_account`, `record_advance_payment` (+ الداخلية `post_advance_payment_internal`), `apply_payment_credit`, `reverse_credit_application`، و`void_payment` المعاد توليدها من تعريفها الحي بتغييرين معلَّمين (فحص التطبيقات الفعّالة، و`reversed_on` = تاريخ قيد العكس مع بقاء تاريخ عكس سابق كما هو)، ومساعدات داخلية (`recompute_due_payment_status`, `assert_posting_period`, `credit_request_hash`, `normalize_credit_allocations`). المنح: الأربع العامة `authenticated` فقط وبقاعدة المنح المعتمدة؛ كل الداخلية بلا `authenticated`/`anon`/`PUBLIC`.
**الاختبار:** `tests/customer-advances.integration.test.ts` — 39 اختبارًا (أحمر قبل الترحيل ثم أخضر): القيود والأرصدة، الرفض بلا أثر (لقطة قبل/بعد)، idempotency بمحتوى (تطبيق/عكس/إيصال)، التزامن (أربع حالات)، المنح والعزل، حساب السلف الأصلي، D13 وعزل المالك الجديد عبر جلسة بوابة، وجدول التواريخ التاريخي مع مطابقة الميزان.

## المهمة 3ب — الترحيل C: إصلاحات المراجعة (`20261017100200_phase3c_customer_advances_integrity.sql`، نُفِّذ؛ A وB كما هما)
1. **الأرصدة التاريخية:** `credit_min_available_from` و`due_min_outstanding_from` (داخليتان): التطبيق لا يجوز أن يجعل رصيد الإيصال أو المتبقي على الاستحقاق سالبًا في أي تاريخ لاحق لتاريخ التطبيق (رموز `CREDIT_EXCEEDED_ON_DATE`, `ALLOCATION_EXCEEDS_REMAINING_ON_DATE`)، ولا يسبق تاريخ إصدار الاستحقاق (`APPLICATION_BEFORE_DUE`).
2. **قيد الاستلام:** `payment_receipt_entry_status` (definer، كلمة حالة واحدة للإيصال الذي يحق للمستدعي قراءته) تستعملها `effective_payment_allocations` و`payment_credit_balances` ودوال `as_of`؛ لا وصول جديد لدفتر الأستاذ.
3. **سجل مفاتيح واحد:** `payment_credit_requests` يسجّل التسجيل والتطبيق والعكس؛ المفتاح لا ينتقل بين العمليات في أي اتجاه، ولا يُقبل مفتاح يعرّف إيصالًا؛ backfill لإيصالات B.
4. **جلسة المالك:** دوال `as_of` تعمل بجلسته (يرى أرقامه فقط، والإيصال الملغى لا يظهر له كما في بقية البوابة).
سجل الاختبارات: `docs/audits/phase3-evidence/migration-C-test-run-record.md`.

## المهمة 3ج — الترحيل D: المراجعة الثانية (`20261017100300_phase3d_customer_advances_review2.sql`، نُفِّذ؛ A وB وC كما هي)
1. **كشف المالك التاريخي:** دالتا `as_of` صارتا definer بنطاق صريح (صلاحية `finance.payments.read` للمؤسسة، وإلا عضو المستدعي فقط والمؤسسة نشطة)، تُرجعان معرّفات ومبالغ فقط (`payment_allocations_as_of`: ستة أعمدة؛ `payment_credit_balances_as_of`: ستة أعمدة منها `advance_account_id` وهو معرّف حساب مجرد لا يفتح للمالك قراءة `chart_of_accounts` ولا أي قيد — تصحيح لعبارة سابقة «لا حساب» كانت غير دقيقة)؛ فيبقى الإيصال المُلغى لاحقًا ظاهرًا للمالك في كل تاريخ قبل إلغائه (مختبر يومًا بيوم ومطابق لعرض الموظف)، ويُحجب عن المالك الجديد والمؤسسة الأخرى والمجهول.
2. **`record_advance_payment`:** تاريخ الاستلام لا يسبق إصدار الاستحقاق (`PAYMENT_BEFORE_DUE`، رفض بلا أثر، ونجاح في يوم الإصدار نفسه)، ولا يُفرط في تسوية الاستحقاق في تاريخ لاحق.
3. **اتساق مع القراء:** الدوال الجديدة و`void_payment` تقيس «المدفوع» وتعيد حساب الحالة بتعريف القراء (تخصيص قائم + إيصال POSTED + قيد استلام POSTED) عبر `due_effective_paid`؛ `due_outstanding` القديمة لم تتغير.
4. **Playwright:** `playwright.config.ts` يثبّت حارس `createClient` في كل عامل (يربط كل عنوان بالـstack المتحقَّق منه ويفشل إغلاقًا إن تعذّر التثبيت) مع اختبارات محاكاة ومشاريع فرعية حقيقية.
سجل التشغيلات: `docs/audits/phase3-evidence/migration-D-test-run-record.md`؛ فرق اللقطة +20 بالصفوف: `snapshot-diff-plus20-rows.md`.

## المهمة 3د — الترحيل E: غياب الهوية ليس صلاحية (`20261017100400_phase3e_customer_advances_trusted_backend.sql`، نُفِّذ؛ A–D كما هي)
* `auth.uid() IS NULL` لم تعد تعني «خادم موثوق»: `is_trusted_backend()` تقرأ إعداد `role` (service_role أو اتصال إداري بلا دور) — الذي يضبطه PostgREST لكل طلب. طلب `authenticated` بلا subject، و`anon`، لا يحصلان على شيء من المساعد ولا الدالتين ولا العرضين.
* المالك المعلّق يفقد أرقامه ويستعيدها بعد إعادة التفعيل بالجلسة نفسها؛ الموظف لا يتأثر ويستطيع تطبيق الرصيد أثناء التعليق.
* حارس Playwright: استثناء المنفذ 1 صار لـloopback فقط في الدالة الفعلية (`example-project.supabase.co:1` و`10.1.2.3:1` وغيرهما مرفوضة بلا استدعاء للمنشئ ولا لـfetch).
سجل التشغيلات: `docs/audits/phase3-evidence/migration-E-test-run-record.md`.

## المهمة 4 — أفعال الخادم والأنواع (نُفِّذت؛ بانتظار اعتمادك قبل المهمة 5)
**الملفات:** `lib/actions/customer-advances.ts` (4 أفعال: `recordAdvancePaymentAction`, `applyPaymentCreditAction`, `reverseCreditApplicationAction`, `setCustomerAdvanceAccountAction` — تعمل بجلسة المستخدم عبر `lib/supabase/server` ولا تستورد أي عميل service/admin)، `lib/finance/customer-advances.ts` (مخططات zod، استخراج رمز الخطأ، رسائل عربية/إنجليزية لـ47 رمزًا + `invalid_input` + `unexpected`)، `lib/finance/operation-key.ts` (مفاتيح العملية)، و`lib/supabase/types.ts` (الدوال الأربع وأعمدة الإعدادات).
**قاعدة المفتاح:** الأفعال **لا تولّد** مفتاحًا؛ تتطلب `operationKey` (UUID) من المستدعي وتمرره كما هو. `createOperationKeys()` للواجهة: يبقى المفتاح ثابتًا عند إعادة محاولة العملية نفسها (فشل/مهلة/نقرة مزدوجة)، ويتغير عند تغيّر المحتوى أو بعد النجاح (`complete()`) أو عند التخلي (`reset()`).
**الاختبار:** 94 اختبارًا جديدًا (86 وحدة + 8 تكامل بجلسات حقيقية)؛ والمجموعة المتأثرة كاملة أُعيد تشغيلها معًا: **27 ملفًا / 416 من 416** (انظر سجل التشغيلات `migration-B-test-run-record.md`).

## المهمة 5 — الواجهة
**الملفات:** `finance/payments/payments-dialog.tsx` (سطر الباقي + تأكيد + «دفعة مقدمة بلا استحقاق»)، `payments-client.tsx` (رصيد متبقٍ، التطبيقات، أزرار التطبيق/العكس بحسب `receivables.allocations.manage`)، حوار جديد للتطبيق وآخر للعكس (سبب إلزامي)، صفحة إعدادات المالية لاعتماد حساب السلف (بجوار حساب المدينين)، الكشوف: `portal/(member)/statement` (أسطر معلوماتية + ثلاث بطاقات عند نهاية النافذة)، `property/[unitId]` ، `payments-table`، `lib/reports/payment-receipt-pdf.ts`، وسم «معلّق» لـ`is_stranded`، شارة «لديه رصيد دائن» على شاشة التذكير، ملاحظة صفحة «توزيعات المالك».
* نصوص عربية/إنجليزية متسقة (بما فيها الاسم اللاتيني AqarBooks).
**نقطة توقف 3:** مراجعتك للقطات الشاشات قبل اختبارات المتصفح.

## المهمة 6 — اختبارات المتصفح (بناء الإنتاج)
**الملفات:** `tests/e2e/customer-advances.spec.ts` (جديد، B1–B7)، تحديث `tests/e2e/helpers` عند الحاجة.
* **عزل المالك الجديد في البوابة (D13):** B8 — جلسة بوابة N بعد انتقال الملكية لا ترى رصيد M ولا إيصاله ولا أسطر تطبيقه في الكشف أو الوحدة أو الإيصالات، ومتأخراته كما هي؛ وجلسة M ترى رصيدها بوسم «معلّق».
* بناء الإنتاج عبر `node scripts/demo-local/build.mjs --next-only` ثم `start-prod.mjs` (بعد التأكد من القرص).
* تشغيل: `npm run demo:e2e -- tests/e2e/customer-advances.spec.ts` ثم حزم المحاسبة والبوابة المتأثرة (accounting journey, bank reconciliation, void permission, portal-journey, portal-refusals) للتأكد من عدم الانحدار.

## المهمة 7 — الإغلاق والوثائق
* `tsc --noEmit`، `eslint` على الملفات المعدلة، حارس الترحيلات، `demo:stack-verify`.
* تحديث: ورقة Gap Analysis مع دفترة (الدفعات المقدمة من «مفتوح» إلى «مثبت محليًا» مع تسجيل G-ADV-1)، تقرير مرحلة جديد في `docs/audits/`، الـrunbook، سجلات التشغيل في `portal-review-evidence`/`phase2-evidence`، إعادة بناء الحزمة والتحقق منها.
* التقرير الختامي: ما أُثبت، ما لم يُثبت، المخاطر الباقية.

## الاعتماديات والترتيب
`0 → 1 (توقف) → 2 → 3 (توقف) → 4 → 5 (توقف) → 6 → 7`. المهمة 2 تعتمد على العرض من 1؛ 3 تعتمد على 1؛ 5 تعتمد على 4.

## المخاطر والافتراضات للمراجعة
1. **القرص:** D: ضيق جدًا؛ المهمة 6 تحتاج بناء إنتاج. إن لم تتوفر مساحة أتوقف وأبلغ بدل المخاطرة.
2. **`units_with_financials`** يمسّ لوحات كثيرة؛ شرط النجاح: لقطة مطابقة للبيانات القديمة.
3. **تعريف البصمة القياسية للطلبات** (`request_hash`) تقني: jsonb الموحَّد + مبالغ بأربع خانات؛ يُختبر بتبديل ترتيب المفاتيح/التخصيصات (نفس البصمة) وتغيير مبلغ (بصمة مختلفة).
4. **تاريخ الإلغاء القديم:** `reversed_on` للتخصيصات القديمة يؤخذ من `entry_date` لقيد عكس الإيصال حيث وُجد (دقيق)، وإلا من تاريخ `reversed_at` (UTC، تقريب موثَّق).
5. **عدم تغيير** `post_payment_internal` و`record_online_payment` يقلّل الخطر لكنه يعتمد على trigger الإدخال؛ اختبار مخصص يحاكي مسارهما.
6. **صلاحيات المحاسب:** يملك التطبيق والعكس دون الإلغاء الكامل (مقصود، D8).
7. **الحجم:** ثلاث نقاط توقف تعني ثلاث جولات مراجعة؛ يمكن دمج 1 و2 إن شئت.

8. **حالة وسطى بين A وB:** معالَجة بالـtrigger واختبار التوافق؛ ومع ذلك يُنشر الترحيلان معًا في إصدار واحد.
9. **صلاحيات الدوال الجديدة:** الخطأ الأرجح هو ترك الدالة الداخلية بمنح تلقائي؛ يغطيه اختبار `proacl` الحرفي.

## معيار الاكتمال
كل بند في مصفوفة §8 من المواصفة ينجح، لقطات الرفض بلا أثر، لقطة الترقية مطابقة، المنح محدَّثة، 8/8 اختبار متصفح (B1–B8)، لا انحدار في حزم المحاسبة والبوابة، `tsc` و`eslint` بلا أخطاء، `demo:stack-verify` بلا انحراف، والحزمة محدَّثة.
