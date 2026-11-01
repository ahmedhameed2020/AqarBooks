# تصنيف ملفات الاختبار التي تكتب مباشرة في `fiscal_years` و `fiscal_periods`

**الغرض:** جرد الملفات التي تُدرج أو تُحدّث أو تحذف صفوفاً في جدولي السنوات المالية والفترات المالية مباشرة (عبر عميل `admin` أو عبر نص SQL)، مع تصنيف كل مجموعة أسطر وبديلها المقترح. هذا الجرد وثيقة فقط؛ لم يُعدَّل أي ملف اختبار.

**نطاق البحث:** `tests/**` (ملفات `.test.ts` و `.spec.ts` و `.manual.test.ts` والمساعدات). تم استثناء الاستعلامات القرائية (`select`) وأسطر الاستعلام عن `fiscal_periods` لاختيار فترة بالتاريخ.

**عدد الملفات:** وُجد **27 ملفاً** يكتب مباشرة، وليس 25 كما ورد في المهمة. الملفان الإضافيان هما `tests/e2e/helpers/portal-fixture.ts` و `tests/pgtap.integration.test.ts`، وقد أُدرجا هنا لأنهما يكتبان فعلياً.

## تعريف الفئات

- **(A) إعداد بيانات (fixture):** إدراج سنة/فترة لاحتياج ميزة أخرى. البديل: `create_fiscal_year` لإنشاء السنة (وهو ينشئ الفترات، كما يظهر في `tests/e2e/helpers/accounting-fixture.ts` السطور 125-130)، ثم `set_fiscal_period_status` لفتح كل فترة بسبب مكتوب.
- **(B) اختبار للكتابة المباشرة نفسها:** يجب إعادة كتابته ليتحقق من أن الكتابة المباشرة **مرفوضة**، وأن الانتقال يتم عبر الدالة فقط.
- **(C) تنظيف (teardown):** حذف صفوف الفترات والسنوات بعد الاختبار. يمكن إزالته إذا كان حذف المنظمة يحذف الصفوف المرتبطة بها بالتتابع (cascade). **يجب التحقق** من وجود هذا التتابع ومن أن حارس الحالة (trigger) لا يمنع الحذف المتتابع.

## القواعد المشتركة للبدائل (مهمة)

1. **دوال الحالة تتحقق من `auth.uid()`:** `create_fiscal_year` و `set_fiscal_period_status` تفحص `has_permission(auth.uid(), ...)`. عميل `service_role` لا يملك `auth.uid()`، فيفشل الاستدعاء بالخطأ 42501. لذلك البديل الصحيح هو جلسة مالك موقّعة الدخول (نمط `signedInClient` في `accounting-fixture.ts`)، وليس عميل `admin`. هذا ما ذكره التعليق في `tests/pgtap.integration.test.ts` (السطور 82-90) وفي `tests/record-online-payment-concurrency.integration.test.ts` (السطور 50-58) وهو السبب الذي دفع هذه الملفات إلى الكتابة المباشرة أصلاً.
2. **حارس الحالة يمنع الكتابة المباشرة:** يوجد trigger `trg_fiscal_periods_status_guard` و `trg_fiscal_years_status_guard` على `INSERT` و `UPDATE` و `DELETE` (يُتحقق منه في `tests/fiscal-year-closing-sql.test.ts` السطور 174-183). بعد تطبيق الحارس، **ستفشل كل الكتابات المباشرة في هذه الملفات** حتى لو كانت من عميل `admin`. هذا هو السبب الجوهري لوجوب التحويل.
3. **الاختبارات ذات المحتوى الاختباري:** التحويل لا يغيّر القيم المتوقعة، فقط طريقة إنشاء البيانات.

## الجدول

| # | الملف | أسطر الإدراج/التحديث | أسطر الحذف (تنظيف) | الفئة | سبب الكتابة | البديل المقترح |
|---|---|---|---|---|---|---|
| 1 | `tests/credit-notes.integration.test.ts` | 106، 110 | 165، 166 | A + C | إعداد سنة وفترة لاختبار الإشعارات الدائنة | `create_fiscal_year` + `set_fiscal_period_status(OPEN)` بجلسة مالك؛ حذف التنظيف يُزال بالتتابع |
| 2 | `tests/e2e/asset-disposal.spec.ts` | 50، 54 | 93، 94 | A + C | إعداد فترة لسيناريو التخلص من الأصل | نفس البديل؛ يُزال التنظيف |
| 3 | `tests/e2e/einvoice-flow.spec.ts` | 82، 96 | — | A | إعداد سنة وفترة لتدفق الفوترة الإلكترونية | `create_fiscal_year` + `set_fiscal_period_status(OPEN)` |
| 4 | `tests/e2e/enterprise-suite-pillars.spec.ts` | 72، 87 | — | A | إعداد سنة وعدة فترات للاختبار الشامل | `create_fiscal_year` ثم `set_fiscal_period_status` لكل فترة |
| 5 | `tests/e2e/finance-screens-show-their-data.spec.ts` | 87، 91 | 165، 166 (دالة `del`) | A + C | إعداد بيانات شاشات التقارير؛ الحذف عبر دالة تنظيف مساعدة | `create_fiscal_year` + `set_fiscal_period_status`؛ إزالة `del("fiscal_periods")` و `del("fiscal_years")` |
| 6 | `tests/e2e/fixed-assets.spec.ts` | 70، 74 | 92، 93 | A + C | إعداد سنة وفترة لسيناريو الأصول الثابتة | نفس البديل؛ يُزال التنظيف |
| 7 | `tests/e2e/owner-portal-online-payment-fawry.spec.ts` | 237، 244 | — | A | إعداد سنة وفترة لدفع المالك الإلكتروني | `create_fiscal_year` + `set_fiscal_period_status(OPEN)` بجلسة المالك نفسها |
| 8 | `tests/e2e/projects-wip.spec.ts` | 61، 65 | 82، 83 | A + C | إعداد سنة وفترة لأعمال المشاريع تحت التنفيذ | نفس البديل؛ يُزال التنظيف |
| 9 | `tests/e2e/reports-suite-flow.spec.ts` | 83، 94 | — | A | إعداد سنة 2026 وفترتها لمجموعة التقارير | `create_fiscal_year` + `set_fiscal_period_status(OPEN)` |
| 10 | `tests/e2e/supplier-invoice-fx.spec.ts` | 59، 63 | 99، 100 | A + C | إعداد سنة وفترة لفاتورة مورد بعملة أجنبية | نفس البديل؛ يُزال التنظيف |
| 11 | `tests/final-hardening.integration.test.ts` | 81، 89، 99، 107 | — | A | سنة حالية وسنة سابقة وفترة لكل منهما | `create_fiscal_year` للسنتين ثم `set_fiscal_period_status(OPEN)` |
| 12 | `tests/fixed-asset-disposal.integration.test.ts` | 66، 70 | 102، 103 | A + C | إعداد سنة وفترة لتخلص الأصل | نفس البديل؛ يُزال التنظيف |
| 13 | `tests/fixed-assets.integration.test.ts` | 78، 87 | 125، 126 | A + C | إعداد سنة وفترات (12 شهراً) لإهلاك الأصول | `create_fiscal_year` + `set_fiscal_period_status` لكل فترة؛ يُزال التنظيف |
| 13b | `tests/fixed-assets.integration.test.ts` | **227، 232** (تحديث الحالة إلى CLOSED ثم OPEN) | — | **B** | اختبار رفض الترحيل في فترة غير مفتوحة (`FISCAL_PERIOD_NOT_OPEN`)، وقد اعتمد على كتابة مباشرة للحالة | إغلاق الفترة عبر `set_fiscal_period_status(CLOSED, reason)`، ثم التحقق من `FISCAL_PERIOD_NOT_OPEN`، ثم إعادة الفتح عبر الدالة. وإضافة تحقق بأن `UPDATE` مباشر على `status` مرفوض بالحارس (انظر `it.todo` في `tests/fiscal-year-closing-sql.test.ts` السطر 272) |
| 14 | `tests/fx-difference.integration.test.ts` | 68، 72 | 102، 103 | A + C | إعداد سنة وفترة لفروق سعر الصرف | نفس البديل؛ يُزال التنظيف |
| 15 | `tests/input-tax.integration.test.ts` | 362، 366 | 154، 155 | A + C | إعداد سنة وفترة لضريبة المدخلات | نفس البديل؛ يُزال التنظيف |
| 16 | `tests/maintenance-accounting-bridge.integration.test.ts` | 217، 224 | 357، 358 | A + C | إعداد سنة وفترة لجسر الصيانة المحاسبي | نفس البديل؛ يُزال التنظيف |
| 17 | `tests/member-opening-balance.integration.test.ts` | 97، 101 | 137، 138 | A + C | إعداد سنة وفترة لرصيد افتتاحي للعضو | نفس البديل؛ يُزال التنظيف |
| 18 | `tests/output-vat.integration.test.ts` | 314، 318 | — | A | إعداد سنة وفترة لضريبة المخرجات | `create_fiscal_year` + `set_fiscal_period_status(OPEN)` |
| 19 | `tests/pilot-rehearsal.manual.test.ts` | 151، 155 | 191، 192 | A + C | إعداد سنة وفترة لتمرين الإطلاق اليدوي | نفس البديل؛ يُزال التنظيف |
| 20 | `tests/project-wip.integration.test.ts` | 66، 70 | 116، 117 | A + C | إعداد سنة وفترة لأعمال المشاريع تحت التنفيذ | نفس البديل؛ يُزال التنظيف |
| 21 | `tests/record-online-payment-concurrency.integration.test.ts` | 60، 66 | — | A | إعداد سنة وفترة؛ التعليق في الملف يبرر الكتابة المباشرة بسبب 42501 | جلسة مالك + `create_fiscal_year` + `set_fiscal_period_status`، لأن البديل الأول لا ينجح مع `service_role` |
| 22 | `tests/pgtap.integration.test.ts` | 88، 101 | — | A | إعداد سنة وفترة؛ التعليق في الملف (السطور 82-90) يبرر الكتابة المباشرة بسبب `auth.uid()` | جلسة مالك موقّعة الدخول بدلاً من `admin` |
| 23 | `tests/e2e/helpers/portal-fixture.ts` | 58، 59 (SQL) | — | A | إدراج SQL لسنة وفترة لبوابة المالك | دالتا RPC عبر جلسة مالك، أو إنشاء الصفوف عبر واجهة الفترات في مساعد الاختبار |
| 24 | `tests/finance-functions-authz.integration.test.ts` | 73، 74 (SQL) | — | A | إدراج SQL لسنة وفترة لاختبار صلاحيات الدوال المالية | `create_fiscal_year` + `set_fiscal_period_status` بجلسات المستخدمين المختبرين |
| 25 | `tests/finance-read-permissions.integration.test.ts` | 81، 82 (SQL) | — | A | إدراج SQL لسنة وفترة لاختبار صلاحيات القراءة | نفس البديل؛ الدوال تُستدعى بجلسة المستخدم الذي يُختبر |
| 26 | `tests/finance-report-authz.integration.test.ts` | 54، 55 (SQL) | — | A | إدراج SQL لسنة وفترة لاختبار صلاحيات التقارير | نفس البديل |
| 27 | `tests/membership-status-access.integration.test.ts` | 91، 92 (SQL) | — | A | إدراج SQL لسنة وفترة لاختبار صلاحيات حالة العضوية | نفس البديل |

## ملخص الأعداد

| الفئة | عدد الملفات | ملاحظة |
|---|---|---|
| (A) إعداد بيانات | **27** | كل الملفات تحتوي على كتابة إعداد |
| (B) اختبار الكتابة المباشرة نفسها | **1** ملف، سطران (227، 232) | `tests/fixed-assets.integration.test.ts`، وهو أيضاً ملف A للأسطر 78 و 87 |
| (C) تنظيف قابل للإزالة بالتتابع | **14** ملفاً، 28 سطراً حذف | الملفات: 1، 2، 5، 6، 8، 10، 12، 13، 14، 15، 16، 17، 19، 20 |

**ملاحظات على الفئة C:** الحذف المباشر أيضاً يمر بحارس الحالة (trigger على `DELETE`)، فإزالة الحذف تعتمد على أن التتابع من حذف المنظمة لا يُحجب بالحارس. هذا غير مُتحقَّق منه في هذا الجرد؛ يجب فحصه قبل الإزالة.

**الملفات التي لا تنظف بياناتها:** الملفات 3 و 4 و 7 و 9 و 11 و 18 و 21 و 22 وملفات SQL 23-27 لا تحتوي على حذف صريح للسنوات أو الفترات، وتعتمد على تنظيف المنظمة نفسه.

## ما لم يُنفَّذ

- لم يُعدَّل أي ملف من هذه الملفات (المهمة تقتصر على التصنيف).
- لم يُتحقَّق من وجود تتابع الحذف (`ON DELETE CASCADE`) في المخطط، ولم يُختبر أن حارس الحالة يسمح بالحذف المتتابع.
- لم يُشغَّل أي اختبار، ولم يُطبَّق أي ترحيل.

## نتيجة التنفيذ (تحويل الاختبارات)

**تصحيح مهم للقاعدة 1 أعلاه:** عميل `service_role` لا يملك `auth.uid()`، فاستدعاء `create_fiscal_year` أو `set_fiscal_period_status` بعميله يُرفض بالخطأ 42501 (مُتحقَّق منه من تعريف الدالتين في `supabase/migrations/20261019100100_fiscal_year_close_guards.sql`). لذلك لم يُنفَّذ التحويل بعميل `admin` كما ورد في الخطة، بل عبر **جلسة مالك موقّعة الدخول** (`TENANT_OWNER`) في كل ملف. الغلاف المشترك `tests/helpers/fiscal-calendar.ts` ينشئ السنة عبر `create_fiscal_year` ثم يفتح كل فترة عبر `set_fiscal_period_status`؛ القراءة فقط بعميل `admin`.

**فرق في الشكل:** `create_fiscal_year` ينشئ فترات شهرية، بينما كانت كثير من الملفات تنشئ فترة واحدة تغطي السنة. الملفات تستخدم الآن الفترة الشهرية التي تحتوي التاريخ المختبَر (أو كل الفترات المفتوحة عند الحاجة). الاختبارات لم تُشغَّل، لذلك لم يُتحقَّق من أن القيم المحاسبية المتوقعة لا تتغير.

**ملاحظة على الفئة C:** الحذف المباشر للفترات والسنوات كان يُرفض أصلاً بالحارس (R8) طالما المنظمة موجودة، فكان لا أثر له. إزالته لا تغيّر السلوك؛ الصفوف المفتوحة تُحذف بتتابع حذف المنظمة (`ON DELETE CASCADE` في `baseline` السطور 15568 و15573، واستثناء الحارس للحذف المتتابع). لم يُحذف أي صف فترة مغلقة أو مقفلة.

| # | الملف | الفئة | الإجراء | الحالة |
|---|---|---|---|---|
| 1 | `tests/credit-notes.integration.test.ts` | A+C | RPC بجلسة المالك؛ إزالة حذف الفترات والسنوات | محوَّل |
| 2 | `tests/e2e/asset-disposal.spec.ts` | A+C | RPC بجلسة المالك؛ إزالة الحذف | محوَّل |
| 3 | `tests/e2e/einvoice-flow.spec.ts` | A | RPC بجلسة المالك | محوَّل |
| 4 | `tests/e2e/enterprise-suite-pillars.spec.ts` | A | إنشاء السنة عبر RPC، فتح يناير فقط وإبقاء فبراير PLANNED كما كان | محوَّل |
| 5 | `tests/e2e/finance-screens-show-their-data.spec.ts` | A+C | RPC بجلسة المالك؛ إزالة `del` للفترات والسنوات (كانت مرفوضة بالحارس) | محوَّل |
| 6 | `tests/e2e/fixed-assets.spec.ts` | A+C | RPC بجلسة المالك؛ إزالة الحذف | محوَّل |
| 7 | `tests/e2e/owner-portal-online-payment-fawry.spec.ts` | A | RPC بجلسة `staffClient` (مالك) | محوَّل |
| 8 | `tests/e2e/projects-wip.spec.ts` | A+C | RPC بجلسة المالك؛ إزالة الحذف | محوَّل |
| 9 | `tests/e2e/reports-suite-flow.spec.ts` | A | RPC بجلسة المالك | محوَّل |
| 10 | `tests/e2e/supplier-invoice-fx.spec.ts` | A+C | RPC بجلسة المالك؛ إزالة الحذف | محوَّل |
| 11 | `tests/final-hardening.integration.test.ts` | A | إنشاء المالك قبل السنوات، ثم RPC؛ الفترة تُحسب بالتاريخ | محوَّل |
| 12 | `tests/fixed-asset-disposal.integration.test.ts` | A+C | RPC بجلسة المالك؛ إزالة الحذف | محوَّل |
| 13 | `tests/fixed-assets.integration.test.ts` | A+C+B | RPC لاثنتي عشرة فترة، وأول ثماني فترات للاختبار؛ إزالة الحذف | محوَّل |
| 13b | `tests/fixed-assets.integration.test.ts` (أسطر 226-245) | B | اختبار رفض: الكتابة المباشرة على `status` تُرفض بـ`FISCAL_STATUS_DIRECT_WRITE_BLOCKED` (42501) والصف يبقى كما هو؛ الإغلاق وإعادة الفتح عبر `set_fiscal_period_status` | مكتوب |
| 14 | `tests/fx-difference.integration.test.ts` | A+C | RPC بجلسة المالك؛ الفترة التي تحتوي 2026-06-01؛ إزالة الحذف | محوَّل |
| 15 | `tests/input-tax.integration.test.ts` | A+C | RPC بجلسة `owner`؛ الفترة التي تحتوي 2026-06-01؛ إزالة الحذف | محوَّل |
| 16 | `tests/maintenance-accounting-bridge.integration.test.ts` | A+C | مستخدم مالك مخصص (`fiscalOwner`) لأن ACCOUNTANT لا يملك `finance.periods.manage`؛ إزالة الحذف | محوَّل |
| 17 | `tests/member-opening-balance.integration.test.ts` | A+C | RPC بجلسة المالك؛ إزالة الحذف | محوَّل |
| 18 | `tests/output-vat.integration.test.ts` | A | RPC بجلسة المالك | محوَّل |
| 19 | `tests/pilot-rehearsal.manual.test.ts` | A+C | RPC بجلسة المالك (سنتان 2025-2026)؛ إزالة الحذف | محوَّل |
| 20 | `tests/project-wip.integration.test.ts` | A+C | RPC بجلسة المالك؛ الفترة التي تحتوي 2026-03-15؛ إزالة الحذف | محوَّل |
| 21 | `tests/record-online-payment-concurrency.integration.test.ts` | A | مالك موقّع الدخول (أُضيف تنظيف للمستخدم)؛ حُدِّث التعليق الذي يبرر الكتابة المباشرة | محوَّل |
| 22 | `tests/pgtap.integration.test.ts` (الاختبار 1 فقط) | A | مالك موقّع الدخول كما في الاختبار 12 | محوَّل (الملف `@ts-nocheck`) |
| 23 | `tests/e2e/helpers/portal-fixture.ts` | A | مالك مخصص للتقويم عبر RPC؛ إيصال الدفع يستخدم الفترة الشهرية بدل CTE الإدراج | محوَّل |
| 24 | `tests/finance-functions-authz.integration.test.ts` | A | مالك مخصص عبر RPC | محوَّل |
| 25 | `tests/finance-read-permissions.integration.test.ts` | A | مالك مخصص لكل منظمة خارج مصفوفة الشخصيات؛ `seedOrg` يستقبل معرّف الفترة | محوَّل |
| 26 | `tests/finance-report-authz.integration.test.ts` | A | تنظيف الأدوار + مالك مخصص لكل منظمة؛ القيود تُرحَّل إلى الفترة الشهرية | محوَّل |
| 27 | `tests/membership-status-access.integration.test.ts` | A | RPC بجلسة `ownerA` الموجود أصلاً | محوَّل |

**الأعداد:**

| الفئة | قبل | بعد |
|---|---|---|
| A: إعداد بيانات بكتابة مباشرة | 27 ملفاً | 0 (كلها محوَّلة إلى RPC بجلسة مالك؛ لم يُنقل أي ملف إلى B) |
| B: اختبار رفض الكتابة المباشرة | سطرا 227 و232 | اختبار رفض واحد (أسطر 226-245) |
| C: حذف تنظيف مباشر | 14 ملفاً، 28 سطراً | 0 (أُزيلت كلها؛ لا يوجد حذف أُبقي) |
| الملفات المعدَّلة | | 27 ملفاً في `tests/` + ملف مساعد جديد `tests/helpers/fiscal-calendar.ts` (تشمل `pgtap` و`portal-fixture`) |

**ملفات لم تُعالَج ولم تكن في الجرد (كتابة مباشرة ما زالت قائمة، خارج النطاق المسلَّم):**
- `tests/sandbox-pilot.manual.test.ts` (إدراج السطور 130 و134)
- `tests/supplier-invoice-fx.integration.test.ts` (إدراج 71 و75، حذف 111 و112)
- `tests/tax-enforcement.integration.test.ts` (إدراج 133 و138، حذف 237 و238)

**التحقق (لم يُشغَّل أي اختبار يتصل بقاعدة البيانات):**
- `npx tsc --noEmit -p .`: نجح بلا أخطاء. `tsconfig.json` يستثني `tests/`، لذلك أُضيف فحص منفصل بملف إعداد مؤقت خارج المستودع يشمل الملفات المعدَّلة: 77 خطأً، كلها من أنماط موجودة أصلاً (استدعاءات RPC غير مطابقة للأنواع المولَّدة مثل `clone_tenant_role_templates`، وفحوص `null` في `accounting-fixture.ts`)، ولم تُقارَن بنسخة HEAD.
- `npx vitest run tests/isolated-target-guard.test.ts`: 24 نجح من 24 (اختبار وحدة لا يتصل بقاعدة البيانات).
- اختبارات التكامل و e2e: **لم تُشغَّل**، ولا يمكن الادعاء بنجاحها.

## الحالة النهائية بعد المرحلة 0 (تحويل الملفات الثلاثة المتبقية ومراجعة الـ27)

**لم تُشغَّل أي اختبارات تكامل أو e2e، ولم يُتصل بقاعدة البيانات، ولم يُطبَّق أي ترحيل.** التحقق الوحيد المنفَّذ: `tsc --noEmit -p .`، واختبار وحدة لا يتصل بقاعدة البيانات (`tests/isolated-target-guard.test.ts`: 24 من 24).

### الملفات الثلاثة المتبقية

| الملف | الفئة | الإجراء | الحالة |
|---|---|---|---|
| `tests/sandbox-pilot.manual.test.ts` | A | إنشاء السنة عبر `createOpenFiscalYear` بجلسة المالك بعد إنشائه؛ لا حذف (لم يكن فيه حذف) | محوَّل (لم يُشغَّل) |
| `tests/supplier-invoice-fx.integration.test.ts` | A + C | `createOpenFiscalYear` بجلسة `asUser`، ثم اختيار الفترة التي تحتوي 2026-06-01 (نمط `fx-difference`)؛ حُذفت أسطر حذف الفترات والسنوات (انظر أدناه) | محوَّل (لم يُشغَّل) |
| `tests/tax-enforcement.integration.test.ts` | A + C | `createOpenFiscalYear` بجلسة المالك داخل `makeOrg` بعد إنشاء المالك؛ حُذفت أسطر حذف الفترات والسنوات | محوَّل (لم يُشغَّل) |

**تحقق الحذف (C):** الحذف المباشر للفترات والسنوات والمنظمة قائمة يُرفض بالحارس R8 (`fiscal_year_close_guards`)، فكان لا أثر له لأن أخطاءه لم تكن تُفحص. والحذف المتتابع عند حذف المنظمة مؤكَّد بـ`ON DELETE CASCADE` في `baseline_schema.sql` (السطور 15447، 15452، 15442) ومسموح به في الحارس عند غياب المنظمة. إذن الحذف المباشر زائد وإزالته لا تغيّر السلوك.

### مراجعة الـ27 ملفاً (المهمة 2)

راجعها ثلاثة مراجعين للقراءة فقط. النتيجة: **لا افتراض للشكل السنوي تأثر إلا في ملف واحد**.

| الملف | النتيجة |
|---|---|
| `tests/e2e/supplier-invoice-fx.spec.ts` | **تأثر وأُصلح**: نموذج الفاتورة يختار الفترة الأولى (`periods[0]`، يناير) افتراضياً، وفاتورة 2026-06-01 لا تقع فيها. أُضيف اختيار الفترة `2026-06` بالتسمية `YYYY-MM` (الترتيب: مورد، حساب مصروف، فترة) |
| `credit-notes`، `e2e/asset-disposal`، `e2e/einvoice-flow`، `e2e/enterprise-suite-pillars`، `e2e/finance-screens-show-their-data`، `e2e/fixed-assets`، `e2e/owner-portal-online-payment-fawry`، `e2e/projects-wip`، `e2e/reports-suite-flow` | لا افتراض تأثر. ملاحظة: `enterprise-suite-pillars` لا يستعمل الغلاف المشترك ويفتح يناير فقط، وهو مقصود. `fixed-assets.spec` يفتح يناير افتراضياً في واجهة الإهلاك، والمبلغ الشهري ثابت فلا تتغير القيم |
| `final-hardening`، `fixed-asset-disposal`، `fixed-assets`، `fx-difference`، `input-tax`، `maintenance-accounting-bridge`، `member-opening-balance`، `output-vat` | لا افتراض تأثر. `fixed-assets.integration`: `periodIds[7]` (أغسطس) يُغلق ثم يُعاد فتحه، و`depreciation_for_period` يعتمد العدد لا التاريخ |
| `pilot-rehearsal`، `project-wip`، `record-online-payment-concurrency`، `pgtap` (منطقة التحويل)، `e2e/helpers/portal-fixture`، `finance-functions-authz`، `finance-read-permissions`، `finance-report-authz`، `membership-status-access` | لا افتراض تأثر. `finance-read-permissions` سطر 232 يعيد حتى 12 صفاً لكن الاختبار يتحقق من `> 0` فقط. ملاحظة تجميلية: تعليقات قديمة في `pgtap` (أسطر 36-43 و118) |

### تحليل TypeScript (المهمة 3)

الأوامر: `tsc` بملف إعداد مؤقت خارج المستودع في مجلد scratchpad يمدّد `tsconfig.json` ويشمل الملفات الـ31 (الـ30 المذكورة + `tests/helpers/fiscal-calendar.ts`). الخط الأساسي: نسخة HEAD عبر `git archive HEAD -- tests lib app tsconfig.json package.json` مع رابط `node_modules`.

| التشغيل | عدد التشخيصات |
|---|---|
| HEAD (الأساس الكامل) | **60** |
| الشجرة الحالية (بعد الإصلاح) | **77** |
| HEAD tests على lib/app الحالية (عزل تأثير الاختبارات) | 60 |

**التشخيصات المقدَّمة من هذا العمل: 0.** الفرق 17 إجمالاً مصدره:
- **19 تشخيصاً** في `tests/e2e/helpers/accounting-fixture.ts` (`TS18047` و`TS2531`): الملف غير متتبَّع في git (ملف عامل سابق للعمل)، وليس ضمن ملفات هذا العمل.
- **-2** في `fx-difference` و`project-wip`: تشخيصان `TS2345` اختفيا لأن الاستدعاءات صارت متوافقة.

**تشخيص أُدخل ثم أُصلح خلال العمل:** `fixed-assets.integration.test.ts` سطرا 230 و240 (`set_fiscal_period_status` بـ`TS2345`: نوع `Returns: undefined` في الأنواع المولَّدة). أُضيف `as never` إلى كائن المعاملات في الموضعين، وهو النمط المتبع في المستودع.

**التشخيصات الباقية الموجودة في HEAD (لم تُصلح):** 60 تشخيصاً، أهمها `TS2345` على `clone_tenant_role_templates` (غير موجود في الأنواع المولَّدة) و`TS2352` في `fixed-asset-disposal` و`fx-difference` و`member-opening-balance` و`project-wip`.

### تشغيل المهمة 4 والتحقق

- `npx tsc --noEmit -p .`: خرج 0، صفر تشخيصات.
- `npx vitest run tests/isolated-target-guard.test.ts`: 24 من 24.

### ما لم يُنفَّذ

- لا تكامل ولا e2e (لم يُشغَّل أي منها).
- لم يُحذف أو يُعدَّل أي ملف خارج النطاق (`supabase/`، `lib/`، `app/`، والاختبارات غير المذكورة).
- لم تُصلح التشخيصات الموجودة في HEAD.
