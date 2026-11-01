# انتقال السنة المالية من PLANNED إلى OPEN: تصميم ومراجعة التوافق

الملف: `supabase/migrations/20261019100400_fiscal_calendar_draft_and_open_transition.sql` (جديد، لم يُطبَّق ولم يُختبر على قاعدة بيانات).

## ما تغيّر

- `create_journal_entry_internal`: يرفض إنشاء قيد مسودة أو قيد قيد المراجعة إذا وقع تاريخه في فترة `CLOSED` أو `LOCKED`، برمز `FISCAL_PERIOD_NOT_OPEN` وSQLSTATE `P0001` (نفس رفض الترحيل الحالي). النسخة الأساسية من الدالة هي `baseline:2310-2382`، ولم تُعرَّف في أي ترحيل لاحق.
- محفّز `BEFORE UPDATE` على `journal_entries` يمنع نقل مسودة إلى فترة مغلقة عبر تغيير `entry_date` أو `fiscal_period_id`. لا توجد دالة في الترحيلات تحدّث `entry_date`، لذلك لا يوجد مسار آخر يحتاج تعديلاً.
- `open_fiscal_year(org, year, reason)`: تنقل السنة من `PLANNED` إلى `OPEN` فقط، وتفتح فتراتها `PLANNED` عبر `set_fiscal_period_status`. صلاحية `finance.periods.manage` مع عضوية نشطة. لا تصل أبداً إلى `CLOSED`.

## التوافق

**1. الإقفال (`close_fiscal_year`).** الدالة في `20261019100000_fiscal_year_closing_core.sql:217`. تقفل السنة بـ `FOR UPDATE` (السطر 296)، ثم تشترط أن تكون كل الفترات `CLOSED` أو `LOCKED` وإلا تعيد `PERIOD_NOT_CLOSED` (السطور 325-339). لا تقرأ `fiscal_years.status` إطلاقاً. النتيجة: سنة `OPEN` لا تُقفل حتى تُقفل فتراتها، وهذا السلوك صحيح.

**2. ميزان المراجعة والتقارير.** لا تفرّق بين `PLANNED` و`OPEN`:
- `app/[locale]/(app)/finance/reports/trial-balance/page.tsx:55-63` يبحث عن السنة بالتواريخ فقط.
- `app/[locale]/(app)/finance/reports/balance-sheet/page.tsx:53-60` كذلك.
- الدالة `get_trial_balance_with_opening` (`20261010120000_phase2_ledger_reversals_and_trial_balance_opening.sql:489-493`) تستخدم التواريخ فقط.

**3. الواجهة.** صفحة الفترات `app/[locale]/(app)/admin/finance/periods/periods-client.tsx`:
- السطر 477 يعرض `OPEN` كـ"نشطة" و`PLANNED` بنصه الخام.
- السطران 128 و147 يمنعان إعادة فتح فترة سنتها `CLOSED`.
- لا يوجد زر ينادي `open_fiscal_year` بعد. الواجهة لا تحتاج تغييراً لهذا الترحيل.

**4. الترحيل.** `post_journal_entry_internal` يشترط أن تكون **الفترة** `OPEN` (`20261019100100_fiscal_year_close_guards.sql:235-238`)، ولا يقرأ حالة السنة. إذن السنة `OPEN` وحدها لا تسمح بالترحيل. تفتح `open_fiscal_year` السنة وفتراتها معاً، فتبقى الحالتان متسقتين.

## المخاطر

1. **عائق (blocker) في ملف الحارس، ليس في هذا الملف.** `guard_fiscal_status_write` (`20261019100100_fiscal_year_close_guards.sql:118-137`) يقبل تغيير `fiscal_years.status` إلى `CLOSED` بسياق `close_fiscal_year` فقط. لا يقبل `PLANNED -> OPEN` بأي سياق، فتفشل `open_fiscal_year` بـ`FISCAL_STATUS_DIRECT_WRITE_BLOCKED` وتتراجع المعاملة كاملة. هذا فشل مغلق، لكن الدالة غير قابلة للاستخدام حتى يُضاف فرع للحارس (التفاصيل في رأس الملف، القسم 3).
2. **لا يوجد سجل تدقيق على مستوى السنة.** `FISCAL_YEAR_OPENED` غير موجودة في `check_audit_action` (`20261019100100_fiscal_year_close_guards.sql:393-402`). السجل الموجود هو سجل الفترات في `platform_audit_logs` ويحمل السبب. سبب فتح السنة نفسه غير مخزَّن.
3. **اختبارات الترحيلات الثابتة تنكسر.** `tests/migration-directory-guard.test.ts` يثبّت كل ملف بالاسم والحجم وSHA256، ويجب إضافة هذا الملف إليه. و`tests/fiscal-calendar-privileges.test.ts` يتوقع أن يكون `20261019100300` الأحدث، ويجب تحديثه.
4. **المحفّز جديد على `journal_entries`.** ترويسة الإقفال تقول إنه لا يوجد محفّز على هذا الجدول، وتصبح هذه العبارة غير صحيحة بعد التطبيق.
5. **فحص المسودات يطال مسارات الإنشاء الداخلية.** مثلاً سلفات العملاء تستدعي `create_journal_entry_internal` (`20261017100100_phase3b_customer_advances_functions.sql:283, 452, 557, 670`). كانت المسودة تُنشأ ثم يفشل الترحيل في الفترة المغلقة، أما الآن فيفشل الإنشاء مبكراً بالرمز نفسه. يحتاج الأمر اختباراً على قاعدة معزولة.
6. **لم يُنفَّذ أي اختبار على قاعدة بيانات.** كل ما هنا فحص ثابت. اختبارات DB المؤجلة موجودة في `tests/fiscal-calendar-transition.test.ts`.
