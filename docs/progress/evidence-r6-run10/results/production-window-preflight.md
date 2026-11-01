# بوابة التحقق النهائي قبل نافذة ترحيل Production (2026-11-01)

فحوص حية/قراءة فقط. لا كتابة سحابية، لا تغيير إعدادات، لا نشر.

## 1) هوية الهدف

| المصدر | القيمة |
|---|---|
| `supabase projects list` | **Aqar Books** — `ataslxkcflxuilpgyepm` — West EU (Ireland) — `●` (مرتبط) |
| `supabase/.temp/project-ref` / `linked-project.json` | `ataslxkcflxuilpgyepm` (ResortOS) |
| `.env.local` و`.env.production` | نفس المضيف `ataslxkcflxuilpgyepm.supabase.co` |
| حزمة الموقع الحي `aqarbooks.com` | تحتوي `https://ataslxkcflxuilpgyepm.supabase.co` |
| خطة الترحيل | نفس المرجع |

**GitHub:** بيئة `production` موجودة (بمراجع إلزامي)، لكن `variables` = **0** و`secrets` = **0**.
⇒ `PRODUCTION_SUPABASE_PROJECT_REF` **غير معلن**؛ خطوة `Validate expected production project` ستفشل قبل النشر. هذا لا يمنع ترحيل قاعدة البيانات (يعتمد على الـCLI link)، لكنه يمنع النشر عبر CI حتى يُعلن المتغير.

## 2) سجلات الترحيل

- محلي: **94** ملفًا.
- سحابي: **60** مطبَّقًا، **34** معلّقًا (‏`20261009120000` → `20261101090000`) — مطابق تمامًا لآخر جرد.
- `supabase db push --linked --dry-run` قائمة الـ34 ولم يطبّق شيئًا.
- بصمة ملفات الـ34 (sha256 على قائمة البصمات المرتبة): `2d8fb209ebda26c077ba9cc0db4bc10dcb803c57802e2ee37c68d7cf92611330`.
- ملفات الترحيل لم تتغير منذ تمرين `cloud_migration_stepwise` (الشجرة نظيفة، لا تعديل).

## 3) النسخ الاحتياطية

| النسخة | المسار | المحتوى |
|---|---|---|
| ما قبل النافذة (جديدة) | `D:\Backups\aqar-cloud-pre-window-20261101\` | 5 ملفات + `SHA256SUMS.txt` |
| الأساس (محفوظة) | `D:\Backups\aqar-cloud-20261101\` | 5 ملفات + `SHA256SUMS.txt` |
| نسخة العمل | `%TEMP%\aqar-cloud-backup-20261101\` | 5 ملفات |

- `public_schema.sql` و`roles.sql` و`auth_schema.sql`: بصمات **مطابقة** بين النسختين.
- `public_data.sql`: بصمة الملف مختلفة (رأس `\restrict` عشوائي)، لكن **مقارنة تجزئة كل جدول على حدة: 63/63 جدولًا متطابقة** ⇒ لا تغيّر في البيانات.
- **النسخة الجديدة استُعيدت فعليًا** إلى `cloud_prewindow_check`: **0 أخطاء استعادة**، 143 جدولًا، 202 سياسة، **0 انتهاكات FK**، محفز تسجيل موجود، والعدادات: 116 منظمة / 16,996 قيدًا / 75,743 سطرًا / 12,326 دفعة / 1,512 مستخدم.
- السجل: `docs/progress/evidence-r6-run10/results/cloud-prewindow-restore-integrity.txt`.

## 4) قابلية تنفيذ خطة التعافي

- الإجراء مثبت محليًا (استعادة كاملة + تدقيق + محفز Auth + 0 انتهاكات).
- **فجوة تنفيذية:** لا توجد كلمة مرور قاعدة بيانات في هذه الجلسة (`supabase/.temp/pooler-url` بلا كلمة مرور، ولا `PGPASSWORD`/`SUPABASE_DB_PASSWORD`)، و`supabase db push` يتطلب `-p/--password` أو إدخالًا تفاعليًا.
  ⇒ تطبيق الترحيل **واستعادة الإنتاج** يحتاجان كلمة المرور (أو تنفيذ المالك من Dashboard).
- لا يمكن الاعتماد على «Rollback شكلي»: الترحيلات الـ34 غير قابلة للعكس فرديًا إلا F1؛ خطة الفشل = إيقاف فوري + استعادة النسخة الكاملة (مثبتة).

## 5) عدم وجود تغييرات متزامنة

- لا عمليات نشر حديثة: آخر `Deploy to Cloudflare` في **2026-10-08**؛ آخر العمليات SCHEDULED ناجحة فقط.
- وظائف مجدولة قد تكتب بيانات أثناء النافذة: `gate-notifications` كل 5 دقائق، `payment-events` كل 10 دقائق، ‏`lease-rent` صباحًا، `lease-expiry` 03:30، `alert-digest` صباحًا.
- الموقع الحي: `healthcheck.mjs https://aqarbooks.com` → **4/4 نجحت** (200/200/307/307) في وقت الفحص.
- مخطط السحابة: بصمة التفريغ مطابقة (لا DDL جديد)؛ البيانات: لا تغيّر.

## الحكم

| البند | النتيجة |
|---|---|
| تطابق الهوية (Supabase/env/الموقع/الخطة) | **PASS** |
| سجلات الترحيل (60/34) دون تغيير | **PASS** |
| نسخة حديثة + نسخة قديمة محفوظة + استعادة مثبتة | **PASS** |
| خطة التعافي قابلة للتنفيذ سحابيًا | **BLOCKED** — كلمة مرور قاعدة البيانات غير متاحة لهذه الجلسة |
| عدم وجود تغييرات/نشر متزامن | **PASS** |
| متغير GitHub للنشر | **مفقود** (`PRODUCTION_SUPABASE_PROJECT_REF`) — يمنع النشر لا الترحيل |

## 6) تجهيز نافذة التنفيذ — فحوص الاعتماد والتعافي (بلا أي تنفيذ)

### Credential readiness — PASS
- **مصدر آمن محلي:** Windows Credential Manager، الهدف `Supabase CLI:supabase` (رمز وصول). يُقرأ عند الحاجة ولا يُطبع ولا يُخزَّن في المستودع.
- **تحقق الاتصال بصلاحية الترحيل:** `POST /v1/projects/ataslxkcflxuilpgyepm/database/query` أعاد 201 مع `current_user=postgres`، `rolsuper=false`، `has_schema_privilege('public','CREATE')=true`، `has_schema_privilege('supabase_migrations','USAGE')=true`، `has_table_privilege(...schema_migrations,'INSERT')=true`، و`SET session_replication_role=replica` مسموح، وتنفيذ عدة عبارات في طلب واحد مدعوم، وطلب بحجم 500KB نجح.
- **قناة كلمة مرور القاعدة (لمسار `supabase db push`):** جاهزة عبر `%USERPROFILE%\.aqar-secrets\supabase-db-password` (ACL للمالك فقط) أو `SUPABASE_DB_PASSWORD` أو إدخال تفاعلي. تم اختبار القارئ: لا يطبع القيمة، ويعيد `CREDENTIAL_MISSING` عند غيابها. **الملف غير موجود بعد.**
- `db push` يتطلب `-p/--password` ولا توجد كلمة مرور محفوظة ⇒ مسار CLI يحتاج تزويدك المحلي، أو استخدام الاعتماد المتحقق عبر الـAPI.

### Recovery readiness — PASS
- النسخة الجديدة (ما قبل النافذة) استُعيدت محليًا: **0 أخطاء**، 143 جدولًا، 202 سياسة، 0 انتهاكات FK.
- اكتمال Auth: 1,512 مستخدمًا، 1,512 هوية، 3,827 جلسة، ومحفز `trg_on_auth_user_created` موجود.
- قدرات الاستعادة عن بُعد تحققت بالاعتماد الحالي (CREATE/INSERT + replica mode) دون تنفيذ أي تغيير سحابي.
- إجراء الفشل الجزئي: إيقاف فوري، لا Rollback فردي، استعادة كاملة، إعادة محفز التسجيل، ثم تحقق العدادات — موثق في `production-cutover-plan.md` §3.5.

### Migration readiness — PASS
- بصمة ملفات الـ34: `2d8fb209ebda26c077ba9cc0db4bc10dcb803c57802e2ee37c68d7cf92611330` (لم تتغير).
- السجل السحابي: 60 مطبَّقًا / 34 معلّقًا (لم يتغير). شجرة العمل نظيفة.
- تمرين الـ34: 34/34 على نسخة سحابية مطابقة، والبيانات ثابتة.

### Scheduled jobs readiness — PASS
- `Gate notifications` (id `372172167`): state=**active**، لا تشغيل قيد التنفيذ ولا في الانتظار.
- `Payment event retries` (id `366775979`): state=**active**، لا تشغيل قيد التنفيذ ولا في الانتظار.
- الإيقاف/الاستئناف: `gh workflow disable|enable <id>` بعد حفظ الحالة الأصلية. **لم يُنفَّذ أي تغيير.**

### Storage & backups
- مساحة حرة: `C:` 27GB، `D:` 7.8GB (كافية لنسخ النافذة والاستعادة المحلية ~84MB).
- النسختان (الأساس + ما قبل النافذة) اجتازتا `sha256sum -c` بالكامل، والنسخة القديمة محفوظة.

### الحكم
| البند | النتيجة |
|---|---|
| Credential readiness | **PASS** |
| Recovery readiness | **PASS** |
| Migration readiness | **PASS** |
| Scheduled jobs readiness | **PASS** |
| **Overall execution gate** | **READY** — بانتظار الموافقة التنفيذية النهائية |

### حالة التنفيذ (2026-11-01) — BLOCKED قبل أي تغيير

- **العائق:** لا توجد كلمة مرور قاعدة بيانات في القناة المحلية: `%USERPROFILE%\.aqar-secrets\supabase-db-password` غير موجود، و`SUPABASE_DB_PASSWORD`/`PGPASSWORD` غير مضبوطين. `supabase db push` يتطلب `-p/--password` أو إدخالًا تفاعليًا.
- **لم يُنفَّذ:** أي ترحيل، إيقاف أي وظيفة، إنشاء نسخة جديدة، أو أي تعديل سحابي — بما في ذلك عدم استخدام Management API بديلًا.
- **الحالة السحابية عند التوقف:** 60 مطبَّقًا / 34 معلّقًا، بصمة الـ34 `2d8fb209…6f92611330`، الوظيفتان `active`، شجرة العمل نظيفة عند `605573e`.
- **المطلوب للاستئناف:** توفير كلمة المرور في القناة المحلية ثم تصريح تنفيذي جديد.

## 7) نتيجة تنفيذ النافذة — PASS (2026-11-01)

**النطاق الزمني:** 18:00Z نسخة → 18:04Z إيقاف الوظائف → 18:20Z تطبيق الترحيلات → 18:21Z تحقق → 18:27Z استئناف → 18:28Z تحقق تشغيلي.

| الخطوة | النتيجة | الدليل |
|---|---|---|
| Preflight أخير | المرجع `ataslxkcflxuilpgyepm`، 60/34، بصمة `2d8fb209…` | `production-migration-before.txt` |
| نسخة أخيرة | `D:\Backups\aqar-cloud-go-20261101` + `SHA256SUMS.txt`، اجتازت `sha256sum -c` | — |
| استعادة النسخة | `cloud_go_check`: 0 أخطاء، 143 جدولًا، 202 سياسة، 0 انتهاكات FK، محفز تسجيل، أعداد مطابقة | `cloud-go-backup-restore.txt` |
| إيقاف الوظائف | الحالة الأصلية `active`، لا تشغيل نشط، ثم `disabled_manually` | — |
| الترحيلات | `supabase db push --linked --yes`: **34/34، rc=0، بلا أخطاء** | `production-db-push.log` |
| السجل | **94 مطبَّقًا / 0 معلّق** | `production-migration-after.txt` |
| المخطط | 145 جدولًا، 629 دالة، 204 سياسات، 1,148 قيدًا، RLS على 145 جدولًا | نفسه |
| القيود | 0 FK غير `validated` / **0 انتهاكات FK** | نفسه |
| البيانات | 116 منظمة / 16,996 قيدًا / 75,743 سطرًا / 12,326 دفعة / 23,232 تخصيصًا — **بلا تغيير** | نفسه |
| Auth | 1,512 مستخدمًا / 1,512 هوية / 3,827 جلسة + `trg_on_auth_user_created` | نفسه |
| الوظائف المحاسبية | `close_fiscal_year`, `apply_payment_credit`, `assert_open_fiscal_period_for_date`, `reverse_journal_entry` موجودة؛ سياسة على `fiscal_year_closings` | نفسه |
| Healthcheck | 4/4 نجحت (200/200/307/307) | تشغيلان قبل/بعد |
| الوظائف المجدولة | أُعيدتا `active`، وتشغيل يدوي لكل منهما نجح (Gate 12s، Payment 10s) | GitHub Actions |

**لم يُنفَّذ:** تغيير Auth/SMTP/الأسرار، حذف بيانات، نشر Cloudflare، `push`، أو أي معاملة مالية.

## 8) Auth hardening — منفذ ومتحقق (2026-11-01)

| الإعداد | قبل | بعد |
|---|---|---|
| `disable_signup` | false | **true** |
| `password_min_length` | 6 | **8** |
| `rate_limit_email_sent` | 2/ساعة | **30/ساعة** (SMTP مخصص؛ الخطة free) |
| `mailer_autoconfirm` | true | true (بلا تغيير) |

**الأدلة:**
- `/auth/v1/settings` → `disable_signup=true`.
- محاولة تسجيل مباشر عبر `/auth/v1/signup` → **422 `signup_disabled`**، وعدد المستخدمين بقي **1512** (0 حساب أُنشئ).
- مسار الدخول: فحص ببيانات خاطئة → 400 `invalid_credentials` (الخدمة سليمة)، ودخول حساب Smoke عبر `/auth/v1/token` → **200 مع رمز**.
- إنشاء مستخدم عبر Admin API بعد التعطيل → **200** (مسار التجهيز الإداري يعمل).
- `/auth/v1/recover` → 200 (بدون إرسال لعنوان غير موجود).
- حساب Smoke: `smoke-verify@aqarbooks.com`، بلا أي دور (0 user_role_assignments)، بياناته في `~/.aqar-secrets/smoke-credentials.env` (ACL للمالك).
- **SMTP:** لم يُختبر الإرسال (لا يوجد عنوان معتمد). القيمة المخزنة لا تُقبل كمفتاح Resend عند فحصها، لذا التسليم غير متحقق.

## 9) نسخ مجدولة ومشفرة خارج الجهاز

- مهمة `AqarBooks Cloud Backup` يوميًا 03:30 (تفاعلية: تتطلب جلسة Windows مفتوحة).
- بعد كل نسخة: `cloud-backup-offsite.sh` يُنشئ أرشيفًا مشفرًا (AES-256/PBKDF2) في `~/OneDrive/AqarBooks-Backups`، يتحقق من فكّه ومطابقة البصمات، ويحتفظ بآخر 7.
- نُفّذ الآن: `backup-20261101T183554Z.tar.gz.enc` (11MB) وفكّه طابق `SHA256SUMS.txt`.
- مفتاح التشفير في `~/.aqar-secrets/backup-passphrase` (ACL للمالك) — فقدانه يعني فقدان الأرشيفات.
