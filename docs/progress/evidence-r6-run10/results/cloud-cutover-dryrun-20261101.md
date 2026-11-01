# تمرين تحويل السحابة إلى Production — دليل محلي (2026-11-01)

كل ما هنا نُفّذ داخل حاويات `g0r6-*` المحلية على نسخة من قاعدة السحابة. **لا كتابة على السحابة.**

## 1) النسخة الاحتياطية

المصدر: `C:\Users\Lenovo\AppData\Local\Temp\aqar-cloud-backup-20261101\` (خارج git).

| الملف | الحجم | sha256 |
|---|---|---|
| `public_schema.sql` | 1,380,235 | `7a0b9fd1ba6c401704134fb2280fdf09293707165da005d050e936cb65cbcae9` |
| `public_data.sql` | 42,060,560 | `3be9134cdad45f709383441144b31d7e09549fb69fbd4235b0d7dc042e4e6566` |
| `auth_schema.sql` | 53,394 | `3925e9a05b585eb863b6af35ef52dc1968faf08a7c116a64527dfe954daad589` |
| `auth_data.sql` | 5,443,924 | `f0b6debda4eaaf4c37cc1dace9da8638246f4706222d36ab45d390d8c1f0bd83` |
| `roles.sql` | 370 | `168a95a9c745af5ed4679751f90419ac9dc434240a213b03e32a06d5664c2308` |

## 2) تمرين الاستعادة (نسخة مطابقة هذه المرة)

قاعدة `cloud_restore_v2` على `g0r6-db`، بعد تثبيت الامتدادات `btree_gist` (public) و`pgcrypto`/`uuid-ossp` (extensions)، ثم الاستعادة بالترتيب:
`auth_schema → public_schema → public_data → auth_data`.

- أخطاء: **3** فقط، وكلها بيئية لا فقدان بيانات:
  - `function public.handle_new_user() does not exist` — دالة `auth` trigger تُنشأ في `public` لاحقًا في الترتيب.
  - `schema "vault" does not exist` ×2 — قيود FK على `payment_provider_settings` تشير إلى `vault.secrets` (امتداد Supabase Vault غير مثبّت محليًا).
- التمرين السابق (بدون `btree_gist`) أظهر 5 أخطاء إضافية: قيدا `EXCLUDE` (`tax_rule_no_overlap`, `unit_leases_no_overlapping_active_or_scheduled`) — السبب امتداد ناقص، وليس قاعدة البيانات.
- السجل الكامل: `docs/progress/evidence-r6-run10/results/cloud-restore-v2.log`.

### أعداد الكائنات والصفوف بعد الاستعادة

| العنصر | القيمة |
|---|---|
| جداول `public` | 143 |
| دوال `public` | 582 (تشمل دوال الامتدادات) |
| سياسات | 202 |
| قيود `EXCLUDE` | 2 |
| organizations | 116 |
| journal_entries | 16,996 |
| journal_entry_lines | 75,743 |
| payments | 12,326 |
| payment_allocations | 23,232 |
| members | 694 |
| units | 612 |
| chart_of_accounts | 1,418 |
| auth.users | 1,512 |

**الخلاصة:** النسخة قابلة للاستعادة وللاستخدام في التعافي من الكوارث (RTO محلي ≈ 45 ثانية لمجموع الملفات).

## 3) تمرين تطبيق الترحيلات الـ34

قاعدة `cloud_migration_dryrun2` (نسخة كاملة من `cloud_restore_v2`)، ثم تطبيق الـ34 بالترتيب:

```
for f in $(ls supabase/migrations/*.sql | ... | awk '$0 >= "20261009120000"'); do psql -v ON_ERROR_STOP=1 -f "$f"; done
```

- النتيجة: **34/34 نجحت، 0 فشل**، زمن إجمالي ≈ 20 ثانية.
- السجل: `docs/progress/evidence-r6-run10/results/cloud-migration-dryrun-v2.log`.

### تعارضات القيم — فُحصت فعليًا

| الجدول/القيد | القيم الفعلية | موجودة في القائمة الجديدة؟ |
|---|---|---|
| `financial_audit_logs.action` | DUE_ISSUED (1)، LEASE_RENT_DUE_GENERATED (149) | نعم (قائمة 15 قيمة) |
| `journal_entries.source_type` | JOURNAL_VOUCHER (8,542)، RECEIPT_VOUCHER (8,266)، PAYMENT_VOUCHER (188) | نعم (القائمة الأصلية + YEAR_END_CLOSING) |
| `notifications.source_type` | lease_expiry_dispatch (69) | نعم (الترحيلات تضيف ولا تُضيّق) |
| `notifications.type` | LEASE_EXPIRY_REMINDER (69) | نعم (نفس الأسلوب) |
| `access_events.reason_code` | لا صفوف (0) | لا خطر |

- `payment_allocations.applied_on` (عمود جديد + SET NOT NULL): كل الصفوف 23,232 حُشت من `payments.payment_date`/`created_at`؛ `applied_on IS NULL` بعد الترحيل = **0**.
- قيود `payment_allocations_kind_fields`: كل الصفوف القديمة `kind='RECEIPT'` و`journal_entry_id`/`credit_account_id` غير موجودة أصلًا ⇒ لا انتهاك.

### حماية البيانات بعد الترحيل

| العنصر | قبل | بعد |
|---|---|---|
| organizations | 116 | 116 |
| journal_entries | 16,996 | 16,996 |
| journal_entry_lines | 75,743 | 75,743 |
| payments | 12,326 | 12,326 |
| payment_allocations | 23,232 | 23,232 |
| members | 694 | 694 |
| units | 612 | 612 |
| chart_of_accounts | 1,418 | 1,418 |
| auth.users | 1,512 | 1,512 |

## 4) مطابقة المخطط بعد الترحيل مقابل r6

| الفئة | r6 | بعد الترحيل | فرق |
|---|---|---|---|
| جداول | 145 | 145 | 0 |
| أعمدة (نوع/افتراضي/NULL) | 1,805 | 1,805 | 0 |
| فهارس | 484 | 484 | 0 |
| سياسات RLS | 204 | 204 | 0 |
| دوال (غير امتدادات) | 452 | 441 | r6 فقط: 11 |
| triggers | 138 | 128 | r6 فقط: 10 صفوف (5 triggers) |
| قيود | متطابقة | متطابقة | r6 فقط: 2 FK إلى `vault` + 2 triggers مشروع |

**الفارق الوحيد الحقيقي:** كائنات حماية مشروع WIP (`project_wip_net`, `capture_project_floor_baseline`, `guard_project_locked_fields`, `trg_jel_project_floor`, `trg_je_status_cancel_lock` …) موجودة في r6 فقط ومصدرها `docs/progress/proposals/*.sql`، **وليست ضمن الـ94 ترحيلًا**. لا كود تطبيق (`src/`) يستدعيها ⇒ لا أثر على الإطلاق، لكنها فجوة إعادة إنتاج في r6 تستحق تسجيلها في Batch 4.

## 5) التخزين (Storage)

- الدلاء: `member-documents` (خاص)، `maintenance-attachments` (خاص، حد 10MB، أنواع محددة).
- `storage.objects`: **0 صف** ⇒ لا ملفات تحتاج ترحيلًا أو نسخًا. النسخة الاحتياطية للقاعدة كافية.

## 6) الحكم

- النسخة الاحتياطية: **صالحة وقابلة للاستعادة**.
- الترحيلات الـ34: **آمنة على بيانات السحابة الحالية** (مثبتة بالتمرين على نسخة مطابقة).
- لا عائق تقني متبقٍ في نافذة الترحيل؛ المتبقي قرارات تنفيذية واعتمادات خارجية.
