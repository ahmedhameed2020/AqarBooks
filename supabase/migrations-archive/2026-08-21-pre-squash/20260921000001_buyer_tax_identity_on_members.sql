-- هوية المشتري — الشرط الذي يسبق إصدار أي فاتورة خاضعة.
--
-- ═══ اكتشاف سبق البناء وغيّره ═══
--
-- `dues` **لا يحمل مشتريًا إطلاقًا**: يرتبط بوحدة لا بعضو. فإضافة حقول الهوية
-- إلى `members` ضرورية وغير كافية — كان لا بد أولًا من الإجابة على «مَن المشتري
-- في هذا المستحق؟»، ولم يكن لها جواب في النظام.
--
-- والأرقام وقت البناء: **420 من 850 مستحقًا لا يملك مالكًا** على وحدته، فلا
-- مشتري له أصلًا. والملكية قد تتعدد بحصص، فحتى وجود مالك لا يعني تحديدًا.
--
-- ═══ الاشتقاق، وحدوده ═══
--
--   إيجار مولَّد من عقد  →  المستأجر، إن كان العقد يفوتره عليه
--   ما عداه              →  الملكية السارية بتاريخ الإصدار
--   مالك واحد            →  محسوم
--   عدة مُلّاك             →  جهة الاتصال الأساسية وحدها تحسم
--   لا مالك أو لا أساسية →  **التباس معلن** لا اختيار اعتباطي
--
-- اختيار أحد المُلّاك عشوائيًا يُنتج فاتورة باسم شخص لا يدين بها؛ والالتباس
-- المعلن يوقف الإصدار ويقول للمشغّل ما يصلحه.
--
-- ═══ الخصوصية ═══
--
-- يُخزَّن **رقم** الهوية عند لزومه للحد المالي، ولا تُخزَّن صور مستندات، ولا
-- يُطلب الرقم لمجرد إمكانية طلبه. والتحقق الخارجي **ليس شرطًا** هنا: لم تُصمَّم
-- بعد سياسة صلاحية النتيجة ولا الفشل المؤقت، فتُخزَّن النتيجة ومصدرها ومرجعها
-- فقط، ويبقى المسار اليدوي هو الحاكم.

alter table public.members
  add column if not exists customer_type text not null default 'UNRESOLVED'
    check (customer_type in ('B2B', 'B2C', 'UNRESOLVED')),
  add column if not exists tax_registration_number text,
  add column if not exists identity_document_type text
    check (identity_document_type is null or identity_document_type in ('NATIONAL_ID', 'PASSPORT')),
  add column if not exists identity_document_number text,
  add column if not exists legal_name text,
  add column if not exists country_code text,
  add column if not exists billing_address text,
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_verification_source text,
  add column if not exists identity_verification_reference text;

comment on column public.members.customer_type is
  'تصنيف المشتري صراحةً. لا يُستنتج من is_company ولا من الاسم — والافتراضي UNRESOLVED لأن «لا نعرف» حالة حقيقية لا فراغ.';
comment on column public.members.identity_document_number is
  'رقم قومي أو جواز عند لزومه للحد المالي. لا تُحفظ صور المستندات، ولا يُطلب الرقم لمجرد إمكانية طلبه.';
comment on column public.members.identity_verified_at is
  'نتيجة تحقق مخزَّنة بمصدرها ومرجعها. لا يُشترط تحقق خارجي بعد — لم تُصمَّم بعد سياسة الصلاحية والفشل المؤقت.';

create index if not exists idx_members_customer_type
  on public.members (organization_id, customer_type);

-- تغيير هوية المشتري لا يمس القرارات المختومة — فهي غير قابلة للتعديل بحكم
-- التصميم — لكنه يغيّر معالجة ما يأتي بعده، فيُسجَّل بما قبله وما بعده.
create or replace function public.trg_members_tax_identity_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), NEW.organization_id, 'member_tax_identity.changed', 'member', NEW.id,
    jsonb_build_object(
      'customer_type_from', OLD.customer_type, 'customer_type_to', NEW.customer_type,
      'tax_registration_from', OLD.tax_registration_number,
      'tax_registration_to', NEW.tax_registration_number,
      'identity_document_type_from', OLD.identity_document_type,
      'identity_document_type_to', NEW.identity_document_type,
      'verified_at_from', OLD.identity_verified_at,
      'verified_at_to', NEW.identity_verified_at
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_members_tax_identity_changed on public.members;
create trigger trg_members_tax_identity_changed
  after update on public.members
  for each row
  when (
    OLD.customer_type is distinct from NEW.customer_type
    or OLD.tax_registration_number is distinct from NEW.tax_registration_number
    or OLD.identity_document_type is distinct from NEW.identity_document_type
    or OLD.identity_document_number is distinct from NEW.identity_document_number
    or OLD.identity_verified_at is distinct from NEW.identity_verified_at
  )
  execute function public.trg_members_tax_identity_changed();

create or replace function public.set_member_tax_identity(
  p_member_id uuid,
  p_customer_type text,
  p_tax_registration_number text default null,
  p_identity_document_type text default null,
  p_identity_document_number text default null,
  p_legal_name text default null,
  p_country_code text default null,
  p_billing_address text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.members where id = p_member_id;
  if v_org is null then
    raise exception 'MEMBER_NOT_FOUND: العضو غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'property.members.manage') then
    raise exception 'FORBIDDEN_MEMBER_MANAGE: غير مصرح لك بتعديل بيانات الأعضاء'
      using errcode = '42501';
  end if;

  if p_customer_type not in ('B2B', 'B2C', 'UNRESOLVED') then
    raise exception 'BUYER_TYPE_INVALID: تصنيف المشتري إما B2B أو B2C أو UNRESOLVED'
      using errcode = '22023';
  end if;

  -- الرفض عند المصدر أوضح من قبول تصنيف ناقص ثم رفض كل فاتورة تُبنى عليه.
  if p_customer_type = 'B2B'
     and nullif(btrim(coalesce(p_tax_registration_number, '')), '') is null then
    raise exception
      'BUYER_TAX_ID_MISSING: تصنيف المشتري منشأة يستلزم رقم تسجيل ضريبي'
      using errcode = '22023';
  end if;

  update public.members
  set customer_type = p_customer_type,
      tax_registration_number = nullif(btrim(coalesce(p_tax_registration_number, '')), ''),
      identity_document_type = p_identity_document_type,
      identity_document_number = nullif(btrim(coalesce(p_identity_document_number, '')), ''),
      legal_name = nullif(btrim(coalesce(p_legal_name, '')), ''),
      country_code = nullif(btrim(coalesce(p_country_code, '')), ''),
      billing_address = nullif(btrim(coalesce(p_billing_address, '')), ''),
      updated_at = now()
  where id = p_member_id;
end;
$$;

create or replace function public.resolve_due_buyer(p_due_id uuid)
returns table (member_id uuid, resolved_via text, ambiguity text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_due record;
  v_lease_member uuid;
  v_owner_count integer;
  v_owner uuid;
begin
  select d.id, d.unit_id, d.issue_date, d.source_type, d.source_id, d.organization_id
  into v_due
  from public.dues d where d.id = p_due_id;

  if v_due.id is null then
    return;
  end if;

  if v_due.source_type = 'LEASE_RENT' and v_due.source_id is not null then
    select case when l.billing_recipient = 'TENANT' then l.tenant_member_id else null end
    into v_lease_member
    from public.unit_leases l where l.id = v_due.source_id;

    if v_lease_member is not null then
      member_id := v_lease_member; resolved_via := 'LEASE_TENANT'; ambiguity := null;
      return next; return;
    end if;
  end if;

  select count(*) into v_owner_count
  from public.unit_ownerships o
  where o.unit_id = v_due.unit_id
    and o.start_date <= v_due.issue_date
    and (o.end_date is null or o.end_date >= v_due.issue_date);

  if v_owner_count = 0 then
    member_id := null; resolved_via := null; ambiguity := 'NO_OWNER';
    return next; return;
  end if;

  if v_owner_count = 1 then
    select o.member_id into v_owner
    from public.unit_ownerships o
    where o.unit_id = v_due.unit_id
      and o.start_date <= v_due.issue_date
      and (o.end_date is null or o.end_date >= v_due.issue_date)
    limit 1;
    member_id := v_owner; resolved_via := 'SOLE_OWNER'; ambiguity := null;
    return next; return;
  end if;

  select o.member_id into v_owner
  from public.unit_ownerships o
  where o.unit_id = v_due.unit_id
    and o.is_primary_contact
    and o.start_date <= v_due.issue_date
    and (o.end_date is null or o.end_date >= v_due.issue_date)
  limit 1;

  if v_owner is not null then
    member_id := v_owner; resolved_via := 'PRIMARY_CONTACT_OWNER'; ambiguity := null;
  else
    member_id := null; resolved_via := null; ambiguity := 'MULTIPLE_OWNERS_NO_PRIMARY';
  end if;
  return next;
end;
$$;
