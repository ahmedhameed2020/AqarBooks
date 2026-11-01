# دليل منح صلاحية إقفال السنة المالية لمالكي المنظمات الحاليين

الصلاحية: `finance.years.close`
الهدف: منحها لدور `TENANT_OWNER` داخل منظمة قائمة، بدون تشغيل أي أمر تلقائي.

## 0. الحالة والنطاق

- هذا الدليل **للتنفيذ اليدوي من مشغّل منصة فقط**. لا توجد دالة SQL تمنح الصلاحية تلقائياً، ولا دالة منح مخصصة (قرار: انظر القسم 8).
- الصلاحية مرتبطة بقالب الدور `TENANT_OWNER` فقط (`supabase/migrations/20261019100200_fiscal_year_close_permission_and_reports.sql:26-36`). لا تُمنح لـ `FINANCE_MANAGER` ولا لأي قالب آخر.
- المنظمات الجديدة التي تُنشأ **بعد** تطبيق الهجرة تحصل على الصلاحية تلقائياً عبر `clone_tenant_role_templates` (`supabase/migrations/20260821105505_baseline.sql:1684`). هذا متوقع بحسب التصميم، ولا ينطبق عليه هذا الدليل.
- لا يُنفَّذ أي خطوة من هذا الدليل قبل موافقة مالك المنتج على المنظمة والمستخدم بالاسم.

## 1. المتطلبات المسبقة

1. تطبيق الهجرات بالترتيب: `20261019100000` (الجوهر) ثم `20261019100100` (الحراسة) ثم `20261019100200` (الصلاحية).
2. التأكد من أن دالة `close_fiscal_year` تتحقق من العضوية (انظر القسم 7، البند 1).
3. تسجيل رقم التذكرة أو طلب الموافقة قبل البدء.

## 2. تأكيد المنظمة

```sql
select id, name, status
from public.organizations
where id = '<ORGANIZATION_ID>';
```

المتوقع: صف واحد، والحالة نشطة. إذا لم يُرجع صفاً أو كانت الحالة غير نشطة، توقف.

## 3. تأكيد دور المالك في المنظمة

```sql
select r.id as role_id, r.key, r.organization_id, r.is_system
from public.roles r
where r.organization_id = '<ORGANIZATION_ID>'
  and r.key = 'TENANT_OWNER';
```

المتوقع: صف واحد بـ `is_system = false`. إذا وُجد أكثر من صف أو لم يوجد صف، توقف وأبلغ المالك.

## 4. تأكيد أن المستخدم عضو نشط ويحمل TENANT_OWNER في هذه المنظمة

```sql
select om.user_id, om.status as membership_status, r.id as role_id, r.key as role_key
from public.organization_memberships om
join public.user_role_assignments ura
  on ura.user_id = om.user_id
 and ura.organization_id = om.organization_id
join public.roles r
  on r.id = ura.role_id
where om.organization_id = '<ORGANIZATION_ID>'
  and om.user_id = '<OWNER_USER_ID>'
  and om.status = 'active'
  and r.key = 'TENANT_OWNER'
  and r.organization_id = '<ORGANIZATION_ID>';
```

المتوقع: صف واحد بالضبط. أي نتيجة أخرى تعني أن المستخدم ليس مالكاً نشطاً لهذه المنظمة، فتوقف.

## 5. التحقق من الحالة قبل التغيير

```sql
-- المعرّف الداخلي للصلاحية وقالب الدور
select p.id as permission_id,
       exists (select 1 from public.role_template_permissions rtp
               where rtp.role_template_key = 'TENANT_OWNER'
                 and rtp.permission_key = 'finance.years.close') as template_ok
from public.permissions p
where p.key = 'finance.years.close';

-- الصلاحيات الحالية لدور المالك (هذه هي قائمة الرجوع)
select coalesce(array_agg(rp.permission_id order by rp.permission_id), '{}') as before_permission_ids
from public.role_permissions rp
where rp.role_id = '<ROLE_ID>';
```

- إذا كان `template_ok = false`، توقف: الهجرة لم تُطبَّق بشكل صحيح.
- إذا كانت `finance.years.close` موجودة بالفعل في `before_permission_ids`، توقف: لا تغيير مطلوب (الخطوة idempotent).
- **احفظ `before_permission_ids` كما هي في سجل التغيير.** هي قائمة الرجوع.

## 6. تطبيق المنح عبر الآلية الموجودة

تستخدم الدالة `replace_role_permissions_atomic(p_organization_id, p_role_id, p_permission_ids, p_actor_user_id)`
(`supabase/migrations/20261009130000_phase1_1_membership_roles_audit.sql:21-30`). هذه الدالة:

- تستبدل **كل** صلاحيات الدور بالقائمة المرسلة، لذلك يجب إرسال القائمة القديمة **مضافاً إليها** الصلاحية الجديدة؛
- تتحقق داخل المعاملة من أن المنفِّذ عضو نشط، ويحمل `tenant.roles.manage` عبر دوره، ومن أن الدور ليس دوراً نظامياً؛
- تسمح بتعديل دور `TENANT_OWNER` فقط إذا كان المنفِّذ مالكاً.

نفّذ داخل معاملة واحدة، وضع `<OWNER_USER_ID>` كمنفِّذ (`p_actor_user_id`):

```sql
begin;

select public.replace_role_permissions_atomic(
  '<ORGANIZATION_ID>'::uuid,
  '<ROLE_ID>'::uuid,
  (
    select coalesce(array_agg(rp.permission_id), '{}'::uuid[])
    from public.role_permissions rp
    where rp.role_id = '<ROLE_ID>'
  ) || (select id from public.permissions where key = 'finance.years.close'),
  '<OWNER_USER_ID>'::uuid
);

-- تحقق قبل الإيداع: يجب أن تكون النتيجة true
select public.has_permission('<OWNER_USER_ID>'::uuid, '<ORGANIZATION_ID>'::uuid, 'finance.years.close') as granted;

commit;
```

- إذا أعادت الدالة خطأ (`UNAUTHORIZED`، `FORBIDDEN`، `CANNOT_MODIFY_SYSTEM_ROLE`، `INVALID_PERMISSION_SCOPE`)، فاعمل `rollback;` ولا تتجاوز الدالة بإدراج مباشر في `role_permissions`. أبلغ المالك بالخطأ.
- إذا لم تكن `granted = true`، فاعمل `rollback;`.

## 7. تسجيل التغيير في سجل التدقيق

لا توجد قيمة في قائمة `financial_audit_logs` (`check_audit_action`) تصف منح صلاحية دور، ولا يُضاف قيد جديد هنا. لذلك يُسجَّل التغيير في `platform_audit_logs` (وهو جدول تدقيق المنصة، وسياسة الإدراج فيه للمشرف على المنصة فقط: `platform_audit_logs_insert_admin`، `supabase/migrations/20260821105505_baseline.sql:17364`):

```sql
insert into public.platform_audit_logs
  (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary, correlation_id)
values
  ('<OPERATOR_USER_ID>', '<ORGANIZATION_ID>', 'ORG_ROLE_PERMISSION_GRANTED', 'role', '<ROLE_ID>',
   'Grant finance.years.close to TENANT_OWNER (ticket: <TICKET_ID>)',
   jsonb_build_object(
     'permission_key', 'finance.years.close',
     'owner_user_id', '<OWNER_USER_ID>',
     'before_permission_ids', '<before_permission_ids من القسم 5>'::jsonb,
     'after_permission_ids', '<القائمة المرسلة في القسم 6>'::jsonb),
   gen_random_uuid());
```

ملاحظات:
- `reason` يجب ألا يحتوي على بيانات شخصية؛ استخدم رقم التذكرة فقط.
- إذا تعذر الإدراج في `platform_audit_logs` فلا تعتبر التغيير مكتملاً؛ أبلغ المالك قبل المتابعة.

## 8. تأكيد ما بعد التنفيذ

```sql
select public.has_permission('<OWNER_USER_ID>'::uuid, '<ORGANIZATION_ID>'::uuid, 'finance.years.close');
select count(*) from public.role_template_permissions
where permission_key = 'finance.years.close';  -- المتوقع: 1 (TENANT_OWNER فقط)
```

## 9. خطة الرجوع (Rollback)

استخدم القائمة المحفوظة `before_permission_ids` من القسم 5 بالآلية نفسها:

```sql
begin;
select public.replace_role_permissions_atomic(
  '<ORGANIZATION_ID>'::uuid,
  '<ROLE_ID>'::uuid,
  '<before_permission_ids>'::uuid[],
  '<OWNER_USER_ID>'::uuid);
commit;
```

ثم سجّل الرجوع في `platform_audit_logs` بالإجراء `ORG_ROLE_PERMISSION_REVERTED` وبنفس الحقول. ملاحظة: إذا كانت الصلاحية منحت للمالك ثم أُغلقت سنة، فالإغلاق نفسه لا يُرجَع بهذا الدليل (الإغلاق لا يُعكس، انظر الهجرة الجوهرية).

## 10. قواعد إلزامية

- منظمة واحدة في كل مرة، وبعد موافقة مكتوبة من مالك المنتج.
- لا تستخدم حساب مشرف منصة ليس عضواً في المنظمة كمنفِّذ (`p_actor_user_id`)، فالدالة سترفض ذلك، والمطلوب أن يكون المنفِّذ المالك نفسه.
- لا تُنفِّذ `insert` مباشراً على `role_permissions` إلا بموافقة مالك المنتج وبعد فشل الآلية المعتمدة.
- لا تضف الصلاحية لأي دور غير `TENANT_OWNER`.

## 11. القرارات المفتوحة لمالك المنتج

1. هل يُضاف إجراء مخصص (مثلاً `ROLE_PERMISSION_GRANTED`) إلى قائمة `check_audit_action` في `financial_audit_logs`؟ حالياً التسجيل في `platform_audit_logs` فقط.
2. هل تُضاف دالة `grant_finance_years_close` محصورة بمشرف المنصة؟ لم تُضف لأن الآلية المعتمدة تحقق الشروط نفسها، وإضافتها توسّع سطح الصلاحيات.
