# خطة تشغيل الاختبارات التكاملية

**الحالة:** لم تُشغَّل الاختبارات التكاملية المحوّلة. لم تُعتمد قاعدة بيانات معزولة قبل تمرين B1B، ولم تُنفَّذ أي اختبارات مستودع ضدها. التحويل نفسه موثّق في `docs/progress/direct-write-tests-classification.md`.

## لماذا لم تُشغَّل

- الاختبارات تحتاج مساعد انتحال الهوية (`signedInClient`) لأن دوال الحالة تتحقق من `auth.uid()`، وعميل `service_role` لا يجتازه.
- تحتاج مخططاً مطبقاً بالكامل (90 ترحيلاً حتى `20261019100200`)، وهذا لا يتوفر إلا في الحاوية المعزولة.
- تحويل الكتابة المباشرة شمل 27 ملفاً: `tests/credit-notes.integration.test.ts`، `tests/e2e/asset-disposal.spec.ts`، `tests/e2e/einvoice-flow.spec.ts`، `tests/e2e/enterprise-suite-pillars.spec.ts`، `tests/e2e/finance-screens-show-their-data.spec.ts`، `tests/e2e/fixed-assets.spec.ts`، `tests/e2e/owner-portal-online-payment-fawry.spec.ts`، `tests/e2e/projects-wip.spec.ts`، `tests/e2e/reports-suite-flow.spec.ts`، `tests/e2e/supplier-invoice-fx.spec.ts`، `tests/final-hardening.integration.test.ts`، `tests/fixed-asset-disposal.integration.test.ts`، `tests/fixed-assets.integration.test.ts`، `tests/fx-difference.integration.test.ts`، `tests/input-tax.integration.test.ts`، `tests/maintenance-accounting-bridge.integration.test.ts`، `tests/member-opening-balance.integration.test.ts`، `tests/output-vat.integration.test.ts`، `tests/pilot-rehearsal.manual.test.ts`، `tests/project-wip.integration.test.ts`، `tests/record-online-payment-concurrency.integration.test.ts`، `tests/pgtap.integration.test.ts`، `tests/e2e/helpers/portal-fixture.ts`، `tests/finance-functions-authz.integration.test.ts`، `tests/finance-read-permissions.integration.test.ts`، `tests/finance-report-authz.integration.test.ts`، `tests/membership-status-access.integration.test.ts`.

## الحاوية المسموح بها

- الاسم بالنمط `g0rehearsal-<purpose>-<YYYYMMDD><suffix>`، مثل `g0rehearsal-b1b-20261024r3`. أي اسم آخر مرفوض.
- الشبكة `none` أو `internal`، دون منافذ منشورة.
- الصورة المعتمدة فقط (`supabase/postgres:17.6.1.165`).
- الوصول عبر `docker exec` بالسوكيت المحلي فقط.

## التحقق من هوية قاعدة البيانات قبل التشغيل

1. `docker inspect` للتأكد من الاسم والصورة و`NetworkMode` وغياب المنافذ.
2. `select current_database(), current_user, inet_server_port();` ويجب أن تكون قاعدة اسمها مؤقت (يبدأ بـ `g0reh`).
3. التأكد أن `auth.users` و`organizations` تحتوي فقط على صفوف تجريبية.
4. إذا فشل أي تحقق، لا يُشغَّل شيء.

## متغيرات البيئة (تُضبط صراحةً)

- `SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` و`SUPABASE_ANON_KEY` قيم الحاوية المعزولة فقط، ولا تُقرأ من ملفات `.env`.
- تعطيل تحميل `.env` في أداة الاختبار، والتحقق من ذلك في ملفات الإعداد قبل التشغيل.
- عدم تعيين أي مفتاح إنتاجي، وعدم وجود `DATABASE_URL` يشير إلى غير الحاوية.

## الترتيب

1. فحص الترحيلات (`apply.log` يجب أن ينتهي بـ `ALL 90 APPLIED`).
2. اختبارات pgTAP.
3. اختبارات الصلاحيات (`finance-*-authz`، `finance-read-permissions`).
4. اختبارات الكتابة المحوّلة (قائمة الملفات أعلاه).
5. اختبار التزامن `record-online-payment-concurrency`.
6. اختبارات الفترات والإقفال.

## ما يُبلَّغ

- الأمر الدقيق، واسم الحاوية، ونتيجة التحقق من الهوية.
- العدد الكلي والناجح والفاشل والمتخطى لكل ملف.
- كل فشل يُصنَّف (PRODUCTION_BUG، TEST_EXPECTATION_BUG، ENVIRONMENT_OR_HARNESS، FLAKY، AMBIGUOUS) مع الخطأ الحرفي.
- أي اختبار لم يُشغَّل يُسجَّل "لم يُشغَّل" وليس "نجح".
