# Owner portal activation — rollout runbook

الترتيب إجباري: **قاعدة البيانات ← الويب ← الموبايل**. التطبيق الجديد ينادي `my_portal_access()` بعد كل تسجيل دخول
ويرفض المتابعة لو فشل النداء، فنشره قبل الـmigration يعطّل الدخول للجميع (موظفين وملاك).

لا شيء هنا يُنفَّذ تلقائيًا. كل خطوة يقرّر صاحب المشروع تنفيذها.

## 0) قبل البدء
- خذ نسخة احتياطية / تأكد من PITR للمشروع `ataslxkcflxuilpgyepm`.
- نفّذ في وقت هادئ: سكربت التحقق يضع `lock_timeout = 3s` ويفشل بسرعة لو كان هناك تعارض أقفال.
- تأكد أن الفرع نظيف: `git status` و`git log -1` (آخر commit للميزة: `c626385`).

## 1) التحقق بدون أي تغيير (معاملة تتراجع دائمًا)
```bash
node scripts/hosted-verify/build.mjs > owner-portal-access.hosted-verify.sql
```
الصق الملف في Supabase **SQL Editor** (أو `psql`) على المشروع المستضاف.
- النجاح = **خطأ** رسالته تبدأ بـ `VERIFICATION_ROLLED_BACK` وفيها `"failed": 0` (26 فحصًا).
- أي خطأ آخر يعني فشل فحص أو تعارض أقفال؛ لا يبقى شيء في القاعدة في الحالتين. أرسل لي النص.
- بعد التشغيل تأكد: `select to_regclass('public.member_portal_access');` يرجع `null`.

## 2) تطبيق الـmigration (مرة واحدة، يدويًا)
الملف: `supabase/migrations/20261004120000_owner_portal_access.sql` (48776 بايت، SHA-256 مثبّت في
`tests/migration-directory-guard.test.ts`).
- اتّبع طريقة المشروع في الـmigrations السابقة: التطبيق عبر `apply_migration` بحيث يطابق الإصدار صفّ
  `supabase_migrations.schema_migrations`. لا تستخدم `supabase db push` دون قرار صريح (راجع `supabase/migrations/README.md`).
- بعد التطبيق شغّل:
```sql
select p.proname, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') as anon_exec
from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('request_member_activation','mint_member_activation_token','mark_member_activation_delivery',
    'begin_member_signout','log_member_portal_event','inspect_member_activation','complete_member_activation',
    'my_portal_access','complete_portal_first_login','current_member_id');
-- المتوقع: prosecdef = true للكل، anon_exec = false للكل
select relname, relrowsecurity from pg_class where relname in ('member_portal_access','member_activation_tokens');
-- المتوقع: relrowsecurity = true للاثنين
```

## 3) Security Advisor
Dashboard ← Advisors ← Security (أو `get_advisors`). التنبيهات المتوقعة لهذه الميزة تحديدًا (توقّع، لم تُشغَّل بعد):
- INFO «RLS enabled, no policy» على `member_portal_access` و`member_activation_tokens`: مقصود، لا يصل إليهما أي عميل.
- WARN «SECURITY DEFINER function executable by authenticated» على دوال الموظفين: مقصود، كل دالة تتحقق من
  `has_permission` داخليًا.
- أي تنبيه آخر جديد = يوقف الإطلاق حتى يُفهم.

## 4) تجربة إبطال الجلسات (مرة واحدة، بحساب اختبار)
الآلية تعتمد على الـAuth Admin API (`generateLink` + `verifyOtp` + `admin.signOut(jwt,'global')`) ولم تُجرَّب على Auth حقيقي.
1. من صفحة عضو اختبار (له وحدة): «إصدار بيانات دخول مؤقتة» ← سجّل الدخول من جهازين/متصفحين وغيّر كلمة المرور.
2. من الكارت: «تسجيل خروج من جميع الأجهزة» ← يجب ظهور «سُجّل خروج المالك…».
3. في الجهازين: تحديث الجلسة (أو فتح صفحة) يجب أن يفشل ويطلب الدخول من جديد.
4. تحقق أن `platform_audit_logs` فيه `member_portal.sessions_revoked` بدون كلمات مرور.
5. كرّر مع هوية موظف+مالك: «إيقاف الوصول» لا يُخرج الموظف من العمل ولا يحظر حسابه.
لو فشل (3): لا تُطلق؛ المسار البديل المقبول هو الحظر المؤقت عبر `ban_duration` مع قبول مهلة صلاحية access token.

## 5) إعدادات الويب (Cloudflare / البيئة)
| المتغير | القيمة |
|---|---|
| `RESEND_API_KEY`, `RESEND_FROM` | مفتاح Resend وعنوان المرسِل المعتمد (بدونهما: «لم يتم إرسال البريد» + بديل رقم العميل) |
| `NEXT_PUBLIC_SITE_URL` | `https://aqarbooks.com` (يُبنى منه رابط التفعيل) |
| `ANDROID_APP_SHA256_FINGERPRINTS` | بصمات SHA-256 لشهادات التوقيع (upload + Play signing) مفصولة بفواصل |
| `ANDROID_APP_ID` | اختياري (`com.aqarbooks.aqarbooks_mobile`) |
| `IOS_TEAM_ID`, `IOS_BUNDLE_ID` | عند دعم iOS (الحالي: `com.aqarbooks.aqarbooksMobile`) |
بعد النشر:
```bash
curl -s https://aqarbooks.com/.well-known/assetlinks.json
curl -s https://aqarbooks.com/.well-known/apple-app-site-association
curl -s -X POST https://aqarbooks.com/api/portal-activation/inspect -H 'content-type: application/json' -d '{"token":"x"}'
# المتوقع للأخير: {"state":"not_found"}
```
أرسل بريد تفعيل حقيقيًا لعضو اختبار بريده يخصك، وتأكد أن الحالة «أُرسلت رسالة التفعيل…» وأن الرابط يفتح صفحة `/activate/...`.

## 6) نشر الويب ثم الموبايل
1. نشر الويب بالطريقة المعتادة (`npm run deploy` يمر على `predeploy` guard).
2. ابنِ التطبيق بـ `AQAR_WEB_BASE=https://aqarbooks.com` الافتراضي، ووقّعه بنفس الشهادة المسجّلة بصماتها أعلاه.
3. اختبار أجهزة (لم يُجرَّب على أي جهاز بعد):
   - أندرويد: فتح رابط تفعيل والتطبيق مثبّت يفتح شاشة التفعيل؛ غير مثبّت يفتح صفحة الويب.
   - دخول بالبريد وبرقم العميل؛ إجبار تغيير كلمة المرور؛ عدم تخطيها بزر الرجوع أو إعادة تشغيل التطبيق.
   - البصمة: تفعيل من أول دخول، ثم إعادة فتح التطبيق تطلبها.
   - ماسح كاميرا البوابة (من قبل هذه الميزة ولم يُجرَّب على جهاز).
   - موظف+مالك: «حسابي كمالك / عضو» ثم «العودة إلى وضع العمل»، وإيقاف جانب المالك لا يمس العمل.

## 7) التراجع
- الجداول الجديدة لا يقرؤها كود قديم، فالتراجع الآمن هو إرجاع `current_member_id()` لتعريفه الأصلي:
```sql
create or replace function public.current_member_id() returns uuid
language sql stable security definer set search_path to 'public' as $$
  select id from public.members where user_id = auth.uid();
$$;
```
  (يلغي إغلاق الإيقاف/تغيير كلمة المرور على مستوى RLS، فاستخدمه فقط لو تسبب في عطل.)
- بدون ذلك، أوقف نشر الموبايل واترك الـmigration؛ هي لا تكسر التطبيقات القديمة.
- لو أُطلق التطبيق بالخطأ قبل الـmigration: طبّق الـmigration فورًا، فالدخول يعود دون تحديث للتطبيق.

## 8) ما يبقى مفتوحًا بعد الإطلاق
- المستندات مؤجلة: سياسة `member_documents_select_member` تسمح لأي عضو في المنظمة بقراءة كل صفوف مستندات الأعضاء.
- لا rate limiting على `/api/portal-activation/*` (الـtoken عشوائي بقوة 256 بت، ويُنصح بإضافة حد عند Cloudflare).
- حسابات رقم العميل لا تدخل بوابة الويب (دخولها بكود البريد)؛ دخولها من التطبيق.
