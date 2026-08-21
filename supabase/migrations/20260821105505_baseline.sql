-- =====================================================================
-- AqarBooks baseline migration
-- version 20260821105505
--
-- GENERATED. Do not edit by hand.
--
-- Derived deterministically from the five frozen evidence files under
-- supabase/baseline/, which passed the Step 5 reproduction gate on
-- 2026-08-21 across sixteen comparison classes. Those files are NOT
-- modified by this generation; they remain byte-identical and still hash
-- to the values recorded in supabase/baseline/MANIFEST.md.
--
-- Regenerate with scripts/generate-baseline-migration (deterministic:
-- identical inputs produce byte-identical output). If this file and the
-- five sources ever disagree, the sources are authoritative.
--
-- SECTION ORDER IS LOAD-BEARING.
-- The preamble must execute before any object is created: it fixes the
-- default privileges so that no function is born already granted to anon.
-- Emitting the schema first would recreate the exact defect that failed
-- the Step 5 gate on its first run -- anon executable on 203/203 functions.
--
-- Sources, in application order:
--   0. baseline_00_security_preamble.sql
--      sha256 c4dd9b3830027d9d14ff425a0efe140cb1c9fbf39bbb6b5cd4eaef34b1ae6ba0
--      Security preamble -- MUST run before any object exists
--   1. baseline_schema.sql
--      sha256 7e8d8b457ff77ca344e99d8ff96b260cbc37b87e1386ea233c8f77dedeb068fc
--      Schema body (pg_dump of the public schema)
--   2. baseline_auth_objects.sql
--      sha256 2bae9922168a07360a45b868243d8f571060d8d2975f98dd386dfddf139d4b82
--      Auth companion -- the trigger pg_dump omits
--   3. baseline_03_security_postamble.sql
--      sha256 52d23cbbc8ca267bff6fdba03d6446e4a6ec3930e0d6b7a729df63dd9ab8de43
--      Security postamble -- restates removals, then asserts
--   4. baseline_04_reference_data.sql
--      sha256 255fa05a5458e833dbfec5c0dfe933233f6232227fc325d2cf0e1f24518c0325
--      Reference data seed
-- =====================================================================

-- ---------------------------------------------------------------------
-- SECTION 0 of 4: baseline_00_security_preamble.sql
-- sha256 c4dd9b3830027d9d14ff425a0efe140cb1c9fbf39bbb6b5cd4eaef34b1ae6ba0
-- Security preamble -- MUST run before any object exists
-- ---------------------------------------------------------------------

-- Baseline file 0 of 5 — SECURITY PREAMBLE
--
-- MUST BE APPLIED BEFORE ANY OBJECT IS CREATED. Order is the entire point of
-- this file; running it later makes it a no-op with respect to objects that
-- already exist.
--
-- WHY THIS FILE EXISTS
-- The Step 5 gate failed because a database rebuilt from the schema dump alone
-- had `anon` able to EXECUTE all 203 application functions, where production
-- allows it zero. The dump was not at fault: it faithfully emits
--   REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--   GRANT  ALL ON FUNCTION ... TO "authenticated";   -- never to anon
-- and it even carries the correct ALTER DEFAULT PRIVILEGES. The problem is
-- that those statements sit at the END of the dump (line ~20913) while objects
-- are created from line 55. So every function is born carrying the platform's
-- default ACL — which grants anon — and nothing afterwards takes it away:
-- REVOKE ... FROM PUBLIC does not touch a role-specific grant, and omitting a
-- GRANT does not remove one that already exists.
--
-- Correcting the default privileges FIRST means the objects are never granted
-- to anon at all, and the dump's own GRANT statements then produce exactly the
-- intended access. That replaces what would otherwise be 203 explicit REVOKEs
-- with the two statements below.
--
-- WHY REVOKE AND NOT MERELY "OMIT THE GRANT"
-- pg_dump can only express privileges that exist. Production's state was
-- produced by an explicit revocation (migration 20260820190630), and a removed
-- privilege leaves no artefact to serialise. It must therefore be re-stated
-- here as an action, not inferred from an absence.
--
-- TARGET STATE — read from production pg_default_acl (defaclrole = postgres):
--   S  {postgres=rwU, anon=rwU, authenticated=rwU, service_role=rwU}
--   f  {postgres=X,             authenticated=X,   service_role=X}   <- no anon
--   r  {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
--
-- Only `f` deviates from the platform default, and only for anon.

-- Phase 1 hardening (migration 20260820190630): functions created in this
-- schema must not be executable by anon by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- The same migration also revoked from PUBLIC. Restated for the same reason:
-- it is a removal, so the dump cannot carry it.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Verify the preamble actually took effect before anything is built on top of
-- it. If the default ACL still admits anon, every function created afterwards
-- inherits the defect, and the failure would surface only at the gate — or,
-- worse, not at all.
DO $$
DECLARE
  v_acl text;
BEGIN
  SELECT d.defaclacl::text INTO v_acl
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'
    AND d.defaclobjtype = 'f'
    AND pg_get_userbyid(d.defaclrole) = 'postgres';

  IF v_acl IS NOT NULL AND v_acl LIKE '%anon=%' THEN
    RAISE EXCEPTION
      'PREAMBLE_FAILED: default privileges on FUNCTIONS still grant anon (%). Objects created now would inherit it.', v_acl;
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- SECTION 1 of 4: baseline_schema.sql
-- sha256 7e8d8b457ff77ca344e99d8ff96b260cbc37b87e1386ea233c8f77dedeb068fc
-- Schema body (pg_dump of the public schema)
-- ---------------------------------------------------------------------




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_member_invitation"("p_invitation_id" "uuid", "p_token" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_invitation public.member_invitations;
  v_session_email text;
  v_member public.members;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: يجب تسجيل الدخول عبر رابط الدعوة أولاً' using errcode = '42501';
  end if;

  select * into v_invitation from public.member_invitations where id = p_invitation_id for update;
  if v_invitation.id is null then
    raise exception 'INVITATION_NOT_FOUND: رابط الدعوة غير صالح' using errcode = '22023';
  end if;

  select * into v_member from public.members where id = v_invitation.member_id for update;

  -- Already accepted by this same now-authenticated user: idempotent no-op.
  if v_invitation.status = 'accepted' and v_member.user_id = auth.uid() then
    return v_member.id;
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING: رابط الدعوة لم يعد صالحًا (تم استخدامه أو إلغاؤه)' using errcode = '22023';
  end if;

  if v_invitation.expires_at < now() then
    update public.member_invitations set status = 'expired' where id = p_invitation_id;
    raise exception 'INVITATION_EXPIRED: انتهت صلاحية رابط الدعوة، يرجى طلب دعوة جديدة' using errcode = '22023';
  end if;

  if encode(digest(p_token::text, 'sha256'), 'hex') <> v_invitation.token_hash then
    raise exception 'INVITATION_TOKEN_INVALID: رابط الدعوة غير صحيح' using errcode = '22023';
  end if;

  v_session_email := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  if v_session_email = '' or v_session_email <> v_invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: البريد الإلكتروني لهذا الحساب لا يطابق بريد الدعوة' using errcode = '42501';
  end if;

  if v_member.id is null then
    raise exception 'MEMBER_NOT_FOUND: العضو غير موجود' using errcode = '22023';
  end if;

  if v_member.user_id is not null then
    raise exception 'MEMBER_ALREADY_LINKED: تم ربط هذا العضو بحساب آخر بالفعل' using errcode = '22023';
  end if;

  update public.members set user_id = auth.uid() where id = v_member.id;
  update public.member_invitations
  set status = 'accepted', accepted_at = now(), accepted_user_id = auth.uid()
  where id = p_invitation_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_member.organization_id, 'member_portal.invitation_accepted', 'member', v_member.id,
    jsonb_build_object('invitation_id', p_invitation_id));

  return v_member.id;
end;
$$;


ALTER FUNCTION "public"."accept_member_invitation"("p_invitation_id" "uuid", "p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accrue_commission"("p_organization_id" "uuid", "p_broker_id" "uuid", "p_property_id" "uuid", "p_source_type" "text", "p_basis_amount" numeric, "p_rate_percent" numeric DEFAULT NULL::numeric, "p_gross_amount" numeric DEFAULT NULL::numeric, "p_wht_rate" numeric DEFAULT NULL::numeric, "p_wht_account_id" "uuid" DEFAULT NULL::"uuid", "p_unit_id" "uuid" DEFAULT NULL::"uuid", "p_lease_id" "uuid" DEFAULT NULL::"uuid", "p_installment_plan_id" "uuid" DEFAULT NULL::"uuid", "p_earned_date" "date" DEFAULT CURRENT_DATE, "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_decimals int;
  v_expense_account uuid;
  v_payable_account uuid;
  v_fiscal_period_id uuid;
  v_broker record;
  v_gross numeric;
  v_wht_rate numeric;
  v_wht numeric;
  v_net numeric;
  v_entry_id uuid;
  v_commission_id uuid;
  v_lines jsonb;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.commissions.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة العمولات' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_NOT_ACTIVE: المؤسسة غير نشطة' using errcode = 'P0001';
  end if;

  select * into v_broker from public.brokers
  where id = p_broker_id and organization_id = p_organization_id;
  if v_broker.id is null then
    raise exception 'BROKER_NOT_FOUND: الوسيط غير موجود' using errcode = 'P0002';
  end if;
  if not v_broker.is_active then
    raise exception 'BROKER_INACTIVE: الوسيط غير نشط' using errcode = 'P0001';
  end if;

  select public.currency_decimals(default_currency) into v_decimals
  from public.organizations where id = p_organization_id;
  v_decimals := coalesce(v_decimals, 2);

  if p_gross_amount is not null then
    v_gross := round(p_gross_amount, v_decimals);
  elsif p_rate_percent is not null then
    v_gross := round(coalesce(p_basis_amount, 0) * p_rate_percent / 100, v_decimals);
  else
    raise exception 'COMMISSION_AMOUNT_REQUIRED: حدّد نسبة العمولة أو مبلغها' using errcode = '22023';
  end if;

  if v_gross <= 0 then
    raise exception 'COMMISSION_AMOUNT_INVALID: مبلغ العمولة يجب أن يكون موجبًا' using errcode = '22023';
  end if;

  v_wht_rate := coalesce(p_wht_rate, v_broker.default_wht_rate, 0);
  v_wht := round(v_gross * v_wht_rate / 100, v_decimals);
  v_net := v_gross - v_wht;

  if v_wht > 0 and p_wht_account_id is null then
    raise exception 'WHT_ACCOUNT_REQUIRED: يجب تحديد حساب ضريبة الخصم عند وجود نسبة خصم' using errcode = '22023';
  end if;

  select commission_expense_account_id, commission_payable_account_id
  into v_expense_account, v_payable_account
  from public.organization_finance_settings
  where organization_id = p_organization_id
  order by (property_id = p_property_id) desc nulls last
  limit 1;

  if v_expense_account is null or v_payable_account is null then
    raise exception
      'COMMISSION_ACCOUNTS_NOT_SET: لم تُحدَّد حسابات مصروف العمولة والتزامها في إعدادات المالية'
      using errcode = 'P0001';
  end if;

  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = p_organization_id
    and fp.status = 'OPEN'
    and p_earned_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  if v_fiscal_period_id is null then
    raise exception
      'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي تاريخ استحقاق العمولة (%)', p_earned_date
      using errcode = 'P0001';
  end if;

  insert into public.commissions (
    organization_id, property_id, broker_id, unit_id, source_type,
    lease_id, installment_plan_id, basis_amount, rate_percent,
    gross_amount, wht_rate, wht_amount, net_amount,
    earned_date, status, note, created_by
  ) values (
    p_organization_id, p_property_id, p_broker_id, p_unit_id, p_source_type,
    p_lease_id, p_installment_plan_id, coalesce(p_basis_amount, 0), p_rate_percent,
    v_gross, v_wht_rate, v_wht, v_net,
    p_earned_date, 'ACCRUED', p_note, auth.uid()
  )
  returning id into v_commission_id;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_expense_account, 'debit', v_gross, 'credit', 0),
    jsonb_build_object('account_id', v_payable_account, 'debit', 0, 'credit', v_net)
  );
  if v_wht > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', p_wht_account_id, 'debit', 0, 'credit', v_wht)
    );
  end if;

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_property_id, v_fiscal_period_id, p_earned_date,
    'Broker commission — ' || v_broker.name,
    'JOURNAL_VOUCHER', v_lines,
    'commission_accrual:' || v_commission_id::text
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.commissions set accrual_journal_entry_id = v_entry_id where id = v_commission_id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  ) values (
    auth.uid(), p_organization_id, p_property_id,
    'commission.accrued', 'commission', v_commission_id,
    jsonb_build_object('broker', v_broker.name, 'gross', v_gross, 'wht', v_wht, 'net', v_net)
  );

  return v_commission_id;
end;
$$;


ALTER FUNCTION "public"."accrue_commission"("p_organization_id" "uuid", "p_broker_id" "uuid", "p_property_id" "uuid", "p_source_type" "text", "p_basis_amount" numeric, "p_rate_percent" numeric, "p_gross_amount" numeric, "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_unit_id" "uuid", "p_lease_id" "uuid", "p_installment_plan_id" "uuid", "p_earned_date" "date", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_unit_lease"("p_lease_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lease public.unit_leases;
begin
  select * into v_lease from public.unit_leases where id = p_lease_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_lease.organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;
  if v_lease.status <> 'DRAFT' then
    raise exception 'ILLEGAL_TRANSITION: لا يمكن تفعيل عقد ليس في حالة مسودة (الحالة الحالية: %)', v_lease.status
      using errcode = '22023';
  end if;

  begin
    update public.unit_leases set status = 'ACTIVE' where id = p_lease_id;
  exception when exclusion_violation then
    raise exception 'LEASE_OVERLAPS_ACTIVE: يوجد عقد إيجار نشط آخر يتداخل زمنيًا مع هذه الوحدة' using errcode = '22023';
  end;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_lease.organization_id, v_lease.property_id, 'unit_lease.activated', 'unit_lease', p_lease_id, '{}'::jsonb);
end;
$$;


ALTER FUNCTION "public"."activate_unit_lease"("p_lease_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid", "p_role_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'tenant.users.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  select id into v_role_id
  from public.roles
  where organization_id = p_organization_id and key = p_role_key;

  if v_role_id is null then
    raise exception 'unknown role for this organization: %', p_role_key;
  end if;

  insert into public.organization_memberships (organization_id, user_id, status)
  values (p_organization_id, p_user_id, 'invited')
  on conflict (organization_id, user_id) do update set status = 'invited';

  insert into public.user_role_assignments (user_id, role_id, organization_id, created_by)
  values (p_user_id, v_role_id, p_organization_id, auth.uid())
  on conflict (user_id, role_id, organization_id, property_id) do nothing;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, 'organization_member.added', 'user', p_user_id,
    jsonb_build_object('role_key', p_role_key));
end;
$$;


ALTER FUNCTION "public"."add_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid", "p_role_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."allocate_document_number"("p_organization_id" "uuid", "p_document_type" "text", "p_source_type" "text", "p_source_id" "uuid", "p_issue_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year integer := extract(year from p_issue_date)::integer;
  v_existing text;
  v_seq integer;
  v_number text;
begin
  select document_number into v_existing
  from public.document_numbers
  where organization_id = p_organization_id
    and source_type = p_source_type and source_id = p_source_id;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.document_number_counters (organization_id, document_type, year, next_number)
  values (p_organization_id, p_document_type, v_year, 1)
  on conflict (organization_id, document_type, year) do nothing;

  select next_number into v_seq
  from public.document_number_counters
  where organization_id = p_organization_id
    and document_type = p_document_type and year = v_year
  for update;

  update public.document_number_counters
  set next_number = next_number + 1
  where organization_id = p_organization_id
    and document_type = p_document_type and year = v_year;

  v_number := case p_document_type
                when 'INVOICE' then 'INV'
                when 'RECEIPT' then 'RCT'
                when 'CREDIT_NOTE' then 'CRN'
                else 'DBN' end
              || '-' || v_year::text || '-' || lpad(v_seq::text, 6, '0');

  insert into public.document_numbers (
    organization_id, document_type, source_type, source_id, year, sequence_number, document_number
  ) values (
    p_organization_id, p_document_type, p_source_type, p_source_id, v_year, v_seq, v_number
  );

  return v_number;
end;
$$;


ALTER FUNCTION "public"."allocate_document_number"("p_organization_id" "uuid", "p_document_type" "text", "p_source_type" "text", "p_source_id" "uuid", "p_issue_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."append_financial_audit_event"("p_organization_id" "uuid", "p_action" "text", "p_entity_type" "text", "p_resort_id" "uuid" DEFAULT NULL::"uuid", "p_entity_id" "uuid" DEFAULT NULL::"uuid", "p_request_id" "text" DEFAULT NULL::"text", "p_ip_address" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_actor_user_id uuid;
  v_prev_hash text;
  v_event_hash text;
  v_payload text;
  v_audit_id uuid;
  v_occurred_at timestamptz := now();
  v_final_metadata jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'المنظمة غير موجودة' USING ERRCODE = '22023';
  END IF;

  IF p_resort_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.resorts
      WHERE id = p_resort_id AND organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'المنتجع المحدّد لا ينتمي للمنظمة' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_actor_user_id := auth.uid();
  v_final_metadata := COALESCE(p_metadata, '{}'::jsonb);

  IF v_actor_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = p_organization_id AND user_id = v_actor_user_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'غير مصرح للوصول لهذه المنظمة' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_final_metadata := v_final_metadata || '{"actor_type": "system"}'::jsonb;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('financial_audit_' || p_organization_id::text));

  SELECT event_hash INTO v_prev_hash
  FROM public.financial_audit_logs
  WHERE organization_id = p_organization_id
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1;

  v_payload := concat_ws(
    '|',
    p_organization_id::text,
    COALESCE(p_resort_id::text, ''),
    COALESCE(v_actor_user_id::text, 'SYSTEM'),
    p_action,
    p_entity_type,
    COALESCE(p_entity_id::text, ''),
    COALESCE(p_request_id, ''),
    COALESCE(p_ip_address::text, ''),
    COALESCE(p_user_agent, ''),
    to_char(v_occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    v_final_metadata::text,
    COALESCE(v_prev_hash, 'GENESIS_BLOCK')
  );

  v_event_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');

  INSERT INTO public.financial_audit_logs (
    organization_id,
    property_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    request_id,
    occurred_at,
    ip_address,
    user_agent,
    metadata,
    previous_hash,
    event_hash
  ) VALUES (
    p_organization_id,
    p_resort_id,
    v_actor_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_request_id,
    v_occurred_at,
    p_ip_address,
    p_user_agent,
    v_final_metadata,
    v_prev_hash,
    v_event_hash
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;


ALTER FUNCTION "public"."append_financial_audit_event"("p_organization_id" "uuid", "p_action" "text", "p_entity_type" "text", "p_resort_id" "uuid", "p_entity_id" "uuid", "p_request_id" "text", "p_ip_address" "inet", "p_user_agent" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_due_type_revenue_nature"("p_mapping_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_map record;
begin
  select * into v_map from public.due_type_revenue_natures where id = p_mapping_id;
  if v_map.id is null then
    raise exception 'TAX_MAPPING_NOT_FOUND: الربط غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_map.organization_id, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك باعتماد الربط' using errcode = '42501';
  end if;

  if v_map.status = 'APPROVED' then
    raise exception 'TAX_MAPPING_ALREADY_APPROVED: الربط معتمد بالفعل' using errcode = 'P0001';
  end if;

  update public.due_type_revenue_natures
  set status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = p_mapping_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_map.organization_id, 'tax_mapping.approved', 'due_type_revenue_nature', p_mapping_id,
    jsonb_build_object(
      'due_type_id',    v_map.due_type_id,
      'revenue_nature', v_map.revenue_nature,
      'status_from',    v_map.status,
      'status_to',      'APPROVED'
    )
  );
end;
$$;


ALTER FUNCTION "public"."approve_due_type_revenue_nature"("p_mapping_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_expense_account_input_tax"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row record;
begin
  select * into v_row from public.expense_account_input_tax where id = p_id;
  if v_row.id is null then
    raise exception 'INPUT_TAX_DECLARATION_NOT_FOUND: الإعلان غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_row.organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك باعتماد قابلية الخصم'
      using errcode = '42501';
  end if;

  if v_row.status = 'APPROVED' then
    raise exception 'INPUT_TAX_DECLARATION_ALREADY_APPROVED: الإعلان معتمد بالفعل'
      using errcode = 'P0001';
  end if;

  update public.expense_account_input_tax
  set status = 'APPROVED', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = p_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_row.organization_id, 'input_tax_recoverability.approved',
    'expense_account_input_tax', p_id,
    jsonb_build_object(
      'expense_account_id', v_row.expense_account_id,
      'recoverability', v_row.recoverability, 'ratio', v_row.recoverable_ratio,
      'status_from', v_row.status, 'status_to', 'APPROVED'
    )
  );
end;
$$;


ALTER FUNCTION "public"."approve_expense_account_input_tax"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_purchase_order"("p_purchase_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order public.purchase_orders;
  v_order_number bigint;
begin
  select * into v_order from public.purchase_orders where id = p_purchase_order_id;
  if v_order.id is null then
    raise exception 'purchase order not found';
  end if;
  if not public.has_permission(auth.uid(), v_order.organization_id, 'purchasing.orders.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_order.status <> 'DRAFT' then
    raise exception 'only a draft order can be approved';
  end if;

  v_order_number := public.next_sequence_value(v_order.organization_id, null, 'purchase_order');

  update public.purchase_orders
  set status = 'APPROVED', approved_by = auth.uid(), order_number = v_order_number
  where id = p_purchase_order_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_order.organization_id, v_order.property_id, 'purchase_order.approved', 'purchase_order', p_purchase_order_id,
    jsonb_build_object('order_number', v_order_number));
end;
$$;


ALTER FUNCTION "public"."approve_purchase_order"("p_purchase_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_tax_rule"("p_rule_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'FORBIDDEN_TAX_RULE_ADMIN: اعتماد القواعد الضريبية لمشرف المنصة وحده'
      using errcode = '42501';
  end if;

  update public.tax_rule_versions
  set status = 'APPROVED', approved_by = auth.uid(), approved_at = now()
  where id = p_rule_id and status = 'DRAFT';

  if not found then
    raise exception 'TAX_RULE_NOT_DRAFT: لا توجد مسودة بهذا المعرّف' using errcode = 'P0002';
  end if;
end;
$$;


ALTER FUNCTION "public"."approve_tax_rule"("p_rule_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_unit"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_resort_id uuid;
  v_active_owners int;
  v_open_dues int;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بأرشفة الوحدة' using errcode = '42501';
  end if;

  select property_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  select count(*) into v_active_owners
  from public.unit_ownerships
  where unit_id = p_unit_id and (end_date is null or end_date >= current_date);
  if v_active_owners > 0 then
    raise exception 'UNIT_HAS_ACTIVE_OWNERSHIP: لا يمكن أرشفة وحدة عليها ملكية نشطة — أنهِ الملكية أولًا' using errcode = '22023';
  end if;

  select count(*) into v_open_dues
  from public.dues
  where unit_id = p_unit_id and status in ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE');
  if v_open_dues > 0 then
    raise exception 'UNIT_HAS_OPEN_DUES: لا يمكن أرشفة وحدة عليها مستحقات مفتوحة غير مسددة' using errcode = '22023';
  end if;

  update public.units
  set is_active = false,
      archived_at = now(),
      archived_by = auth.uid()
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.archived', 'unit', p_unit_id, p_reason, '{}'::jsonb);
end;
$$;


ALTER FUNCTION "public"."archive_unit"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_subscription"("p_organization_id" "uuid", "p_plan_key" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan_id uuid;
  v_subscription_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select id into v_plan_id from public.plans where key = p_plan_key;
  if v_plan_id is null then
    raise exception 'unknown plan: %', p_plan_key;
  end if;

  update public.subscriptions
  set status = 'CANCELED'
  where organization_id = p_organization_id and status = 'ACTIVE';

  insert into public.subscriptions (organization_id, plan_id, created_by)
  values (p_organization_id, v_plan_id, auth.uid())
  returning id into v_subscription_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, 'subscription.assigned', 'subscription', v_subscription_id,
    jsonb_build_object('plan_key', p_plan_key));

  return v_subscription_id;
end;
$$;


ALTER FUNCTION "public"."assign_subscription"("p_organization_id" "uuid", "p_plan_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_match_bank_statement"("p_statement_id" "uuid", "p_date_tolerance_days" integer DEFAULT 5) RETURNS TABLE("matched_count" integer, "ambiguous_count" integer, "unmatched_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
  v_gl_account uuid;
  v_status text;
  v_matched int := 0;
  v_ambiguous int := 0;
  v_unmatched int;
  v_line record;
  v_candidate uuid;
  v_candidate_count int;
begin
  select s.organization_id, ba.gl_account_id, s.status
  into v_org, v_gl_account, v_status
  from public.bank_statements s
  join public.bank_accounts ba on ba.id = s.bank_account_id
  where s.id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتنفيذ المطابقة البنكية' using errcode = '42501';
  end if;

  if v_status <> 'DRAFT' then
    raise exception 'BANK_STATEMENT_NOT_DRAFT: لا يمكن تعديل مطابقة كشف حساب معتمد؛ أعد فتحه أولًا' using errcode = 'P0001';
  end if;

  if p_date_tolerance_days < 0 or p_date_tolerance_days > 60 then
    raise exception 'INVALID_TOLERANCE: نطاق التسامح في التاريخ يجب أن يكون بين 0 و60 يومًا' using errcode = 'P0001';
  end if;

  for v_line in
    select id, line_date, amount
    from public.bank_statement_lines
    where statement_id = p_statement_id
      and matched_journal_entry_line_id is null
    order by line_date, sort_order, id
  loop
    select count(*), (array_agg(l.id))[1]
    into v_candidate_count, v_candidate
    from public.journal_entry_lines l
    join public.journal_entries je on je.id = l.journal_entry_id
    where l.account_id = v_gl_account
      and je.organization_id = v_org
      and je.status = 'POSTED'
      and (l.debit - l.credit) = v_line.amount
      and je.entry_date between v_line.line_date - p_date_tolerance_days
                            and v_line.line_date + p_date_tolerance_days
      and not exists (
        select 1 from public.bank_statement_lines bl
        where bl.matched_journal_entry_line_id = l.id
      );

    if v_candidate_count = 1 then
      update public.bank_statement_lines
      set matched_journal_entry_line_id = v_candidate,
          match_type = 'AUTO',
          matched_at = now(),
          matched_by = auth.uid()
      where id = v_line.id;
      v_matched := v_matched + 1;
    elsif v_candidate_count > 1 then
      v_ambiguous := v_ambiguous + 1;
    end if;
  end loop;

  select count(*) into v_unmatched
  from public.bank_statement_lines
  where statement_id = p_statement_id
    and matched_journal_entry_line_id is null;

  return query select v_matched, v_ambiguous, v_unmatched;
end;
$$;


ALTER FUNCTION "public"."auto_match_bank_statement"("p_statement_id" "uuid", "p_date_tolerance_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_installment_plan"("p_plan_id" "uuid", "p_cancel_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan public.installment_plans;
begin
  select * into v_plan from public.installment_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'PLAN_NOT_FOUND: خطة التقسيط غير موجودة' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_plan.organization_id, 'property.installments.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة خطط التقسيط' using errcode = '42501';
  end if;
  if v_plan.status <> 'ACTIVE' then
    raise exception 'ILLEGAL_TRANSITION: لا يمكن إلغاء خطة ليست نشطة (الحالة الحالية: %)', v_plan.status
      using errcode = '22023';
  end if;
  if p_cancel_reason is null or trim(p_cancel_reason) = '' then
    raise exception 'CANCEL_REASON_REQUIRED: يجب إدخال سبب الإلغاء' using errcode = '22023';
  end if;

  update public.dues
  set status = 'VOID'
  where id in (select due_id from public.plan_installments where plan_id = p_plan_id)
    and status in ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE');

  update public.installment_plans
  set status = 'CANCELLED', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = p_cancel_reason
  where id = p_plan_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_plan.organization_id, v_plan.property_id, 'installment_plan.cancelled', 'installment_plan', p_plan_id,
    jsonb_build_object('reason', p_cancel_reason));
end;
$$;


ALTER FUNCTION "public"."cancel_installment_plan"("p_plan_id" "uuid", "p_cancel_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_supplier_invoice"("p_organization_id" "uuid", "p_invoice_id" "uuid", "p_fiscal_period_id" "uuid", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_invoice public.supplier_invoices;
  v_reason text;
  v_entry_id uuid;
  v_taxable_base numeric(19, 4);
  v_debit_lines jsonb;
  v_credit_lines jsonb;
  v_has_active_allocations boolean;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' using errcode = '42501';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'REASON_REQUIRED: سبب الإلغاء مطلوب' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'REASON_TOO_LONG: سبب الإلغاء طويل جدًا (الحد 1000 حرف)' using errcode = '22023';
  end if;

  select * into v_invoice from public.supplier_invoices where id = p_invoice_id and organization_id = p_organization_id for update;
  if v_invoice.id is null then
    raise exception 'INVOICE_NOT_FOUND: الفاتورة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_invoice.property_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء فواتير الموردين' using errcode = '42501';
  end if;
  -- Explicit and separate from finance.suppliers.void on purpose (see
  -- migration header) -- reversing a posted entry is a posting action.
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.entries.post') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: إلغاء فاتورة مرحّلة يتطلب أيضًا صلاحية ترحيل القيود' using errcode = '42501';
  end if;

  if v_invoice.status = 'CANCELLED' then
    raise exception 'ALREADY_CANCELLED: هذه الفاتورة ملغاة بالفعل بتاريخ %', v_invoice.reversed_at using errcode = '22023';
  end if;

  select exists(
    select 1 from public.supplier_payment_allocations where invoice_id = p_invoice_id and reversed_at is null
  ) into v_has_active_allocations;
  if v_has_active_allocations then
    raise exception 'HAS_PAYMENTS: لا يمكن إلغاء فاتورة عليها دفعات مسددة، يجب عكس الدفعات أولًا' using errcode = '22023';
  end if;

  v_taxable_base := v_invoice.net_amount - v_invoice.discount_amount;
  v_debit_lines := jsonb_build_array(jsonb_build_object('account_id', v_invoice.payable_account_id, 'debit', v_invoice.amount, 'credit', 0));
  v_credit_lines := jsonb_build_array(jsonb_build_object('account_id', v_invoice.expense_account_id, 'debit', 0, 'credit', v_taxable_base));
  if v_invoice.vat_amount > 0 then
    v_credit_lines := v_credit_lines || jsonb_build_array(jsonb_build_object('account_id', v_invoice.vat_account_id, 'debit', 0, 'credit', v_invoice.vat_amount));
  end if;

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, v_invoice.property_id, p_fiscal_period_id, current_date,
    'Cancellation of supplier invoice ' || v_invoice.invoice_number, 'JOURNAL_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.supplier_invoices
  set status = 'CANCELLED', reversed_at = now(), reversed_by = auth.uid(), reversal_reason = v_reason
  where id = p_invoice_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_invoice.property_id, 'supplier_invoice.cancelled', 'supplier_invoice', p_invoice_id, v_reason,
    jsonb_build_object('reversal_entry_id', v_entry_id, 'amount', v_invoice.amount));

  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."cancel_supplier_invoice"("p_organization_id" "uuid", "p_invoice_id" "uuid", "p_fiscal_period_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_unit_lease"("p_lease_id" "uuid", "p_cancel_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lease public.unit_leases;
begin
  select * into v_lease from public.unit_leases where id = p_lease_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_lease.organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;
  if v_lease.status <> 'DRAFT' then
    raise exception 'ILLEGAL_TRANSITION: لا يمكن إلغاء عقد فُعّل بالفعل — استخدم إنهاء العقد بدلًا من ذلك (الحالة الحالية: %)', v_lease.status
      using errcode = '22023';
  end if;

  update public.unit_leases set status = 'CANCELLED' where id = p_lease_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_lease.organization_id, v_lease.property_id, 'unit_lease.cancelled', 'unit_lease', p_lease_id,
    jsonb_build_object('reason', p_cancel_reason));
end;
$$;


ALTER FUNCTION "public"."cancel_unit_lease"("p_lease_id" "uuid", "p_cancel_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capitalise_project_cost"("p_project_id" "uuid", "p_amount" numeric, "p_credit_account_id" "uuid", "p_entry_date" "date", "p_description" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_project public.projects;
  v_period public.fiscal_periods;
  v_entry_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_project.organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك برسملة تكاليف المشاريع'
      using errcode = '42501';
  end if;

  if v_project.wip_account_id is null or v_project.cost_of_sales_account_id is null then
    raise exception
      'PROJECT_ACCOUNTS_NOT_SET: عيّن حساب الأعمال تحت التنفيذ وحساب تكلفة المبيعات للمشروع (%) أولًا',
      v_project.code
      using errcode = '22023';
  end if;

  if p_amount <= 0 then
    raise exception 'PROJECT_COST_NOT_POSITIVE: قيمة الرسملة يجب أن تكون موجبة'
      using errcode = '22023';
  end if;

  if v_project.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'PROJECT_NOT_OPEN: المشروع (%) بحالة % فلا تُرسمل عليه تكلفة جديدة',
      v_project.code, v_project.status
      using errcode = '22023';
  end if;

  select * into v_period from public.fiscal_periods fp
  where fp.organization_id = v_project.organization_id
    and fp.status = 'OPEN'
    and p_entry_date between fp.start_date and fp.end_date
  order by fp.start_date limit 1;

  if v_period.id is null then
    raise exception 'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي التاريخ (%)', p_entry_date
      using errcode = 'P0001';
  end if;

  v_entry_id := public.create_journal_entry_internal(
    v_project.organization_id, v_project.property_id, v_period.id, p_entry_date,
    'WIP — ' || v_project.code || ' — ' || coalesce(p_description, ''),
    'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_project.wip_account_id, 'debit', p_amount, 'credit', 0,
                         'project_id', p_project_id),
      jsonb_build_object('account_id', p_credit_account_id, 'debit', 0, 'credit', p_amount,
                         'project_id', p_project_id)
    ),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."capitalise_project_cost"("p_project_id" "uuid", "p_amount" numeric, "p_credit_account_id" "uuid", "p_entry_date" "date", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_asset_disposal_readiness"("p_organization_id" "uuid") RETURNS TABLE("ready" boolean, "gain_account_id" "uuid", "loss_account_id" "uuid", "reason" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_gain uuid;
  v_loss uuid;
begin
  select o.asset_disposal_gain_account_id, o.asset_disposal_loss_account_id
  into v_gain, v_loss
  from public.organizations o where o.id = p_organization_id;

  if v_gain is null and v_loss is null then
    return query select false, null::uuid, null::uuid, 'DISPOSAL_ACCOUNTS_NOT_SET'::text;
  elsif v_gain is null then
    return query select false, v_gain, v_loss, 'DISPOSAL_GAIN_ACCOUNT_NOT_SET'::text;
  elsif v_loss is null then
    return query select false, v_gain, v_loss, 'DISPOSAL_LOSS_ACCOUNT_NOT_SET'::text;
  else
    return query select true, v_gain, v_loss, null::text;
  end if;
end;
$$;


ALTER FUNCTION "public"."check_asset_disposal_readiness"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_coa_no_loop"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_ancestor uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  v_ancestor := new.parent_id;
  while v_ancestor is not null loop
    if v_ancestor = new.id then
      raise exception 'COA_LOOP_DETECTED' using errcode = '22023';
    end if;
    select parent_id into v_ancestor from public.chart_of_accounts where id = v_ancestor;
  end loop;
  return new;
end;
$$;


ALTER FUNCTION "public"."check_coa_no_loop"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_einvoice_emission_readiness"("p_organization_id" "uuid") RETURNS TABLE("gap_code" "text", "detail" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org record;
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بفحص جاهزية الإصدار'
      using errcode = '42501';
  end if;

  select o.tax_id, o.tax_jurisdiction into v_org
  from public.organizations o where o.id = p_organization_id;

  if nullif(btrim(coalesce(v_org.tax_id, '')), '') is null then
    return query select 'SELLER_TAX_ID_MISSING'::text,
      'لا يُصدَر مستند بلا رقم ضريبي للمؤسسة'::text;
  end if;

  return query
  select 'ITEM_LINK_MISSING'::text,
         ('نوع مستحق نشط بلا صنف مرتبط: ' || dt.name_ar)::text
  from public.due_types dt
  where dt.organization_id = p_organization_id and dt.is_active
    and dt.catalogue_item_id is null;

  return query
  select 'ITEM_CODE_MISSING'::text,
         ('صنف بلا كود سلطة (EGS/GS1): ' || ci.name_ar)::text
  from public.due_types dt
  join public.catalogue_items ci on ci.id = dt.catalogue_item_id
  where dt.organization_id = p_organization_id and dt.is_active
    and nullif(btrim(coalesce(ci.item_code, '')), '') is null;

  return query
  select 'BUYER_TAX_ID_MISSING'::text,
         (count(*)::text || ' مشتريًا منشأةً بلا رقم تسجيل؛ فاتورته لا تُصدَر')::text
  from public.members m
  where m.organization_id = p_organization_id and m.customer_type = 'B2B'
    and nullif(btrim(coalesce(m.tax_registration_number, '')), '') is null
  having count(*) > 0;
end;
$$;


ALTER FUNCTION "public"."check_einvoice_emission_readiness"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_fx_readiness"("p_organization_id" "uuid") RETURNS TABLE("ready" boolean, "gain_account_id" "uuid", "loss_account_id" "uuid", "reason" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_gain uuid;
  v_loss uuid;
begin
  select o.fx_gain_account_id, o.fx_loss_account_id into v_gain, v_loss
  from public.organizations o where o.id = p_organization_id;

  if v_gain is null and v_loss is null then
    return query select false, null::uuid, null::uuid, 'FX_ACCOUNTS_NOT_SET'::text;
  elsif v_gain is null then
    return query select false, v_gain, v_loss, 'FX_GAIN_ACCOUNT_NOT_SET'::text;
  elsif v_loss is null then
    return query select false, v_gain, v_loss, 'FX_LOSS_ACCOUNT_NOT_SET'::text;
  else
    return query select true, v_gain, v_loss, null::text;
  end if;
end;
$$;


ALTER FUNCTION "public"."check_fx_readiness"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_input_tax_readiness"("p_organization_id" "uuid") RETURNS TABLE("gap_code" "text", "detail" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_missing_account integer;
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.view')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بفحص جاهزية ضريبة المدخلات'
      using errcode = '42501';
  end if;

  -- حسابات مصروف استُعملت في فواتير تحمل ضريبة، وليس لها إعلان معتمد.
  return query
  select 'INPUT_TAX_RECOVERABILITY_UNDECLARED'::text,
         ('حساب مصروف بفواتير تحمل ضريبة بلا إعلان معتمد: ' || a.name_ar)::text
  from (
    select distinct si.expense_account_id
    from public.supplier_invoices si
    where si.organization_id = p_organization_id and coalesce(si.vat_amount, 0) > 0
  ) used
  join public.chart_of_accounts a on a.id = used.expense_account_id
  left join public.expense_account_input_tax d
    on d.expense_account_id = used.expense_account_id and d.organization_id = p_organization_id
  where d.id is null or d.status <> 'APPROVED';

  return query
  select 'MIXED_USE_RATIO_MISSING'::text,
         ('إعلان مختلط بلا نسبة: ' || a.name_ar)::text
  from public.expense_account_input_tax d
  join public.chart_of_accounts a on a.id = d.expense_account_id
  where d.organization_id = p_organization_id
    and d.recoverability = 'MIXED' and d.recoverable_ratio is null;

  return query
  select 'MIXED_USE_METHOD_MISSING'::text,
         ('إعلان مختلط بلا منهج أو فترة: ' || a.name_ar)::text
  from public.expense_account_input_tax d
  join public.chart_of_accounts a on a.id = d.expense_account_id
  where d.organization_id = p_organization_id
    and d.recoverability = 'MIXED'
    and (nullif(btrim(coalesce(d.ratio_method, '')), '') is null
         or nullif(btrim(coalesce(d.ratio_period, '')), '') is null);

  return query
  select 'SUPPLIER_TAX_ID_MISSING'::text,
         ('مورد بفواتير تحمل ضريبة وبلا رقم تسجيل: ' || s.name)::text
  from public.suppliers s
  where s.organization_id = p_organization_id
    and nullif(btrim(coalesce(s.tax_number, '')), '') is null
    and exists (
      select 1 from public.supplier_invoices si
      where si.supplier_id = s.id and coalesce(si.vat_amount, 0) > 0
    );

  return query
  select 'SUPPLIER_INVOICE_MISSING'::text,
         ('فاتورة تحمل ضريبة بلا رقم مستند: ' || si.id::text)::text
  from public.supplier_invoices si
  where si.organization_id = p_organization_id
    and coalesce(si.vat_amount, 0) > 0
    and nullif(btrim(coalesce(si.invoice_number, '')), '') is null;

  select count(*) into v_missing_account
  from public.expense_account_input_tax d
  where d.organization_id = p_organization_id
    and d.status = 'APPROVED'
    and d.recoverability in ('FULLY_RECOVERABLE', 'MIXED');

  if v_missing_account > 0 and public.resolve_input_tax_account(p_organization_id) is null then
    return query select 'INPUT_TAX_ACCOUNT_MISSING'::text,
      'لا يوجد حساب ضريبة مدخلات صالح (أصل نشط غير تجميعي): استنسخ الدليل القياسي أو عيّن حسابًا'::text;
  end if;
end;
$$;


ALTER FUNCTION "public"."check_input_tax_readiness"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_installment_plan_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_plan_id uuid;
  v_remaining int;
begin
  select pi.plan_id into v_plan_id from public.plan_installments pi where pi.due_id = new.id;
  if v_plan_id is null then
    return new;
  end if;

  select count(*) into v_remaining
  from public.plan_installments pi
  join public.dues d on d.id = pi.due_id
  where pi.plan_id = v_plan_id and d.status <> 'PAID';

  if v_remaining = 0 then
    update public.installment_plans set status = 'COMPLETED' where id = v_plan_id and status = 'ACTIVE';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."check_installment_plan_completion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_tax_enforcement_readiness"("p_organization_id" "uuid") RETURNS TABLE("gap_code" "text", "detail" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org record;
  v_has_taxable boolean;
  v_unresolved integer;
  v_b2b_no_tax_id integer;
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.tax_enforcement.manage')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.tax_mapping.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.tax_mapping.manage')
  ) then
    raise exception 'FORBIDDEN_TAX_ENFORCEMENT: غير مصرح لك بفحص جاهزية الإنفاذ الضريبي'
      using errcode = '42501';
  end if;

  select o.tax_id, o.tax_jurisdiction into v_org
  from public.organizations o where o.id = p_organization_id;

  if nullif(btrim(coalesce(v_org.tax_jurisdiction, '')), '') is null then
    return query select 'JURISDICTION_MISSING'::text,
      'لم يُسجَّل الاختصاص الضريبي للمؤسسة'::text;
  end if;

  if nullif(btrim(coalesce(v_org.tax_id, '')), '') is null then
    return query select 'TAX_IDENTITY_MISSING'::text,
      'لم يُسجَّل الرقم الضريبي للمؤسسة'::text;
  end if;

  return query
  select 'MAPPING_MISSING'::text,
         ('نوع مستحق نشط بلا ربط معتمد: ' || dt.name_ar)::text
  from public.due_types dt
  left join public.due_type_revenue_natures m
    on m.due_type_id = dt.id and m.organization_id = dt.organization_id
  where dt.organization_id = p_organization_id
    and dt.is_active
    and (m.id is null or m.status <> 'APPROVED');

  return query
  select 'RULE_MISSING'::text,
         ('لا قاعدة سارية اليوم لطبيعة: ' || m.revenue_nature)::text
  from (
    select distinct m2.revenue_nature
    from public.due_type_revenue_natures m2
    join public.due_types dt2 on dt2.id = m2.due_type_id and dt2.is_active
    where m2.organization_id = p_organization_id and m2.status = 'APPROVED'
  ) m
  where not exists (
    select 1 from public.resolve_tax_rule(v_org.tax_jurisdiction, m.revenue_nature, current_date) r
    where r.id is not null and r.tax_treatment <> 'REVIEW_REQUIRED'
  );

  return query
  select 'AMOUNT_BASIS_MISSING'::text,
         ('لم يُحدَّد هل المبلغ صافٍ أم شامل للضريبة لنوع مستحق خاضع: ' || dt.name_ar)::text
  from public.due_type_revenue_natures m
  join public.due_types dt
    on dt.id = m.due_type_id and dt.organization_id = m.organization_id and dt.is_active
  where m.organization_id = p_organization_id
    and m.status = 'APPROVED'
    and m.amount_basis is null
    and exists (
      select 1
      from public.resolve_tax_rule(v_org.tax_jurisdiction, m.revenue_nature, current_date) r
      where r.tax_treatment = 'TAXABLE'
    );

  return query
  select 'NET_BASIS_NOT_POSTABLE'::text,
         ('أساس صافٍ لنوع خاضع لا يمكن ترحيله: ' || dt.name_ar ||
          ' — مبلغ المستحق يجب أن يكون شاملًا للضريبة حتى تطابق الذمم ما يدين به العميل')::text
  from public.due_type_revenue_natures m
  join public.due_types dt
    on dt.id = m.due_type_id and dt.organization_id = m.organization_id and dt.is_active
  where m.organization_id = p_organization_id
    and m.status = 'APPROVED'
    and m.amount_basis = 'NET'
    and exists (
      select 1
      from public.resolve_tax_rule(v_org.tax_jurisdiction, m.revenue_nature, current_date) r
      where r.tax_treatment = 'TAXABLE'
    );

  select exists (
    select 1
    from public.due_type_revenue_natures m
    join public.due_types dt on dt.id = m.due_type_id and dt.is_active
    where m.organization_id = p_organization_id and m.status = 'APPROVED'
      and exists (
        select 1 from public.resolve_tax_rule(v_org.tax_jurisdiction, m.revenue_nature, current_date) r
        where r.tax_treatment = 'TAXABLE'
      )
  ) into v_has_taxable;

  if v_has_taxable and public.resolve_output_tax_account(p_organization_id) is null then
    return query select 'OUTPUT_TAX_ACCOUNT_MISSING'::text,
      'لا يوجد حساب ضريبة مخرجات صالح (التزام نشط غير تجميعي): استنسخ الدليل القياسي أو عيّن حسابًا'::text;
  end if;

  -- هوية المشتري: تُفحص مجمَّعةً لا صفًّا صفًّا — 617 عضوًا في مؤسسة واحدة
  -- تعني 617 سطر نقص، وقائمة بهذا الطول لا تُقرأ فلا تُنفَّذ. والفحص للخاضع
  -- وحده: مؤسسة كلها معفاة لا يحجبها غياب تصنيف المشتري.
  if v_has_taxable then
    select count(*) into v_unresolved
    from public.members where organization_id = p_organization_id and customer_type = 'UNRESOLVED';

    if v_unresolved > 0 then
      return query select 'B2B_STATUS_UNRESOLVED'::text,
        (v_unresolved::text || ' عضوًا بلا تصنيف مشتري محسوم؛ الفاتورة الخاضعة لهم مرفوضة حتى يُحسم')::text;
    end if;

    select count(*) into v_b2b_no_tax_id
    from public.members
    where organization_id = p_organization_id and customer_type = 'B2B'
      and nullif(btrim(coalesce(tax_registration_number, '')), '') is null;

    if v_b2b_no_tax_id > 0 then
      return query select 'BUYER_TAX_ID_MISSING'::text,
        (v_b2b_no_tax_id::text || ' مشتريًا مصنَّفًا منشأةً بلا رقم تسجيل ضريبي')::text;
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."check_tax_enforcement_readiness"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_einvoice_document"("p_profile_id" "uuid", "p_source_type" "text", "p_source_id" "uuid", "p_document_type" "text" DEFAULT 'INVOICE'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile record;
  v_org_tax_id text;
  v_id uuid;
  v_status text;
begin
  select * into v_profile from public.einvoice_profiles where id = p_profile_id;
  if v_profile.id is null then
    raise exception 'EINVOICE_PROFILE_NOT_FOUND: ملف التسجيل غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_profile.organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإرسال الفواتير الإلكترونية' using errcode = '42501';
  end if;

  if v_profile.status <> 'ACTIVE' or not v_profile.enabled then
    raise exception
      'EINVOICE_PROFILE_NOT_ACTIVE: لم يُفعَّل التسجيل لدى مصلحة الضرائب بعد؛ تحقّق من بيانات الاعتماد أولًا'
      using errcode = 'P0001';
  end if;

  select nullif(btrim(tax_id), '') into v_org_tax_id
  from public.organizations where id = v_profile.organization_id;

  if v_org_tax_id is null then
    raise exception
      'EINVOICE_LEGAL_IDENTITY_MISSING: لا يمكن الإرسال بلا رقم ضريبي مسجّل للمؤسسة'
      using errcode = 'P0001';
  end if;

  if coalesce(v_profile.taxpayer_id, '') <> v_org_tax_id then
    raise exception
      'EINVOICE_IDENTITY_CONFLICT: هوية الملف الضريبية تخالف هوية المؤسسة؛ لا يمكن الإرسال'
      using errcode = 'P0001';
  end if;

  select id, status into v_id, v_status
  from public.einvoice_documents
  where profile_id = p_profile_id and source_type = p_source_type and source_id = p_source_id;

  if v_id is not null then
    if v_status in ('ACCEPTED', 'SUBMITTED') then
      raise exception
        'EINVOICE_ALREADY_FILED: هذا المستند مُرسَل بالفعل (%)', v_status using errcode = 'P0001';
    end if;
    return v_id;
  end if;

  insert into public.einvoice_documents (
    organization_id, profile_id, source_type, source_id, document_type,
    idempotency_key, created_by
  ) values (
    v_profile.organization_id, p_profile_id, p_source_type, p_source_id, p_document_type,
    p_profile_id::text || ':' || p_source_type || ':' || p_source_id::text,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."claim_einvoice_document"("p_profile_id" "uuid", "p_source_type" "text", "p_source_id" "uuid", "p_document_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_incoming_cheque"("p_cheque_id" "uuid", "p_clearing_date" "date", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cheque public.cheques;
  v_bank_gl_account_id uuid;
  v_payment_id uuid;
begin
  select * into v_cheque from public.cheques where id = p_cheque_id;
  if v_cheque.id is null then
    raise exception 'CHEQUE_NOT_FOUND: الشيك غير موجود' using errcode = '22023';
  end if;
  if v_cheque.direction <> 'INCOMING' then
    raise exception 'CHEQUE_NOT_INCOMING: يمكن تحصيل الشيكات الواردة فقط عبر هذه الوظيفة' using errcode = '22023';
  end if;
  if v_cheque.status <> 'DEPOSITED' then
    raise exception 'CHEQUE_NOT_DEPOSITED: يجب أن يكون الشيك بحالة (مودَع) قبل تحصيله' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_cheque.organization_id, 'banking.cheques.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إدارة الشيكات' using errcode = '42501';
  end if;

  select gl_account_id into v_bank_gl_account_id from public.bank_accounts where id = v_cheque.bank_account_id;

  v_payment_id := public.record_payment(
    v_cheque.organization_id, v_cheque.property_id, v_cheque.member_id, null, v_cheque.amount,
    'CHEQUE', p_clearing_date, v_bank_gl_account_id, p_fiscal_period_id, p_allocations, null, null
  );

  update public.cheques set status = 'CLEARED', payment_id = v_payment_id where id = p_cheque_id;

  insert into public.cheque_status_history (cheque_id, from_status, to_status, changed_by, note)
  values (p_cheque_id, 'DEPOSITED', 'CLEARED', auth.uid(), 'Cleared via payment ' || v_payment_id);

  return v_payment_id;
end;
$$;


ALTER FUNCTION "public"."clear_incoming_cheque"("p_cheque_id" "uuid", "p_clearing_date" "date", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_chart_of_accounts_template"("p_organization_id" "uuid", "p_template_key" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row record;
  v_new_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  create temporary table if not exists _coa_clone_map (code text primary key, id uuid) on commit drop;
  delete from _coa_clone_map where true;

  for v_row in
    select * from public.coa_template_accounts
    where template_key = p_template_key
    order by sort_order
  loop
    insert into public.chart_of_accounts (
      organization_id, code, name_ar, name_en, parent_id, category, normal_balance, is_group,
      is_cash_equivalent, cash_flow_section
    ) values (
      p_organization_id,
      v_row.code,
      v_row.name_ar,
      v_row.name_en,
      (select id from _coa_clone_map where code = v_row.parent_code),
      v_row.category,
      v_row.normal_balance,
      v_row.is_group,
      v_row.is_cash_equivalent,
      v_row.cash_flow_section
    )
    returning id into v_new_id;

    insert into _coa_clone_map (code, id) values (v_row.code, v_new_id);
  end loop;
end;
$$;


ALTER FUNCTION "public"."clone_chart_of_accounts_template"("p_organization_id" "uuid", "p_template_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_tenant_role_templates"("p_organization_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_template record;
  v_role_id uuid;
begin
  for v_template in select key, name_ar, name_en from public.role_templates loop
    insert into public.roles (organization_id, key, name_ar, name_en, is_system)
    values (p_organization_id, v_template.key, v_template.name_ar, v_template.name_en, false)
    returning id into v_role_id;

    insert into public.role_permissions (role_id, permission_id)
    select v_role_id, p.id
    from public.role_template_permissions rtp
    join public.permissions p on p.key = rtp.permission_key
    where rtp.role_template_key = v_template.key;
  end loop;
end;
$$;


ALTER FUNCTION "public"."clone_tenant_role_templates"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_cashier_session"("p_session_id" "uuid", "p_actual_closing_balance" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session public.cashier_sessions;
  v_receipts numeric(19, 4);
  v_payments numeric(19, 4);
  v_expected numeric(19, 4);
begin
  select * into v_session from public.cashier_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'CASHIER_SESSION_NOT_FOUND: جلسة الكاشير غير موجودة' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_session.organization_id, 'cashier.sessions.close') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إغلاق جلسات الكاشير' using errcode = '42501';
  end if;
  if v_session.status <> 'OPEN' then
    raise exception 'CASHIER_SESSION_NOT_OPEN: الجلسة ليست مفتوحة، لا يمكن إغلاقها' using errcode = '22023';
  end if;

  select
    coalesce(sum(amount) filter (where type = 'RECEIPT'), 0),
    coalesce(sum(amount) filter (where type = 'PAYMENT'), 0)
  into v_receipts, v_payments
  from public.cash_transactions
  where session_id = p_session_id;

  v_expected := v_session.opening_balance + v_receipts - v_payments;

  update public.cashier_sessions
  set status = 'CLOSED',
      closed_by = auth.uid(),
      closed_at = now(),
      expected_closing_balance = v_expected,
      actual_closing_balance = p_actual_closing_balance,
      variance = p_actual_closing_balance - v_expected
  where id = p_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_session.organization_id, v_session.property_id, 'cashier_session.closed', 'cashier_session', p_session_id,
    jsonb_build_object('expected', v_expected, 'actual', p_actual_closing_balance, 'variance', p_actual_closing_balance - v_expected));

  return jsonb_build_object(
    'expected_closing_balance', v_expected,
    'actual_closing_balance', p_actual_closing_balance,
    'variance', p_actual_closing_balance - v_expected
  );
end;
$$;


ALTER FUNCTION "public"."close_cashier_session"("p_session_id" "uuid", "p_actual_closing_balance" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_unit_handover"("p_handover_id" "uuid", "p_completed_date" "date" DEFAULT CURRENT_DATE, "p_electricity_reading" numeric DEFAULT NULL::numeric, "p_water_reading" numeric DEFAULT NULL::numeric, "p_gas_reading" numeric DEFAULT NULL::numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_h record;
  v_blocking int;
begin
  select * into v_h from public.unit_handovers where id = p_handover_id for update;
  if v_h.id is null then
    raise exception 'HANDOVER_NOT_FOUND: سجل التسليم غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_h.organization_id, 'property.handover.manage') then
    raise exception 'FORBIDDEN_PROPERTY_PERMISSION: غير مصرح لك باعتماد التسليم' using errcode = '42501';
  end if;

  if v_h.status <> 'SCHEDULED' then
    raise exception 'HANDOVER_NOT_SCHEDULED: لا يمكن اعتماد تسليم غير مجدول' using errcode = 'P0001';
  end if;

  select count(*) into v_blocking
  from public.unit_handover_snags
  where handover_id = p_handover_id and severity = 'BLOCKING' and status = 'OPEN';

  if v_blocking > 0 then
    raise exception
      'HANDOVER_BLOCKED_BY_SNAGS: لا يمكن اعتماد التسليم ولديك % ملاحظة حاسمة غير مغلقة', v_blocking
      using errcode = 'P0001';
  end if;

  update public.unit_handovers
  set status = 'COMPLETED',
      completed_date = p_completed_date,
      completed_by = auth.uid(),
      electricity_reading = coalesce(p_electricity_reading, electricity_reading),
      water_reading = coalesce(p_water_reading, water_reading),
      gas_reading = coalesce(p_gas_reading, gas_reading)
  where id = p_handover_id;

  update public.units set handed_over_at = p_completed_date where id = v_h.unit_id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  ) values (
    auth.uid(), v_h.organization_id, v_h.property_id,
    'unit_handover.completed', 'unit_handover', p_handover_id,
    jsonb_build_object('unit_id', v_h.unit_id, 'completed_date', p_completed_date)
  );
end;
$$;


ALTER FUNCTION "public"."complete_unit_handover"("p_handover_id" "uuid", "p_completed_date" "date", "p_electricity_reading" numeric, "p_water_reading" numeric, "p_gas_reading" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_input_tax_split"("p_organization_id" "uuid", "p_expense_account_id" "uuid", "p_supplier_id" "uuid", "p_invoice_number" "text", "p_vat_amount" numeric, "p_decimals" integer) RETURNS TABLE("eligible" boolean, "ineligible_reason" "text", "recoverability" "text", "recoverable_ratio" numeric, "recoverable_amount" numeric, "non_recoverable_amount" numeric, "input_tax_account_id" "uuid", "declaration_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_decl record;
  v_supplier_tax text;
  v_vat numeric(19,4);
  v_recoverable numeric(19,4);
  v_account uuid;
begin
  v_vat := round(coalesce(p_vat_amount, 0), p_decimals);

  eligible := false;
  recoverability := 'NON_RECOVERABLE';
  recoverable_ratio := 0;
  recoverable_amount := 0;
  non_recoverable_amount := v_vat;
  input_tax_account_id := null;
  declaration_id := null;

  if v_vat <= 0 then
    ineligible_reason := 'NO_TAX';
    return next; return;
  end if;

  -- المستند الصالح شرط المطالبة لا شرط التسجيل: بلا رقم فاتورة تُسجَّل الضريبة
  -- تكلفةً ولا يُنشأ أصل.
  if nullif(btrim(coalesce(p_invoice_number, '')), '') is null then
    ineligible_reason := 'SUPPLIER_INVOICE_MISSING';
    return next; return;
  end if;

  select * into v_decl
  from public.expense_account_input_tax
  where organization_id = p_organization_id and expense_account_id = p_expense_account_id;

  if v_decl.id is null or v_decl.status <> 'APPROVED' then
    ineligible_reason := 'INPUT_TAX_RECOVERABILITY_UNDECLARED';
    return next; return;
  end if;

  declaration_id := v_decl.id;
  recoverability := v_decl.recoverability;

  if v_decl.recoverability = 'NON_RECOVERABLE' then
    ineligible_reason := null;
    eligible := true;
    return next; return;
  end if;

  select s.tax_number into v_supplier_tax
  from public.suppliers s where s.id = p_supplier_id;

  if nullif(btrim(coalesce(v_supplier_tax, '')), '') is null then
    recoverability := v_decl.recoverability;
    ineligible_reason := 'SUPPLIER_TAX_ID_MISSING';
    recoverable_ratio := 0;
    return next; return;
  end if;

  v_account := public.resolve_input_tax_account(p_organization_id);
  if v_account is null then
    ineligible_reason := 'INPUT_TAX_ACCOUNT_MISSING';
    recoverable_ratio := 0;
    return next; return;
  end if;

  if v_decl.recoverability = 'FULLY_RECOVERABLE' then
    recoverable_ratio := 1;
    v_recoverable := v_vat;
  else
    recoverable_ratio := v_decl.recoverable_ratio;
    v_recoverable := round(v_vat * v_decl.recoverable_ratio, p_decimals);
  end if;

  eligible := true;
  ineligible_reason := null;
  recoverable_amount := v_recoverable;
  non_recoverable_amount := v_vat - v_recoverable;
  input_tax_account_id := case when v_recoverable > 0 then v_account else null end;
  return next;
end;
$$;


ALTER FUNCTION "public"."compute_input_tax_split"("p_organization_id" "uuid", "p_expense_account_id" "uuid", "p_supplier_id" "uuid", "p_invoice_number" "text", "p_vat_amount" numeric, "p_decimals" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_service_charge_allocations"("p_levy_id" "uuid") RETURNS TABLE("unit_count" integer, "allocated_total" numeric, "levy_total" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_levy record;
  v_basis_sum numeric;
  v_missing_area int;
  v_decimals int;
  v_step numeric;
  v_shortfall_units int;
begin
  select * into v_levy from public.service_charge_levies where id = p_levy_id;

  if v_levy.id is null then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_FOUND: تحصيلة رسوم الخدمة غير موجودة' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_levy.organization_id, 'finance.service_charges.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة رسوم الخدمة' using errcode = '42501';
  end if;

  if v_levy.status <> 'DRAFT' then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_DRAFT: لا يمكن إعادة حساب توزيع تحصيلة صادرة' using errcode = 'P0001';
  end if;

  select public.currency_decimals(o.default_currency) into v_decimals
  from public.organizations o where o.id = v_levy.organization_id;
  v_decimals := coalesce(v_decimals, 2);
  v_step := power(10::numeric, -v_decimals);

  insert into public.service_charge_allocations (organization_id, levy_id, unit_id, basis_value)
  select v_levy.organization_id, v_levy.id, u.id,
         case v_levy.allocation_basis
           when 'AREA' then coalesce(u.area, 0)
           when 'EQUAL' then 1
           else coalesce(u.area, 0)
         end
  from public.units u
  where u.organization_id = v_levy.organization_id
    and u.property_id = v_levy.property_id
    and u.is_active
    and (not v_levy.handed_over_only or u.handed_over_at is not null)
  on conflict (levy_id, unit_id) do update
    set basis_value = case v_levy.allocation_basis
                        when 'AREA' then excluded.basis_value
                        when 'EQUAL' then 1
                        else public.service_charge_allocations.basis_value
                      end;

  delete from public.service_charge_allocations a
  where a.levy_id = v_levy.id
    and not exists (
      select 1 from public.units u
      where u.id = a.unit_id and u.is_active and u.property_id = v_levy.property_id
        and (not v_levy.handed_over_only or u.handed_over_at is not null)
    );

  if v_levy.allocation_basis = 'AREA' then
    select count(*) into v_missing_area
    from public.service_charge_allocations a
    join public.units u on u.id = a.unit_id
    where a.levy_id = v_levy.id and coalesce(u.area, 0) <= 0;

    if v_missing_area > 0 then
      raise exception
        'SERVICE_CHARGE_MISSING_AREA: % وحدة بلا مساحة مسجلة؛ سجّل مساحاتها أو استخدم أساس توزيع آخر', v_missing_area
        using errcode = 'P0001';
    end if;
  end if;

  select coalesce(sum(basis_value), 0) into v_basis_sum
  from public.service_charge_allocations where levy_id = v_levy.id;

  if v_basis_sum <= 0 then
    raise exception 'SERVICE_CHARGE_ZERO_BASIS: مجموع أساس التوزيع صفر؛ لا يمكن توزيع المبلغ' using errcode = 'P0001';
  end if;

  with computed as (
    select a.id,
           trunc(v_levy.total_amount * a.basis_value / v_basis_sum, v_decimals) as floor_amt
    from public.service_charge_allocations a
    where a.levy_id = v_levy.id
  )
  update public.service_charge_allocations a
  set share_amount = c.floor_amt
  from computed c
  where a.id = c.id;

  select round((v_levy.total_amount - coalesce(sum(share_amount), 0)) / v_step)::int
  into v_shortfall_units
  from public.service_charge_allocations where levy_id = v_levy.id;

  if v_shortfall_units > 0 then
    with ranked as (
      select a.id,
             row_number() over (
               order by (v_levy.total_amount * a.basis_value / v_basis_sum) - a.share_amount desc,
                        u.code
             ) as rn
      from public.service_charge_allocations a
      join public.units u on u.id = a.unit_id
      where a.levy_id = v_levy.id
    )
    update public.service_charge_allocations a
    set share_amount = a.share_amount + v_step
    from ranked r
    where a.id = r.id and r.rn <= v_shortfall_units;
  end if;

  return query
  select count(*)::int, coalesce(sum(a.share_amount), 0), v_levy.total_amount
  from public.service_charge_allocations a
  where a.levy_id = v_levy.id;
end;
$$;


ALTER FUNCTION "public"."compute_service_charge_allocations"("p_levy_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_to_base"("p_organization_id" "uuid", "p_amount" numeric, "p_currency" "text", "p_date" "date") RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_base text;
  v_rate numeric;
  v_rate_date date;
  v_scale int;
begin
  select default_currency into v_base from public.organizations where id = p_organization_id;
  if v_base is null then
    raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if upper(p_currency) = upper(v_base) then
    return p_amount;
  end if;

  select g.rate, g.rate_date into v_rate, v_rate_date
  from public.get_exchange_rate(p_organization_id, p_currency, v_base, p_date) g;

  if v_rate is null then
    raise exception
      'EXCHANGE_RATE_MISSING: لا يوجد سعر صرف لـ % مقابل % في % أو قبله — سجّل السعر أولًا',
      upper(p_currency), upper(v_base), p_date
      using errcode = 'P0001';
  end if;

  v_scale := public.currency_decimals(v_base);
  return round(p_amount * v_rate, v_scale);
end;
$$;


ALTER FUNCTION "public"."convert_to_base"("p_organization_id" "uuid", "p_amount" numeric, "p_currency" "text", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_cashbox"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_name" "text", "p_gl_account_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cashbox_id uuid;
  v_gl_category text;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إدارة الصناديق' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  select category into v_gl_category
  from public.chart_of_accounts
  where id = p_gl_account_id and organization_id = p_organization_id;
  if v_gl_category is null then
    raise exception 'GL_ACCOUNT_NOT_IN_ORGANIZATION: حساب الأستاذ المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if v_gl_category <> 'ASSET' then
    raise exception 'GL_ACCOUNT_NOT_ASSET: يجب اختيار حساب من نوع الأصول لصندوق نقدي' using errcode = '22023';
  end if;

  insert into public.cashboxes (organization_id, property_id, name, gl_account_id)
  values (p_organization_id, p_resort_id, trim(p_name), p_gl_account_id)
  returning id into v_cashbox_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'cashbox.created', 'cashbox', v_cashbox_id, jsonb_build_object('name', p_name));

  return v_cashbox_id;
end;
$$;


ALTER FUNCTION "public"."create_cashbox"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_name" "text", "p_gl_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_fiscal_year"("p_organization_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year_id uuid;
  v_period_start date;
  v_period_number int := 0;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.periods.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if p_end_date <= p_start_date then
    raise exception 'end date must be after start date';
  end if;

  insert into public.fiscal_years (organization_id, name, start_date, end_date)
  values (p_organization_id, p_name, p_start_date, p_end_date)
  returning id into v_year_id;

  v_period_start := p_start_date;
  while v_period_start <= p_end_date loop
    v_period_number := v_period_number + 1;
    insert into public.fiscal_periods (
      organization_id, fiscal_year_id, period_number, name, start_date, end_date
    ) values (
      p_organization_id,
      v_year_id,
      v_period_number,
      to_char(v_period_start, 'YYYY-MM'),
      v_period_start,
      least((v_period_start + interval '1 month' - interval '1 day')::date, p_end_date)
    );
    v_period_start := (v_period_start + interval '1 month')::date;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, 'fiscal_year.created', 'fiscal_year', v_year_id,
    jsonb_build_object('name', p_name, 'periods', v_period_number));

  return v_year_id;
end;
$$;


ALTER FUNCTION "public"."create_fiscal_year"("p_organization_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_installment_plan"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_buyer_member_id" "uuid", "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_total_price" numeric, "p_down_payment" numeric, "p_installment_count" integer, "p_installment_frequency" "text", "p_starts_on" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_property_id uuid;
  v_plan_id uuid;
  v_financed numeric;
  v_per_installment numeric;
  v_last_installment numeric;
  v_due_id uuid;
  v_pi_id uuid;
  v_due_date date;
  v_period interval;
  v_i int;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.installments.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة خطط التقسيط' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: المنظمة غير نشطة' using errcode = '22023';
  end if;

  select property_id into v_property_id
  from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_property_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if not exists (select 1 from public.members where id = p_buyer_member_id and organization_id = p_organization_id) then
    raise exception 'BUYER_NOT_FOUND: العضو غير موجود في هذا الكيان' using errcode = '22023';
  end if;
  if not exists (select 1 from public.due_types where id = p_due_type_id and organization_id = p_organization_id) then
    raise exception 'DUE_TYPE_NOT_FOUND: نوع الاستحقاق غير موجود في هذا الكيان' using errcode = '22023';
  end if;
  if not exists (select 1 from public.chart_of_accounts where id = p_receivable_account_id and organization_id = p_organization_id) then
    raise exception 'ACCOUNT_NOT_FOUND: حساب الذمم غير موجود في هذا الكيان' using errcode = '22023';
  end if;
  if p_down_payment > p_total_price then
    raise exception 'INVALID_DOWN_PAYMENT: الدفعة المقدمة أكبر من السعر الإجمالي' using errcode = '22023';
  end if;

  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact, start_date, created_by)
  values (p_organization_id, p_unit_id, p_buyer_member_id, 100, true, p_starts_on, auth.uid());

  begin
    insert into public.installment_plans (
      organization_id, property_id, unit_id, buyer_member_id, due_type_id, receivable_account_id,
      total_price, down_payment, installment_count, installment_frequency, starts_on, created_by
    ) values (
      p_organization_id, v_property_id, p_unit_id, p_buyer_member_id, p_due_type_id, p_receivable_account_id,
      p_total_price, p_down_payment, p_installment_count, p_installment_frequency, p_starts_on, auth.uid()
    ) returning id into v_plan_id;
  exception when unique_violation then
    raise exception 'UNIT_HAS_ACTIVE_PLAN: يوجد بالفعل خطة تقسيط نشطة لهذه الوحدة' using errcode = '22023';
  end;

  v_financed := p_total_price - p_down_payment;
  v_per_installment := round(v_financed / p_installment_count, 4);
  v_last_installment := v_financed - v_per_installment * (p_installment_count - 1);

  v_period := case p_installment_frequency
    when 'MONTHLY' then interval '1 month'
    when 'QUARTERLY' then interval '3 months'
    when 'YEARLY' then interval '1 year'
  end;

  if p_down_payment > 0 then
    insert into public.dues (
      organization_id, property_id, unit_id, due_type_id, receivable_account_id,
      amount, issue_date, due_date, description, status, source_type
    ) values (
      p_organization_id, v_property_id, p_unit_id, p_due_type_id, p_receivable_account_id,
      p_down_payment, p_starts_on, p_starts_on, 'دفعة مقدمة', 'ISSUED', 'INSTALLMENT_PLAN'
    ) returning id into v_due_id;

    insert into public.plan_installments (plan_id, due_id, sequence_no, principal_amount)
    values (v_plan_id, v_due_id, 0, p_down_payment)
    returning id into v_pi_id;

    update public.dues set source_id = v_pi_id where id = v_due_id;
  end if;

  for v_i in 1..p_installment_count loop
    v_due_date := case
      when p_down_payment > 0 then (p_starts_on + (v_i * v_period))::date
      else (p_starts_on + ((v_i - 1) * v_period))::date
    end;

    insert into public.dues (
      organization_id, property_id, unit_id, due_type_id, receivable_account_id,
      amount, issue_date, due_date, description, status, source_type
    ) values (
      p_organization_id, v_property_id, p_unit_id, p_due_type_id, p_receivable_account_id,
      case when v_i = p_installment_count then v_last_installment else v_per_installment end,
      v_due_date, v_due_date, 'قسط ' || v_i || ' من ' || p_installment_count, 'ISSUED', 'INSTALLMENT_PLAN'
    ) returning id into v_due_id;

    insert into public.plan_installments (plan_id, due_id, sequence_no, principal_amount)
    values (v_plan_id, v_due_id, v_i, case when v_i = p_installment_count then v_last_installment else v_per_installment end)
    returning id into v_pi_id;

    update public.dues set source_id = v_pi_id where id = v_due_id;
  end loop;

  perform public.append_financial_audit_event(
    p_organization_id, 'DUE_BATCH_ISSUED', 'installment_plan', v_property_id, v_plan_id, null, null, null,
    jsonb_build_object('installment_count', p_installment_count, 'total_price', p_total_price, 'down_payment', p_down_payment)
  );

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_property_id, 'installment_plan.created', 'installment_plan', v_plan_id,
    jsonb_build_object('unit_id', p_unit_id, 'buyer_member_id', p_buyer_member_id, 'total_price', p_total_price));

  return v_plan_id;
end;
$$;


ALTER FUNCTION "public"."create_installment_plan"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_buyer_member_id" "uuid", "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_total_price" numeric, "p_down_payment" numeric, "p_installment_count" integer, "p_installment_frequency" "text", "p_starts_on" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_journal_entry"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_description" "text", "p_source_type" "text", "p_lines" "jsonb", "p_idempotency_key" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إنشاء قيود محاسبية في هذا الموقع' using errcode = '42501';
  end if;

  return public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_entry_date,
    p_description, p_source_type, p_lines, p_idempotency_key
  );
end;
$$;


ALTER FUNCTION "public"."create_journal_entry"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_description" "text", "p_source_type" "text", "p_lines" "jsonb", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_journal_entry_internal"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_description" "text", "p_source_type" "text", "p_lines" "jsonb", "p_idempotency_key" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_entry_id uuid;
  v_line jsonb;
  v_line_number int := 0;
begin
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  if p_idempotency_key is not null then
    select id into v_entry_id
    from public.journal_entries
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_entry_id is not null then
      return v_entry_id;
    end if;
  end if;

  if not exists (
    select 1 from public.fiscal_periods
    where id = p_fiscal_period_id and organization_id = p_organization_id
  ) then
    raise exception 'fiscal period does not belong to this organization';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) < 1 then
    raise exception 'at least one line is required';
  end if;

  insert into public.journal_entries (
    organization_id, property_id, fiscal_period_id, entry_date, description,
    source_type, idempotency_key, created_by
  ) values (
    p_organization_id, p_resort_id, p_fiscal_period_id, p_entry_date, p_description,
    coalesce(p_source_type, 'JOURNAL_VOUCHER'), p_idempotency_key, auth.uid()
  )
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_number := v_line_number + 1;

    if not exists (
      select 1 from public.chart_of_accounts
      where id = (v_line ->> 'account_id')::uuid and organization_id = p_organization_id
    ) then
      raise exception 'account does not belong to this organization';
    end if;

    insert into public.journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit, credit, cost_center_id, project_id
    ) values (
      v_entry_id,
      v_line_number,
      (v_line ->> 'account_id')::uuid,
      v_line ->> 'description',
      coalesce((v_line ->> 'debit')::numeric(19, 4), 0),
      coalesce((v_line ->> 'credit')::numeric(19, 4), 0),
      nullif(v_line ->> 'cost_center_id', '')::uuid,
      nullif(v_line ->> 'project_id', '')::uuid
    );
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'journal_entry.created', 'journal_entry', v_entry_id,
    jsonb_build_object('line_count', v_line_number));

  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."create_journal_entry_internal"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_description" "text", "p_source_type" "text", "p_lines" "jsonb", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_member_invitation"("p_member_id" "uuid") RETURNS TABLE("invitation_id" "uuid", "raw_token" "uuid", "invite_email" "text", "member_email" "text", "member_phone" "text", "is_synthetic_email" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_member public.members;
  v_token uuid;
  v_invitation_id uuid;
  v_invite_email text;
  v_is_synthetic boolean := false;
begin
  select * into v_member from public.members where id = p_member_id;
  if v_member.id is null then
    raise exception 'MEMBER_NOT_FOUND: العضو غير موجود' using errcode = '22023';
  end if;

  if not public.has_permission(auth.uid(), v_member.organization_id, 'members.portal.invite') then
    raise exception 'FORBIDDEN_PORTAL_INVITE: لا تملك صلاحية دعوة الأعضاء للبوابة' using errcode = '42501';
  end if;

  if (v_member.email is null or btrim(v_member.email) = '')
     and (v_member.phone is null or btrim(v_member.phone) = '') then
    raise exception 'MEMBER_CONTACT_REQUIRED: يجب أن يكون للعضو بريد إلكتروني أو رقم هاتف مسجل قبل الدعوة' using errcode = '22023';
  end if;

  if v_member.user_id is not null then
    raise exception 'MEMBER_ALREADY_LINKED: هذا العضو لديه حساب بوابة بالفعل' using errcode = '22023';
  end if;

  if v_member.email is not null and btrim(v_member.email) <> '' then
    v_invite_email := lower(btrim(v_member.email));
  else
    -- Deterministic per-member placeholder; never sent anywhere, only used
    -- as the auth.users identity behind the WhatsApp-delivered link.
    v_invite_email := 'member-' || replace(p_member_id::text, '-', '') || '@invite.aqarbooks.local';
    v_is_synthetic := true;
  end if;

  update public.member_invitations
  set status = 'revoked'
  where member_id = p_member_id and status = 'pending';

  v_token := gen_random_uuid();

  insert into public.member_invitations (
    organization_id, member_id, email, token_hash, expires_at, invited_by
  ) values (
    v_member.organization_id, p_member_id, v_invite_email,
    encode(digest(v_token::text, 'sha256'), 'hex'),
    now() + interval '72 hours',
    auth.uid()
  )
  returning id into v_invitation_id;

  return query select v_invitation_id, v_token, v_invite_email, v_member.email, v_member.phone, v_is_synthetic;
end;
$$;


ALTER FUNCTION "public"."create_member_invitation"("p_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_online_payment_checkout_transaction"("p_due_ids" "uuid"[], "p_provider" "text") RETURNS TABLE("transaction_id" "uuid", "amount" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_member_id uuid := public.current_member_id();
  v_due record;
  v_organization_id uuid;
  v_resort_id uuid;
  v_total numeric(19,4) := 0;
  v_matched_count integer := 0;
  v_transaction_id uuid;
begin
  if v_member_id is null then
    raise exception 'NOT_A_PORTAL_MEMBER: لست مسجّلاً كمالك في هذا النظام' using errcode = '42501';
  end if;
  if p_provider not in ('FAWRY') then
    raise exception 'INVALID_PROVIDER: مزود الدفع غير معروف أو غير مُفعّل حاليًا' using errcode = '22023';
  end if;
  if p_due_ids is null or array_length(p_due_ids, 1) is null then
    raise exception 'NO_DUES_SELECTED: يرجى اختيار استحقاق واحد على الأقل' using errcode = '22023';
  end if;

  for v_due in
    select d.* from public.dues d
    where d.id = any(p_due_ids)
      and exists (
        select 1 from public.unit_ownerships uo
        where uo.unit_id = d.unit_id and uo.member_id = v_member_id
          and (uo.end_date is null or uo.end_date >= current_date)
      )
  loop
    if v_due.status in ('VOID', 'PAID') then
      raise exception 'DUE_NOT_PAYABLE: الاستحقاق % لم يعد قابلاً للسداد', v_due.id using errcode = '22023';
    end if;
    if v_organization_id is null then
      v_organization_id := v_due.organization_id;
      v_resort_id := v_due.property_id;
    elsif v_due.property_id <> v_resort_id then
      raise exception 'CROSS_RESORT_NOT_ALLOWED: لا يمكن دمج استحقاقات من مواقع مختلفة في عملية دفع واحدة' using errcode = '22023';
    end if;
    v_total := v_total + v_due.amount;
    v_matched_count := v_matched_count + 1;
  end loop;

  if v_matched_count <> array_length(p_due_ids, 1) then
    raise exception 'SOME_DUES_NOT_FOUND_OR_NOT_OWNED: بعض الاستحقاقات غير موجودة أو غير مملوكة لك' using errcode = '22023';
  end if;

  -- Double-booking guard (Task 4 fix) -- placed AFTER the ownership/status/
  -- cross-resort loop so a due that's VOID/PAID/not-owned still surfaces
  -- its own specific error first, but BEFORE the insert below.
  if public.due_ids_have_pending_online_checkout(p_due_ids) then
    raise exception 'DUE_HAS_PENDING_CHECKOUT: يوجد بالفعل عملية دفع معلّقة لأحد الاستحقاقات المختارة، يرجى الانتظار أو إعادة المحاولة لاحقًا' using errcode = '22023';
  end if;

  insert into public.online_payment_transactions (
    organization_id, property_id, member_id, client_request_id, provider, amount, expires_at
  ) values (
    v_organization_id, v_resort_id, v_member_id, gen_random_uuid()::text, p_provider, v_total, now() + interval '20 minutes'
  )
  returning id into v_transaction_id;

  insert into public.online_payment_transaction_allocations (transaction_id, due_id, amount)
  select v_transaction_id, d.id, d.amount from public.dues d where d.id = any(p_due_ids);

  return query select v_transaction_id, v_total;
end;
$$;


ALTER FUNCTION "public"."create_online_payment_checkout_transaction"("p_due_ids" "uuid"[], "p_provider" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text", "p_default_currency" "text", "p_plan_key" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org_id uuid;
  v_plan_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, default_currency, created_by, updated_by)
  values (p_name, p_slug, coalesce(p_default_currency, 'EGP'), auth.uid(), auth.uid())
  returning id into v_org_id;

  perform public.clone_tenant_role_templates(v_org_id);

  if p_plan_key is not null then
    select id into v_plan_id from public.plans where key = p_plan_key;
    if v_plan_id is not null then
      insert into public.subscriptions (organization_id, plan_id, created_by)
      values (v_org_id, v_plan_id, auth.uid());
    end if;
  end if;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_org_id, 'organization.created', 'organization', v_org_id,
    jsonb_build_object('name', p_name, 'slug', p_slug, 'plan_key', p_plan_key));

  return v_org_id;
end;
$$;


ALTER FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text", "p_default_currency" "text", "p_plan_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organization_onboarding"("p_org_name" "text", "p_entity_type" "text", "p_entity_type_custom_label" "text" DEFAULT NULL::"text", "p_resort_name" "text" DEFAULT NULL::"text", "p_resort_code" "text" DEFAULT NULL::"text", "p_timezone" "text" DEFAULT 'Africa/Cairo'::"text", "p_default_currency" "text" DEFAULT 'EGP'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_actor_id uuid;
  v_user_record record;
  v_clean_org_name text;
  v_clean_entity_type text;
  v_clean_custom_label text;
  v_clean_resort_name text;
  v_clean_resort_code text;
  v_slug text;
  v_base_slug text;
  v_counter integer := 1;
  v_org_id uuid;
  v_resort_id uuid;
  v_owner_role_id uuid;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: يرجى تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  SELECT id, email, email_confirmed_at INTO v_user_record
  FROM auth.users WHERE id = v_actor_id;

  IF v_user_record.id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: حساب المستخدم غير موجود' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = v_actor_id AND status IN ('active', 'invited')
  ) THEN
    RAISE EXCEPTION 'ALREADY_HAS_ORGANIZATION: الحساب ينتمي لكيان مؤسسي بالفعل' USING ERRCODE = '42501';
  END IF;

  v_clean_org_name := trim(COALESCE(p_org_name, ''));
  IF char_length(v_clean_org_name) < 2 OR char_length(v_clean_org_name) > 150 THEN
    RAISE EXCEPTION 'INVALID_ORG_NAME: اسم الكيان يجب أن يكون بين 2 و 150 حرفاً' USING ERRCODE = '22023';
  END IF;

  v_clean_entity_type := upper(trim(COALESCE(p_entity_type, '')));
  IF v_clean_entity_type NOT IN (
    'DEVELOPER','FACILITY_MANAGEMENT','OWNERS_ASSOCIATION','INDIVIDUAL_OWNER',
    'TOURIST_RESORT','TOURIST_VILLAGE','RESIDENTIAL_COMPOUND','OTHER'
  ) THEN
    RAISE EXCEPTION 'INVALID_ENTITY_TYPE: نوع الكيان المحدد غير مدعوم' USING ERRCODE = '22023';
  END IF;

  IF v_clean_entity_type = 'OTHER' THEN
    v_clean_custom_label := trim(COALESCE(p_entity_type_custom_label, ''));
    IF char_length(v_clean_custom_label) < 2 THEN
      RAISE EXCEPTION 'CUSTOM_LABEL_REQUIRED: يرجى إدخال وصف نوع الكيان عند اختيار "أخرى"' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_clean_custom_label := NULL;
  END IF;

  v_clean_resort_name := trim(COALESCE(p_resort_name, ''));
  IF char_length(v_clean_resort_name) < 2 THEN
    RAISE EXCEPTION 'INVALID_RESORT_NAME: اسم المشروع/المنتجع مطلوب' USING ERRCODE = '22023';
  END IF;

  v_clean_resort_code := upper(trim(COALESCE(p_resort_code, '')));
  IF char_length(v_clean_resort_code) < 2 THEN
    v_clean_resort_code := 'RES-01';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('onboarding_' || v_actor_id::text));

  v_base_slug := lower(regexp_replace(v_clean_org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug IS NULL OR char_length(v_base_slug) < 2 THEN
    v_base_slug := 'entity-' || lower(substr(md5(random()::text), 1, 8));
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter::text;
  END LOOP;

  INSERT INTO public.organizations (
    name, slug, default_currency, entity_type,
    entity_type_custom_label, status, created_by, updated_by
  ) VALUES (
    v_clean_org_name, v_slug, COALESCE(p_default_currency, 'EGP'),
    v_clean_entity_type, v_clean_custom_label,
    'ACTIVE', v_actor_id, v_actor_id
  ) RETURNING id INTO v_org_id;

  -- استنساخ قوالب الأدوار (يُنشئ TENANT_OWNER مرتبطاً بهذا الكيان)
  PERFORM public.clone_tenant_role_templates(v_org_id);

  INSERT INTO public.resorts (
    organization_id, name, code, timezone, created_by, updated_by
  ) VALUES (
    v_org_id, v_clean_resort_name, v_clean_resort_code,
    COALESCE(p_timezone, 'Africa/Cairo'), v_actor_id, v_actor_id
  ) RETURNING id INTO v_resort_id;

  INSERT INTO public.organization_memberships (organization_id, user_id, status)
  VALUES (v_org_id, v_actor_id, 'active');

  -- جلب TENANT_OWNER بعد الاستنساخ (وليس قبله)
  SELECT id INTO v_owner_role_id
  FROM public.roles
  WHERE key = 'TENANT_OWNER' AND organization_id = v_org_id
  LIMIT 1;

  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_CLONE_FAILED: فشل استنساخ أدوار الكيان' USING ERRCODE = '50000';
  END IF;

  INSERT INTO public.user_role_assignments (
    user_id, role_id, organization_id, property_id, created_by
  ) VALUES (v_actor_id, v_owner_role_id, v_org_id, NULL, v_actor_id);

  INSERT INTO public.platform_audit_logs (
    actor_id, organization_id, action, entity_type, entity_id, safe_change_summary
  ) VALUES (
    v_actor_id, v_org_id, 'organization.onboarding_completed',
    'organization', v_org_id,
    jsonb_build_object(
      'name', v_clean_org_name,
      'entity_type', v_clean_entity_type,
      'resort_id', v_resort_id,
      'slug', v_slug
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org_id,
    'resort_id', v_resort_id,
    'slug', v_slug
  );
END;
$$;


ALTER FUNCTION "public"."create_organization_onboarding"("p_org_name" "text", "p_entity_type" "text", "p_entity_type_custom_label" "text", "p_resort_name" "text", "p_resort_code" "text", "p_timezone" "text", "p_default_currency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_purchase_order"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_request_id" "uuid", "p_description" "text", "p_amount" numeric, "p_order_date" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order_id uuid;
begin
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if not public.has_financial_permission(p_organization_id, 'purchasing.requests.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إنشاء أمر شراء في هذا الموقع' using errcode = '42501';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = p_organization_id) then
    raise exception 'supplier does not belong to this organization';
  end if;
  if p_purchase_request_id is not null and not exists (
    select 1 from public.purchase_requests
    where id = p_purchase_request_id and organization_id = p_organization_id and status = 'APPROVED'
  ) then
    raise exception 'purchase request must be an approved request belonging to this organization';
  end if;

  insert into public.purchase_orders (
    organization_id, property_id, supplier_id, purchase_request_id, description, amount, order_date, created_by
  ) values (
    p_organization_id, p_resort_id, p_supplier_id, p_purchase_request_id, p_description, p_amount, p_order_date, auth.uid()
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;


ALTER FUNCTION "public"."create_purchase_order"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_request_id" "uuid", "p_description" "text", "p_amount" numeric, "p_order_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_purchase_request"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_description" "text", "p_estimated_amount" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_request_id uuid;
begin
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if not public.has_financial_permission(p_organization_id, 'purchasing.requests.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إنشاء طلب شراء في هذا الموقع' using errcode = '42501';
  end if;
  if p_estimated_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into public.purchase_requests (organization_id, property_id, description, estimated_amount, requested_by)
  values (p_organization_id, p_resort_id, p_description, p_estimated_amount, auth.uid())
  returning id into v_request_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id)
  values (auth.uid(), p_organization_id, p_resort_id, 'purchase_request.created', 'purchase_request', v_request_id);

  return v_request_id;
end;
$$;


ALTER FUNCTION "public"."create_purchase_request"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_description" "text", "p_estimated_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_resort"("p_organization_id" "uuid", "p_name" "text", "p_code" "text", "p_timezone" "text", "p_address" "text" DEFAULT NULL::"text", "p_governorate" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'tenant.settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  insert into public.resorts (organization_id, name, code, timezone, address, governorate, phone, email, created_by, updated_by)
  values (p_organization_id, p_name, p_code, coalesce(p_timezone, 'Africa/Cairo'), p_address, p_governorate, p_phone, p_email, auth.uid(), auth.uid())
  returning id into v_resort_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'resort.created', 'resort', v_resort_id,
    jsonb_build_object('name', p_name, 'code', p_code));

  return v_resort_id;
end;
$$;


ALTER FUNCTION "public"."create_resort"("p_organization_id" "uuid", "p_name" "text", "p_code" "text", "p_timezone" "text", "p_address" "text", "p_governorate" "text", "p_phone" "text", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_tax_rule_draft"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_effective_from" "date", "p_e_document_type" "text", "p_issuer_scope" "text", "p_legal_reference" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_is_derived boolean;
  v_version integer;
  v_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'FORBIDDEN_TAX_RULE_ADMIN: إدارة القواعد الضريبية لمشرف المنصة وحده'
      using errcode = '42501';
  end if;

  select is_derived into v_is_derived from public.revenue_natures where code = p_revenue_nature;
  if v_is_derived is null then
    raise exception 'REVENUE_NATURE_UNKNOWN: طبيعة إيراد غير معروفة (%)', p_revenue_nature
      using errcode = '22023';
  end if;

  if v_is_derived then
    raise exception
      'REVENUE_NATURE_DERIVED: (%) نوع مشتق يرث التوريد الأصلي؛ لا تُوضع له قاعدة مستقلة', p_revenue_nature
      using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.tax_rule_versions
  where jurisdiction = p_jurisdiction and revenue_nature = p_revenue_nature;

  insert into public.tax_rule_versions (
    jurisdiction, revenue_nature, tax_treatment, vat_rate, effective_from,
    e_document_type, issuer_scope, version, rule_hash, status, legal_reference, created_by
  ) values (
    p_jurisdiction, p_revenue_nature, p_tax_treatment, p_vat_rate, p_effective_from,
    p_e_document_type, p_issuer_scope, v_version, '', 'DRAFT', p_legal_reference, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."create_tax_rule_draft"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_effective_from" "date", "p_e_document_type" "text", "p_issuer_scope" "text", "p_legal_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_unit_lease"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_tenant_member_id" "uuid", "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_rent_amount" numeric, "p_rent_frequency" "text", "p_starts_on" "date", "p_ends_on" "date" DEFAULT NULL::"date", "p_security_deposit_amount" numeric DEFAULT 0, "p_billing_recipient" "text" DEFAULT 'TENANT'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_property_id uuid;
  v_lease_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: المنظمة غير نشطة' using errcode = '22023';
  end if;

  select property_id into v_property_id
  from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_property_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if not exists (select 1 from public.members where id = p_tenant_member_id and organization_id = p_organization_id) then
    raise exception 'TENANT_NOT_FOUND: العضو غير موجود في هذا الكيان' using errcode = '22023';
  end if;

  if not exists (select 1 from public.due_types where id = p_due_type_id and organization_id = p_organization_id) then
    raise exception 'DUE_TYPE_NOT_FOUND: نوع الاستحقاق غير موجود في هذا الكيان' using errcode = '22023';
  end if;

  if not exists (select 1 from public.chart_of_accounts where id = p_receivable_account_id and organization_id = p_organization_id) then
    raise exception 'ACCOUNT_NOT_FOUND: حساب الذمم غير موجود في هذا الكيان' using errcode = '22023';
  end if;

  insert into public.unit_leases (
    organization_id, property_id, unit_id, tenant_member_id, status,
    due_type_id, receivable_account_id,
    starts_on, ends_on, rent_amount, rent_frequency, security_deposit_amount,
    billing_recipient, created_by
  ) values (
    p_organization_id, v_property_id, p_unit_id, p_tenant_member_id, 'DRAFT',
    p_due_type_id, p_receivable_account_id,
    p_starts_on, p_ends_on, p_rent_amount, p_rent_frequency, p_security_deposit_amount,
    p_billing_recipient, auth.uid()
  ) returning id into v_lease_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_property_id, 'unit_lease.created', 'unit_lease', v_lease_id,
    jsonb_build_object('unit_id', p_unit_id, 'tenant_member_id', p_tenant_member_id, 'rent_amount', p_rent_amount));

  return v_lease_id;
end;
$$;


ALTER FUNCTION "public"."create_unit_lease"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_tenant_member_id" "uuid", "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_rent_amount" numeric, "p_rent_frequency" "text", "p_starts_on" "date", "p_ends_on" "date", "p_security_deposit_amount" numeric, "p_billing_recipient" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."creditable_remaining"("p_due_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select td.gross_amount
     from public.tax_decisions td
     where td.source_type = 'DUE' and td.source_id = p_due_id
       and td.reverses_decision_id is null
       and not exists (
         select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
     order by td.decided_at desc limit 1), 0)
  - coalesce(
    (select sum(cn.gross_amount) from public.credit_notes cn
     where cn.source_type = 'DUE' and cn.source_id = p_due_id
       and cn.document_type = 'CREDIT_NOTE'), 0);
$$;


ALTER FUNCTION "public"."creditable_remaining"("p_due_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."currency_decimals"("p_currency" "text") RETURNS integer
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'public'
    AS $$
  select case upper(coalesce(p_currency, ''))
    when 'KWD' then 3
    when 'BHD' then 3
    when 'OMR' then 3
    when 'JOD' then 3
    when 'TND' then 3
    when 'LYD' then 3
    when 'IQD' then 3
    when 'JPY' then 0
    when 'KRW' then 0
    when 'VND' then 0
    else 2
  end;
$$;


ALTER FUNCTION "public"."currency_decimals"("p_currency" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."currency_decimals"("p_currency" "text") IS 'ISO 4217 minor-unit exponent. Money rounding must use this rather than assuming 2, or fils-denominated currencies (KWD/BHD/OMR) mis-allocate.';



CREATE OR REPLACE FUNCTION "public"."current_member_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id from public.members where user_id = auth.uid();
$$;


ALTER FUNCTION "public"."current_member_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decide_purchase_request"("p_request_id" "uuid", "p_approve" boolean, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_request public.purchase_requests;
begin
  select * into v_request from public.purchase_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'purchase request not found';
  end if;
  if not public.has_permission(auth.uid(), v_request.organization_id, 'purchasing.orders.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_request.status <> 'SUBMITTED' then
    raise exception 'only a submitted request can be decided';
  end if;

  update public.purchase_requests
  set status = case when p_approve then 'APPROVED' else 'REJECTED' end, approved_by = auth.uid()
  where id = p_request_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason)
  values (auth.uid(), v_request.organization_id, v_request.property_id,
    case when p_approve then 'purchase_request.approved' else 'purchase_request.rejected' end,
    'purchase_request', p_request_id, p_reason);
end;
$$;


ALTER FUNCTION "public"."decide_purchase_request"("p_request_id" "uuid", "p_approve" boolean, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_resort"("p_resort_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_organization_id uuid;
  v_unit_count int;
begin
  select organization_id into v_organization_id from public.resorts where id = p_resort_id;
  if v_organization_id is null then
    raise exception 'resort not found';
  end if;

  if not public.has_permission(auth.uid(), v_organization_id, 'tenant.settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(*) into v_unit_count from public.units where property_id = p_resort_id;
  if v_unit_count > 0 then
    raise exception 'resort_has_units';
  end if;

  -- resort_id left null here (not p_resort_id): the row below survives the
  -- delete on the next line, and platform_audit_logs.resort_id has a plain
  -- (non-cascading) FK to resorts, so it would otherwise block the delete.
  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_organization_id, 'resort.deleted', 'resort', p_resort_id, '{}'::jsonb);

  delete from public.resorts where id = p_resort_id;
end;
$$;


ALTER FUNCTION "public"."delete_resort"("p_resort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."depreciable_remaining"("p_asset_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select (a.acquisition_cost - a.salvage_value)
       - coalesce((select sum(d.amount) from public.fixed_asset_depreciation d
                   where d.fixed_asset_id = a.id), 0)
  from public.fixed_assets a
  where a.id = p_asset_id;
$$;


ALTER FUNCTION "public"."depreciable_remaining"("p_asset_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."depreciation_for_period"("p_asset_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_asset public.fixed_assets;
  v_currency text;
  v_scale int;
  v_monthly numeric;
  v_remaining numeric;
  v_posted int;
begin
  select * into v_asset from public.fixed_assets where id = p_asset_id;
  if not found then
    raise exception 'FIXED_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;

  select default_currency into v_currency from public.organizations where id = v_asset.organization_id;
  v_scale := public.currency_decimals(coalesce(v_currency, 'EGP'));

  v_remaining := public.depreciable_remaining(p_asset_id);
  if v_remaining <= 0 then
    return 0;
  end if;

  v_monthly := round(
    (v_asset.acquisition_cost - v_asset.salvage_value) / v_asset.useful_life_months,
    v_scale
  );

  select count(*) into v_posted
  from public.fixed_asset_depreciation d where d.fixed_asset_id = p_asset_id;

  -- القسط الأخير يأخذ **الباقي كاملًا**، ويُعرَف بعدّ الأقساط لا بمقارنة المبالغ.
  -- المقارنة (الباقي < القسط) كانت خاطئة: بعد ستة أقساط من 1285.71 يبقى 1285.74،
  -- وهو أكبر من القسط لا أصغر، فيأخذ القسط المقرَّب ويتبقّى 0.03 يمدّ الأصل إلى
  -- شهر ثامن — أي أن العمر الإنتاجي المُدخل يُنتهك بفعل التقريب وحده.
  if v_posted + 1 >= v_asset.useful_life_months then
    return v_remaining;
  end if;

  -- وإن نقص الباقي عن قسط كامل لأي سبب آخر، يؤخذ كما هو.
  if v_remaining < v_monthly then
    return v_remaining;
  end if;

  return v_monthly;
end;
$$;


ALTER FUNCTION "public"."depreciation_for_period"("p_asset_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."disable_payment_provider"("p_settings_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id from public.payment_provider_settings where id = p_settings_id;
  if v_org_id is null or not public.has_permission(auth.uid(), v_org_id, 'finance.online_payments.manage') then
    raise exception 'FORBIDDEN: لا تملك صلاحية إدارة مزودي الدفع' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_org_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  update public.payment_provider_settings
  set status = 'DISABLED', enabled = false, updated_by = auth.uid()
  where id = p_settings_id;
end;
$$;


ALTER FUNCTION "public"."disable_payment_provider"("p_settings_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispose_fixed_asset"("p_asset_id" "uuid", "p_disposal_date" "date", "p_proceeds" numeric, "p_proceeds_account_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_asset public.fixed_assets;
  v_ready boolean;
  v_gain uuid;
  v_loss uuid;
  v_reason text;
  v_period public.fiscal_periods;
  v_accumulated numeric;
  v_nbv numeric;
  v_result numeric;
  v_scale int;
  v_currency text;
  v_lines jsonb;
  v_entry_id uuid;
begin
  select * into v_asset from public.fixed_assets where id = p_asset_id;
  if not found then
    raise exception 'FIXED_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_asset.organization_id, 'finance.assets.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك باستبعاد الأصول'
      using errcode = '42501';
  end if;

  if v_asset.status = 'DISPOSED' then
    raise exception 'ASSET_ALREADY_DISPOSED: الأصل (%) مستبعَد بالفعل بتاريخ %',
      v_asset.code, v_asset.disposal_date
      using errcode = 'P0001';
  end if;

  if p_proceeds < 0 then
    raise exception 'DISPOSAL_PROCEEDS_NEGATIVE: المتحصلات لا تكون سالبة'
      using errcode = '22023';
  end if;

  if p_disposal_date < v_asset.acquisition_date then
    raise exception
      'DISPOSAL_BEFORE_ACQUISITION: تاريخ الاستبعاد (%) قبل تاريخ الاقتناء (%)',
      p_disposal_date, v_asset.acquisition_date
      using errcode = '22023';
  end if;

  select r.ready, r.gain_account_id, r.loss_account_id, r.reason
  into v_ready, v_gain, v_loss, v_reason
  from public.check_asset_disposal_readiness(v_asset.organization_id) r;

  if not v_ready then
    raise exception '%: عيّن حسابي أرباح وخسائر الاستبعاد قبل استبعاد أي أصل', v_reason
      using errcode = 'P0001';
  end if;

  select * into v_period from public.fiscal_periods fp
  where fp.organization_id = v_asset.organization_id
    and fp.status = 'OPEN'
    and p_disposal_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  if v_period.id is null then
    raise exception
      'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي تاريخ الاستبعاد (%)', p_disposal_date
      using errcode = 'P0001';
  end if;

  select coalesce(sum(d.amount), 0) into v_accumulated
  from public.fixed_asset_depreciation d where d.fixed_asset_id = p_asset_id;

  select o.default_currency into v_currency
  from public.organizations o where o.id = v_asset.organization_id;
  v_scale := public.currency_decimals(coalesce(v_currency, 'EGP'));

  v_nbv := round(v_asset.acquisition_cost - v_accumulated, v_scale);
  v_result := round(p_proceeds - v_nbv, v_scale);

  v_lines := jsonb_build_array();
  if v_accumulated > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_asset.accumulated_depreciation_account_id,
                         'debit', v_accumulated, 'credit', 0));
  end if;
  if p_proceeds > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', p_proceeds_account_id,
                         'debit', p_proceeds, 'credit', 0));
  end if;
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('account_id', v_asset.asset_account_id,
                       'debit', 0, 'credit', v_asset.acquisition_cost));

  if v_result > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_gain, 'debit', 0, 'credit', v_result));
  elsif v_result < 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_loss, 'debit', -v_result, 'credit', 0));
  end if;

  v_entry_id := public.create_journal_entry_internal(
    v_asset.organization_id,
    v_asset.property_id,
    v_period.id,
    p_disposal_date,
    'Disposal — ' || v_asset.code || ' ' || v_asset.name_en
      || coalesce(' — ' || p_reason, ''),
    'JOURNAL_VOUCHER',
    v_lines,
    'asset_disposal:' || p_asset_id::text
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.fixed_assets
  set status = 'DISPOSED',
      disposal_date = p_disposal_date,
      disposal_proceeds = p_proceeds
  where id = p_asset_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_asset.organization_id, 'fixed_asset.disposed', 'fixed_asset', p_asset_id,
    jsonb_build_object('code', v_asset.code, 'cost', v_asset.acquisition_cost,
      'accumulated', v_accumulated, 'net_book_value', v_nbv,
      'proceeds', p_proceeds, 'result', v_result, 'journal_entry_id', v_entry_id)
  );

  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."dispose_fixed_asset"("p_asset_id" "uuid", "p_disposal_date" "date", "p_proceeds" numeric, "p_proceeds_account_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."due_ids_have_pending_online_checkout"("p_due_ids" "uuid"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.online_payment_transaction_allocations opta
    join public.online_payment_transactions opt on opt.id = opta.transaction_id
    where opta.due_id = any(p_due_ids)
      and opt.status = 'PENDING'
      and opt.expires_at > now()
  );
$$;


ALTER FUNCTION "public"."due_ids_have_pending_online_checkout"("p_due_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."due_outstanding"("p_due_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select d.amount - coalesce((
    select sum(a.amount) from public.payment_allocations a
    join public.payments p on p.id = a.payment_id
    where a.due_id = d.id and p.status = 'POSTED' and a.reversed_at is null
  ), 0)
  from public.dues d where d.id = p_due_id;
$$;


ALTER FUNCTION "public"."due_outstanding"("p_due_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enable_payment_provider"("p_settings_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.payment_provider_settings;
begin
  select * into v_row from public.payment_provider_settings where id = p_settings_id;
  if v_row.id is null or not public.has_permission(auth.uid(), v_row.organization_id, 'finance.online_payments.manage') then
    raise exception 'FORBIDDEN: لا تملك صلاحية إدارة مزودي الدفع' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_row.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if v_row.status <> 'VERIFIED' then
    raise exception 'NOT_VERIFIED: يجب اجتياز التحقق أولاً قبل التفعيل' using errcode = '22023';
  end if;
  if v_row.provider = 'PAYMOB' and v_row.environment = 'PRODUCTION' then
    raise exception 'PAYMOB_PRODUCTION_BLOCKED: Paymob غير مُفعّل للإنتاج بعد -- راجع خطة التحقق المستقلة' using errcode = '22023';
  end if;

  update public.payment_provider_settings
  set status = 'ENABLED', enabled = true, updated_by = auth.uid()
  where id = p_settings_id;
end;
$$;


ALTER FUNCTION "public"."enable_payment_provider"("p_settings_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."end_unit_lease"("p_lease_id" "uuid", "p_ends_on" "date", "p_end_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lease public.unit_leases;
begin
  select * into v_lease from public.unit_leases where id = p_lease_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_lease.organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;
  if v_lease.status <> 'ACTIVE' then
    raise exception 'ILLEGAL_TRANSITION: لا يمكن إنهاء عقد ليس نشطًا (الحالة الحالية: %)', v_lease.status
      using errcode = '22023';
  end if;
  if p_end_reason is null or trim(p_end_reason) = '' then
    raise exception 'END_REASON_REQUIRED: يجب إدخال سبب إنهاء العقد' using errcode = '22023';
  end if;
  if p_ends_on < v_lease.starts_on then
    raise exception 'INVALID_END_DATE: تاريخ الإنهاء يجب أن يكون بعد تاريخ البداية' using errcode = '22023';
  end if;

  update public.unit_leases
  set status = 'ENDED', ends_on = p_ends_on, ended_by = auth.uid(), ended_at = now(), end_reason = p_end_reason
  where id = p_lease_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_lease.organization_id, v_lease.property_id, 'unit_lease.ended', 'unit_lease', p_lease_id,
    jsonb_build_object('ends_on', p_ends_on, 'end_reason', p_end_reason));
end;
$$;


ALTER FUNCTION "public"."end_unit_lease"("p_lease_id" "uuid", "p_ends_on" "date", "p_end_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_stale_member_invitations"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer;
begin
  with expired as (
    update public.member_invitations
    set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning id
  )
  select count(*) into v_count from expired;

  delete from public.member_invitation_short_links sl
  using public.member_invitations mi
  where sl.invitation_id = mi.id
    and mi.status <> 'pending';

  return v_count;
end;
$$;


ALTER FUNCTION "public"."expire_stale_member_invitations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_stale_online_payment_transactions"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with expired as (
    -- failed_at doubles as "left PENDING for a non-PAID terminal state"
    -- rather than adding a third timestamp column -- failure_code/
    -- failure_message stay null here since a plain timeout has no provider
    -- failure code to record, distinguishing it from a provider-reported
    -- failure (which would set failure_code/failure_message alongside
    -- failed_at via the future webhook path, not this sweep).
    update public.online_payment_transactions
    set status = 'EXPIRED', failed_at = now()
    where status = 'PENDING' and expires_at < now()
    returning id
  )
  select count(*)::integer from expired;
$$;


ALTER FUNCTION "public"."expire_stale_online_payment_transactions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_bank_reconciliation"("p_statement_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
  v_status text;
  v_difference numeric;
  v_tolerance numeric;
begin
  select organization_id, status into v_org, v_status
  from public.bank_statements where id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك باعتماد المطابقة البنكية' using errcode = '42501';
  end if;

  if v_status <> 'DRAFT' then
    raise exception 'BANK_STATEMENT_NOT_DRAFT: كشف الحساب معتمد بالفعل' using errcode = 'P0001';
  end if;

  select difference into v_difference
  from public.get_bank_reconciliation_summary(p_statement_id);

  select power(10::numeric, -public.currency_decimals(o.default_currency)) / 2
  into v_tolerance
  from public.organizations o where o.id = v_org;
  v_tolerance := coalesce(v_tolerance, 0.005);

  if abs(v_difference) >= v_tolerance then
    raise exception 'RECONCILIATION_NOT_BALANCED: لا يمكن اعتماد المطابقة والفرق % غير صفري', v_difference
      using errcode = 'P0001';
  end if;

  update public.bank_statements
  set status = 'RECONCILED',
      reconciled_at = now(),
      reconciled_by = auth.uid()
  where id = p_statement_id;
end;
$$;


ALTER FUNCTION "public"."finalize_bank_reconciliation"("p_statement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forbid_online_txn_mutation_after_pending"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status <> 'PENDING' and (
    new.amount <> old.amount or
    new.organization_id <> old.organization_id or
    new.property_id <> old.property_id or
    new.member_id <> old.member_id or
    new.provider <> old.provider
  ) then
    raise exception 'ONLINE_TXN_IMMUTABLE: cannot modify a settled transaction''s identity or amount' using errcode = '22023';
  end if;

  if old.status <> 'PENDING' and new.status <> old.status then
    raise exception 'ONLINE_TXN_INVALID_TRANSITION: cannot change status of a % transaction', old.status using errcode = '22023';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."forbid_online_txn_mutation_after_pending"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_lease_rent_dues"("p_organization_id" "uuid", "p_lease_id" "uuid", "p_period" "text", "p_issue_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lease public.unit_leases;
  v_range daterange;
  v_has_owner boolean;
  v_due_id uuid;
  v_description text;
begin
  perform pg_advisory_xact_lock(hashtext('lease_rent_' || p_lease_id::text));

  select * into v_lease from public.unit_leases where id = p_lease_id and organization_id = p_organization_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;

  if v_lease.status <> 'ACTIVE' then
    return jsonb_build_object('success', true, 'skipped', true, 'reason', 'not_active');
  end if;

  v_range := public.lease_rent_period_range(v_lease.rent_frequency, p_period);
  if lower(v_range) > coalesce(v_lease.ends_on, 'infinity'::date) or upper(v_range) < v_lease.starts_on then
    return jsonb_build_object('success', true, 'skipped', true, 'reason', 'period_outside_lease_range');
  end if;

  if v_lease.billing_recipient = 'OWNER' then
    select exists (
      select 1 from public.unit_ownerships
      where unit_id = v_lease.unit_id and (end_date is null or end_date >= current_date)
    ) into v_has_owner;
    if not v_has_owner then
      perform public.append_financial_audit_event(
        p_organization_id, 'OPERATION_REJECTED', 'unit_lease', v_lease.property_id, p_lease_id, null, null, null,
        jsonb_build_object('reason', 'no_current_owner_for_owner_billed_lease', 'period', p_period)
      );
      return jsonb_build_object('success', false, 'blocked', true, 'reason', 'no_current_owner');
    end if;
  end if;

  begin
    insert into public.lease_rent_generation_runs (organization_id, lease_id, period, generated_by)
    values (p_organization_id, p_lease_id, p_period, auth.uid());
  exception when unique_violation then
    return jsonb_build_object('success', true, 'idempotent', true);
  end;

  v_description := 'إيجار ' || p_period;

  insert into public.dues (
    organization_id, property_id, unit_id, due_type_id, receivable_account_id,
    amount, issue_date, due_date, description, status, source_type, source_id
  ) values (
    p_organization_id, v_lease.property_id, v_lease.unit_id, v_lease.due_type_id, v_lease.receivable_account_id,
    v_lease.rent_amount, coalesce(p_issue_date, lower(v_range)), lower(v_range), v_description, 'ISSUED', 'LEASE_RENT', p_lease_id
  ) returning id into v_due_id;

  update public.lease_rent_generation_runs set due_id = v_due_id
  where lease_id = p_lease_id and period = p_period;

  perform public.append_financial_audit_event(
    p_organization_id, 'LEASE_RENT_DUE_GENERATED', 'due', v_lease.property_id, v_due_id, null, null, null,
    jsonb_build_object('lease_id', p_lease_id, 'period', p_period, 'amount', v_lease.rent_amount)
  );

  return jsonb_build_object('success', true, 'generated', true, 'due_id', v_due_id);
end;
$$;


ALTER FUNCTION "public"."generate_lease_rent_dues"("p_organization_id" "uuid", "p_lease_id" "uuid", "p_period" "text", "p_issue_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_recurring_dues"("p_organization_id" "uuid", "p_schedule_id" "uuid", "p_period" "text", "p_generated_by" "uuid" DEFAULT NULL::"uuid", "p_override_issue_date" "date" DEFAULT NULL::"date", "p_ip_address" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_user_id uuid;
  v_schedule record;
  v_unit_record record;
  v_unit_amount numeric(19, 4);
  v_issue_date date;
  v_due_date date;
  v_run_id uuid;
  v_generated_count integer := 0;
  v_total_amount numeric(19, 4) := 0;
  v_building_ids jsonb;
  v_zone_ids jsonb;
  v_unit_types jsonb;
BEGIN
  SELECT * INTO v_schedule
  FROM public.due_schedules
  WHERE id = p_schedule_id AND organization_id = p_organization_id;

  IF v_schedule.id IS NULL THEN
    RAISE EXCEPTION 'جدول الرسوم الدوري غير موجود' USING ERRCODE = '22023';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    IF NOT public.has_financial_permission(p_organization_id, 'finance.schedules.generate', v_schedule.property_id) THEN
      RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتوليد الرسوم الدورية' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT v_schedule.is_active THEN
    RAISE EXCEPTION 'جدول الرسوم الدوري موقوف' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('generate_recurring_' || p_schedule_id::text));

  BEGIN
    INSERT INTO public.due_generation_runs (
      organization_id,
      schedule_id,
      period,
      generated_units_count,
      total_amount,
      generated_by
    ) VALUES (
      p_organization_id,
      p_schedule_id,
      p_period,
      0,
      0,
      COALESCE(p_generated_by, v_user_id)
    )
    RETURNING id INTO v_run_id;
  EXCEPTION
    WHEN unique_violation THEN
      PERFORM public.append_financial_audit_event(
        p_organization_id := p_organization_id,
        p_action := 'RECURRING_DUES_SKIPPED',
        p_entity_type := 'DUE_SCHEDULE',
        p_resort_id := v_schedule.property_id,
        p_entity_id := p_schedule_id,
        p_request_id := NULL,
        p_ip_address := p_ip_address,
        p_user_agent := p_user_agent,
        p_metadata := jsonb_build_object(
          'period', p_period,
          'schedule_name', v_schedule.name,
          'reason', 'idempotent_replay'
        )
      );

      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'generated_units_count', 0,
        'total_amount', 0,
        'message', 'الدورة المالية تم توليدها سابقاً وتجاوز التكرار بسلام'
      );
  END;

  IF p_override_issue_date IS NOT NULL THEN
    v_issue_date := p_override_issue_date;
  ELSE
    IF v_schedule.frequency = 'MONTHLY' THEN
      v_issue_date := to_date(p_period || '-01', 'YYYY-MM-DD');
    ELSE
      v_issue_date := to_date(p_period || '-01-01', 'YYYY-MM-DD');
    END IF;
  END IF;

  v_due_date := v_issue_date + (v_schedule.due_offset_days || ' days')::interval;
  v_building_ids := v_schedule.scope->'building_ids';
  v_zone_ids := v_schedule.scope->'zone_ids';
  v_unit_types := v_schedule.scope->'unit_types';

  FOR v_unit_record IN
    SELECT u.id, u.unit_type, u.building_id, u.zone_id
    FROM public.units u
    WHERE u.organization_id = p_organization_id
      AND u.property_id = v_schedule.property_id
      AND (
        (v_schedule.scope->>'all')::boolean = true
        OR (v_building_ids IS NOT NULL AND v_building_ids ? u.building_id::text)
        OR (v_zone_ids IS NOT NULL AND v_zone_ids ? u.zone_id::text)
        OR (v_unit_types IS NOT NULL AND v_unit_types ? u.unit_type)
      )
  LOOP
    IF v_schedule.amount_by_unit_type IS NOT NULL AND v_schedule.amount_by_unit_type ? v_unit_record.unit_type THEN
      v_unit_amount := (v_schedule.amount_by_unit_type->>v_unit_record.unit_type)::numeric(19, 4);
    ELSE
      v_unit_amount := v_schedule.amount;
    END IF;

    INSERT INTO public.dues (
      organization_id,
      property_id,
      unit_id,
      due_type_id,
      receivable_account_id,
      amount,
      issue_date,
      due_date,
      description,
      status,
      created_by
    ) VALUES (
      p_organization_id,
      v_schedule.property_id,
      v_unit_record.id,
      v_schedule.due_type_id,
      v_schedule.receivable_account_id,
      v_unit_amount,
      v_issue_date,
      v_due_date,
      v_schedule.name || ' (' || p_period || ')',
      'ISSUED',
      COALESCE(p_generated_by, v_user_id)
    );

    v_generated_count := v_generated_count + 1;
    v_total_amount := v_total_amount + v_unit_amount;
  END LOOP;

  UPDATE public.due_generation_runs
  SET generated_units_count = v_generated_count,
      total_amount = v_total_amount
  WHERE id = v_run_id;

  PERFORM public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := 'RECURRING_DUES_GENERATED',
    p_entity_type := 'DUE_SCHEDULE',
    p_resort_id := v_schedule.property_id,
    p_entity_id := p_schedule_id,
    p_request_id := NULL,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object(
      'period', p_period,
      'run_id', v_run_id,
      'generated_units_count', v_generated_count,
      'total_amount', v_total_amount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'generated_units_count', v_generated_count,
    'total_amount', v_total_amount
  );
END;
$$;


ALTER FUNCTION "public"."generate_recurring_dues"("p_organization_id" "uuid", "p_schedule_id" "uuid", "p_period" "text", "p_generated_by" "uuid", "p_override_issue_date" "date", "p_ip_address" "inet", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_ledger"("p_organization_id" "uuid", "p_account_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("entry_id" "uuid", "entry_number" bigint, "entry_date" "date", "description" "text", "debit" numeric, "credit" numeric, "running_balance" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية' using errcode = '42501';
  end if;

  return query
  select
    je.id,
    je.entry_number,
    je.entry_date,
    coalesce(l.description, je.description),
    l.debit,
    l.credit,
    sum(
      case when a.normal_balance = 'DEBIT' then l.debit - l.credit else l.credit - l.debit end
    ) over (order by je.entry_date, je.entry_number, l.id) as running_balance
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  join public.chart_of_accounts a on a.id = l.account_id
  where a.id = p_account_id
    and a.organization_id = p_organization_id
    and je.status = 'POSTED'
    and je.entry_date between p_start_date and p_end_date
  order by je.entry_date, je.entry_number, l.id;
end;
$$;


ALTER FUNCTION "public"."get_account_ledger"("p_organization_id" "uuid", "p_account_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_bank_match_candidates"("p_statement_line_id" "uuid", "p_date_tolerance_days" integer DEFAULT 30) RETURNS TABLE("journal_entry_line_id" "uuid", "entry_id" "uuid", "entry_number" bigint, "entry_date" "date", "description" "text", "signed_amount" numeric, "date_distance" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
  v_gl_account uuid;
  v_line_date date;
  v_amount numeric;
begin
  select bl.organization_id, ba.gl_account_id, bl.line_date, bl.amount
  into v_org, v_gl_account, v_line_date, v_amount
  from public.bank_statement_lines bl
  join public.bank_statements s on s.id = bl.statement_id
  join public.bank_accounts ba on ba.id = s.bank_account_id
  where bl.id = p_statement_line_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_LINE_NOT_FOUND: سطر كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتنفيذ المطابقة البنكية' using errcode = '42501';
  end if;

  return query
  select
    l.id,
    je.id,
    je.entry_number,
    je.entry_date,
    coalesce(l.description, je.description),
    (l.debit - l.credit),
    abs(je.entry_date - v_line_date)::int
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  where l.account_id = v_gl_account
    and je.organization_id = v_org
    and je.status = 'POSTED'
    and (l.debit - l.credit) = v_amount
    and je.entry_date between v_line_date - p_date_tolerance_days
                          and v_line_date + p_date_tolerance_days
    and not exists (
      select 1 from public.bank_statement_lines bl
      where bl.matched_journal_entry_line_id = l.id
    )
  order by abs(je.entry_date - v_line_date), je.entry_date, je.entry_number
  limit 50;
end;
$$;


ALTER FUNCTION "public"."get_bank_match_candidates"("p_statement_line_id" "uuid", "p_date_tolerance_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_bank_reconciliation_summary"("p_statement_id" "uuid") RETURNS TABLE("book_balance" numeric, "closing_balance" numeric, "opening_balance" numeric, "unmatched_gl_total" numeric, "unmatched_statement_total" numeric, "unmatched_gl_count" integer, "unmatched_statement_count" integer, "difference" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
  v_gl_account uuid;
  v_period_start date;
  v_period_end date;
  v_closing numeric;
  v_opening numeric;
begin
  select s.organization_id, ba.gl_account_id, s.period_start, s.period_end,
         s.closing_balance, s.opening_balance
  into v_org, v_gl_account, v_period_start, v_period_end, v_closing, v_opening
  from public.bank_statements s
  join public.bank_accounts ba on ba.id = s.bank_account_id
  where s.id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not (
    public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.read')
    or public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على المطابقة البنكية' using errcode = '42501';
  end if;

  return query
  with book as (
    select coalesce(sum(l.debit - l.credit), 0) as bal
    from public.journal_entry_lines l
    join public.journal_entries je on je.id = l.journal_entry_id
    where l.account_id = v_gl_account
      and je.organization_id = v_org
      and je.status = 'POSTED'
      and je.entry_date <= v_period_end
  ),
  unmatched_gl as (
    select coalesce(sum(l.debit - l.credit), 0) as total, count(*)::int as cnt
    from public.journal_entry_lines l
    join public.journal_entries je on je.id = l.journal_entry_id
    where l.account_id = v_gl_account
      and je.organization_id = v_org
      and je.status = 'POSTED'
      and je.entry_date between v_period_start and v_period_end
      and not exists (
        select 1 from public.bank_statement_lines bl
        where bl.matched_journal_entry_line_id = l.id
      )
  ),
  unmatched_stmt as (
    select coalesce(sum(bl.amount), 0) as total, count(*)::int as cnt
    from public.bank_statement_lines bl
    where bl.statement_id = p_statement_id
      and bl.matched_journal_entry_line_id is null
  )
  select
    book.bal,
    v_closing,
    v_opening,
    unmatched_gl.total,
    unmatched_stmt.total,
    unmatched_gl.cnt,
    unmatched_stmt.cnt,
    (v_closing + unmatched_gl.total - unmatched_stmt.total) - book.bal
  from book, unmatched_gl, unmatched_stmt;
end;
$$;


ALTER FUNCTION "public"."get_bank_reconciliation_summary"("p_statement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cash_flow_statement"("p_organization_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("section" "text", "account_id" "uuid", "code" "text", "name_ar" "text", "name_en" "text", "category" "text", "is_classified" boolean, "net_amount" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية' using errcode = '42501';
  end if;

  return query
  with cash_entries as (
    select distinct je.id
    from public.journal_entries je
    join public.journal_entry_lines l on l.journal_entry_id = je.id
    join public.chart_of_accounts a on a.id = l.account_id
    where je.organization_id = p_organization_id
      and je.status = 'POSTED'
      and je.entry_date between p_start_date and p_end_date
      and a.is_cash_equivalent
  )
  select
    coalesce(
      a.cash_flow_section,
      case when a.category = 'EQUITY' then 'FINANCING' else 'OPERATING' end
    )::text as section,
    a.id as account_id,
    a.code,
    a.name_ar,
    a.name_en,
    a.category::text,
    (a.cash_flow_section is not null) as is_classified,
    sum(l.credit - l.debit) as net_amount
  from public.journal_entry_lines l
  join cash_entries ce on ce.id = l.journal_entry_id
  join public.chart_of_accounts a on a.id = l.account_id
  where a.organization_id = p_organization_id
    and not a.is_cash_equivalent
  group by a.id, a.code, a.name_ar, a.name_en, a.category, a.cash_flow_section
  having sum(l.credit - l.debit) <> 0
  order by 1, a.code;
end;
$$;


ALTER FUNCTION "public"."get_cash_flow_statement"("p_organization_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cash_position"("p_organization_id" "uuid", "p_as_of_date" "date") RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_balance numeric;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية' using errcode = '42501';
  end if;

  select coalesce(sum(l.debit - l.credit), 0)
  into v_balance
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  join public.chart_of_accounts a on a.id = l.account_id
  where a.organization_id = p_organization_id
    and a.is_cash_equivalent
    and je.status = 'POSTED'
    and je.entry_date <= p_as_of_date;

  return v_balance;
end;
$$;


ALTER FUNCTION "public"."get_cash_position"("p_organization_id" "uuid", "p_as_of_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_einvoice_source_for_credit_note"("p_credit_note_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cn record;
  v_org record;
  v_snap jsonb;
  v_decimals integer;
  v_original_uuid text;
begin
  select * into v_cn from public.credit_notes where id = p_credit_note_id;
  if v_cn.id is null then
    raise exception 'CREDIT_NOTE_NOT_FOUND: الإشعار غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_cn.organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار مستندات إلكترونية'
      using errcode = '42501';
  end if;

  select o.name, o.tax_id, o.tax_jurisdiction, o.default_currency,
         o.governorate, o.city, o.address
  into v_org from public.organizations o where o.id = v_cn.organization_id;

  v_decimals := public.currency_decimals(coalesce(v_org.default_currency, 'EGP'));
  v_snap := v_cn.decision_snapshot;

  -- مرجع الأصل لدى السلطة، إن كان الأصل قد أُرسل وقُبل. غيابه لا يمنع بناء
  -- الإشعار محليًا، لكنه يمنع إرساله — والسلطة ترفض تصحيحًا بلا أصل.
  select ed.authority_uuid into v_original_uuid
  from public.einvoice_documents ed
  where ed.source_type = 'DUE' and ed.source_id = v_cn.source_id
    and ed.status = 'ACCEPTED'
  order by ed.created_at desc limit 1;

  return jsonb_build_object(
    'documentType', 'CREDIT_NOTE',
    'documentNumber', v_cn.document_number,
    'issuedAt', v_cn.credit_date,
    'currency', coalesce(v_org.default_currency, 'EGP'),
    'currencyDecimals', v_decimals,
    'correctsAuthorityUuid', v_original_uuid,
    'seller', jsonb_build_object(
      'name', v_org.name, 'taxId', v_org.tax_id,
      'countryCode', case when v_org.tax_jurisdiction = 'SA' then 'SA' else 'EG' end,
      'governorate', v_org.governorate, 'city', v_org.city, 'street', v_org.address
    ),
    'buyer', jsonb_build_object(
      'name', coalesce(v_snap->>'buyer_legal_name', 'غير محدد'),
      'taxId', v_snap->>'buyer_tax_registration_number',
      'countryCode', 'EG'
    ),
    'lines', jsonb_build_array(jsonb_build_object(
      'description', 'إشعار خصم — ' || v_cn.reason,
      'itemCode', null,
      'quantity', 1,
      'unitCode', 'EA',
      'unitPrice', v_cn.taxable_base,
      'discount', 0,
      'taxRate', coalesce((v_snap->>'vat_rate')::numeric, 0),
      'taxAmount', v_cn.vat_amount,
      'lineTotal', v_cn.gross_amount
    )),
    'totals', jsonb_build_object(
      'netAmount', v_cn.taxable_base,
      'discountAmount', 0,
      'taxAmount', v_cn.vat_amount,
      'grandTotal', v_cn.gross_amount
    ),
    'notes', v_cn.reason
  );
end;
$$;


ALTER FUNCTION "public"."get_einvoice_source_for_credit_note"("p_credit_note_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_einvoice_source_for_due"("p_due_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_due record;
  v_org record;
  v_item record;
  v_decision record;
  v_snap jsonb;
  v_doc_type text;
  v_number text;
  v_decimals integer;
begin
  select d.id, d.organization_id, d.description, d.issue_date, d.amount, d.status,
         dt.catalogue_item_id
  into v_due
  from public.dues d
  join public.due_types dt on dt.id = d.due_type_id
  where d.id = p_due_id;

  if v_due.id is null then
    raise exception 'DUE_NOT_FOUND: المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_due.organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار مستندات إلكترونية'
      using errcode = '42501';
  end if;

  if v_due.status = 'VOID' then
    raise exception 'DUE_VOID: لا يُصدَر مستند لمستحق ملغى' using errcode = 'P0001';
  end if;

  select o.name, o.tax_id, o.tax_jurisdiction, o.default_currency,
         o.governorate, o.city, o.address
  into v_org
  from public.organizations o where o.id = v_due.organization_id;

  if nullif(btrim(coalesce(v_org.tax_id, '')), '') is null then
    raise exception
      'EINVOICE_LEGAL_IDENTITY_MISSING: لا يُصدَر مستند بلا رقم ضريبي للمؤسسة'
      using errcode = 'P0001';
  end if;

  select td.* into v_decision
  from public.tax_decisions td
  where td.source_type = 'DUE' and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
  order by td.decided_at desc limit 1;

  if v_decision.id is null then
    raise exception
      'TAX_DECISION_MISSING: لا مستند بلا قرار ضريبي مختوم لهذا المستحق'
      using errcode = 'P0001';
  end if;

  v_snap := v_decision.tax_decision_snapshot;
  v_decimals := public.currency_decimals(coalesce(v_org.default_currency, 'EGP'));

  select ci.name_ar, ci.name_en, ci.unit_code, ci.item_code, ci.item_code_type
  into v_item
  from public.catalogue_items ci where ci.id = v_due.catalogue_item_id;

  v_doc_type := case
    when v_snap->>'e_document_type' = 'E_INVOICE' then 'INVOICE'
    when v_snap->>'e_document_type' = 'E_RECEIPT' then 'RECEIPT'
    when v_snap->>'e_document_type' = 'BY_CUSTOMER_TYPE' then
      case when v_snap->>'buyer_customer_type' = 'B2B' then 'INVOICE' else 'RECEIPT' end
    else null
  end;

  if v_doc_type is null then
    raise exception
      'EINVOICE_DOCUMENT_TYPE_UNRESOLVED: نوع المستند الإلكتروني غير محسوم لهذه المعالجة'
      using errcode = 'P0001';
  end if;

  if v_doc_type = 'INVOICE'
     and nullif(btrim(coalesce(v_snap->>'buyer_tax_registration_number', '')), '') is null then
    raise exception
      'EINVOICE_BUYER_TAX_ID_MISSING: الفاتورة بين المنشآت تستلزم رقم تسجيل المشتري'
      using errcode = 'P0001';
  end if;

  v_number := public.allocate_document_number(
    v_due.organization_id, v_doc_type, 'DUE', p_due_id, v_due.issue_date);

  return jsonb_build_object(
    'documentType', v_doc_type,
    'documentNumber', v_number,
    'issuedAt', v_due.issue_date,
    'currency', coalesce(v_org.default_currency, 'EGP'),
    'currencyDecimals', v_decimals,
    'seller', jsonb_build_object(
      'name', v_org.name,
      'taxId', v_org.tax_id,
      'countryCode', case when v_org.tax_jurisdiction = 'SA' then 'SA' else 'EG' end,
      'governorate', v_org.governorate,
      'city', v_org.city,
      'street', v_org.address
    ),
    'buyer', jsonb_build_object(
      'name', coalesce(v_snap->>'buyer_legal_name', 'غير محدد'),
      'taxId', v_snap->>'buyer_tax_registration_number',
      'countryCode', coalesce(v_snap->>'buyer_country_code', 'EG'),
      'street', v_snap->>'buyer_billing_address'
    ),
    'lines', jsonb_build_array(jsonb_build_object(
      'description', coalesce(v_due.description, v_item.name_ar, v_snap->>'revenue_nature'),
      -- الكود من الكتالوج، ويبقى null إن لم يُربط الصنف أو لم يحمل كودًا —
      -- لا يُملأ بما يبدو معقولًا، ومحوّل ETA يجب أن يرفض عليه.
      'itemCode', v_item.item_code,
      'itemCodeType', v_item.item_code_type,
      'quantity', 1,
      'unitCode', coalesce(v_item.unit_code, 'EA'),
      'unitPrice', v_decision.taxable_base,
      'discount', 0,
      'taxRate', coalesce((v_snap->>'vat_rate')::numeric, 0),
      'taxAmount', v_decision.vat_amount,
      'lineTotal', v_decision.gross_amount
    )),
    'totals', jsonb_build_object(
      'netAmount', v_decision.taxable_base,
      'discountAmount', 0,
      'taxAmount', v_decision.vat_amount,
      'grandTotal', v_decision.gross_amount
    ),
    'taxDecisionId', v_decision.id,
    'taxTreatment', v_snap->>'tax_treatment',
    'revenueNature', v_decision.revenue_nature
  );
end;
$$;


ALTER FUNCTION "public"."get_einvoice_source_for_due"("p_due_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_entitlement"("p_organization_id" "uuid", "p_key" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select pe.value
  from public.subscriptions s
  join public.plan_entitlements pe on pe.plan_id = s.plan_id
  where s.organization_id = p_organization_id
    and s.status = 'ACTIVE'
    and pe.key = p_key
  limit 1;
$$;


ALTER FUNCTION "public"."get_entitlement"("p_organization_id" "uuid", "p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_exchange_rate"("p_organization_id" "uuid", "p_foreign_currency" "text", "p_base_currency" "text", "p_date" "date") RETURNS TABLE("rate" numeric, "rate_date" "date", "source" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select r.base_per_unit, r.rate_date, r.source
  from public.exchange_rates r
  where r.organization_id = p_organization_id
    and r.foreign_currency = upper(p_foreign_currency)
    and r.base_currency = upper(p_base_currency)
    and r.rate_date <= p_date
  order by r.rate_date desc
  limit 1;
$$;


ALTER FUNCTION "public"."get_exchange_rate"("p_organization_id" "uuid", "p_foreign_currency" "text", "p_base_currency" "text", "p_date" "date") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "fiscal_period_id" "uuid" NOT NULL,
    "entry_number" bigint,
    "entry_date" "date" NOT NULL,
    "description" "text" NOT NULL,
    "source_type" "text" DEFAULT 'JOURNAL_VOUCHER'::"text" NOT NULL,
    "source_id" "uuid",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "idempotency_key" "text",
    "reversed_entry_id" "uuid",
    "created_by" "uuid",
    "reviewed_by" "uuid",
    "posted_by" "uuid",
    "posted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "journal_entries_source_type_check" CHECK (("source_type" = ANY (ARRAY['JOURNAL_VOUCHER'::"text", 'RECEIPT_VOUCHER'::"text", 'PAYMENT_VOUCHER'::"text"]))),
    CONSTRAINT "journal_entries_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'UNDER_REVIEW'::"text", 'POSTED'::"text", 'REVERSED'::"text"])))
);


ALTER TABLE "public"."journal_entries" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_journal_entry_for_view"("p_entry_id" "uuid") RETURNS "public"."journal_entries"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_entry public.journal_entries;
begin
  select * into v_entry from public.journal_entries where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'JOURNAL_ENTRY_NOT_FOUND: القيد غير موجود' using errcode = 'P0002';
  end if;

  -- Resort-scoped: a role assignment with resort_id IS NULL (org-wide,
  -- e.g. FINANCE_MANAGER/TENANT_OWNER) always passes; a resort-scoped
  -- assignment (e.g. CASHIER's Resort-A-only grant) only passes when it
  -- matches the entry's own resort_id (or the entry itself has no resort,
  -- i.e. a general/org-level entry -- has_financial_permission treats
  -- p_resort_id IS NULL as universally visible, matching how such entries
  -- already behave everywhere else in this schema).
  if not (
    public.has_financial_permission(v_entry.organization_id, 'finance.reports.read', v_entry.property_id)
    or public.has_financial_permission(v_entry.organization_id, 'finance.entries.create', v_entry.property_id)
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية عرض هذا القيد في هذا الموقع' using errcode = '42501';
  end if;

  return v_entry;
end;
$$;


ALTER FUNCTION "public"."get_journal_entry_for_view"("p_entry_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_lease_deposit_summary"("p_lease_id" "uuid") RETURNS TABLE("received_total" numeric, "refunded_total" numeric, "deducted_total" numeric, "held_total" numeric, "agreed_amount" numeric, "event_count" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
  v_agreed numeric;
begin
  select organization_id, security_deposit_amount into v_org, v_agreed
  from public.unit_leases where id = p_lease_id;

  if v_org is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = 'P0002';
  end if;

  if not (
    public.has_permission(auth.uid(), v_org, 'property.leases.view')
    or public.has_permission(auth.uid(), v_org, 'property.leases.manage')
  ) then
    raise exception 'FORBIDDEN_PROPERTY_PERMISSION: غير مصرح لك بالاطلاع على عقود الإيجار' using errcode = '42501';
  end if;

  return query
  select
    coalesce(sum(e.amount) filter (where e.event_type = 'RECEIVED'), 0),
    coalesce(sum(e.amount) filter (where e.event_type = 'REFUNDED'), 0),
    coalesce(sum(e.amount) filter (where e.event_type = 'DEDUCTED'), 0),
    coalesce(sum(e.amount) filter (where e.event_type = 'RECEIVED'), 0)
      - coalesce(sum(e.amount) filter (where e.event_type in ('REFUNDED', 'DEDUCTED')), 0),
    coalesce(v_agreed, 0),
    count(e.id)::int
  from public.unit_lease_deposit_events e
  where e.lease_id = p_lease_id;
end;
$$;


ALTER FUNCTION "public"."get_lease_deposit_summary"("p_lease_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_own_organization_display"() RETURNS TABLE("name" "text", "default_currency" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select o.name, o.default_currency
  from public.organizations o
  join public.members m on m.organization_id = o.id
  where m.user_id = auth.uid()
    and public.organization_is_active(o.id);
$$;


ALTER FUNCTION "public"."get_own_organization_display"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_payment_provider_credentials"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_provider" "text", "p_environment" "text") RETURNS TABLE("merchant_identifier" "text", "public_key" "text", "api_key" "text", "hmac_secret" "text", "settings_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
declare
  v_row public.payment_provider_settings;
begin
  select * into v_row from public.payment_provider_settings
  where organization_id = p_organization_id and provider = p_provider and environment = p_environment
    and (property_id = p_resort_id or property_id is null)
  order by property_id nulls last
  limit 1;

  if v_row.id is null then
    raise exception 'NO_TENANT_SETTING: لا يوجد إعداد لهذا الكيان' using errcode = '22023';
  end if;

  if not v_row.enabled then
    raise exception 'PROVIDER_NOT_ENABLED: لم يُفعّل هذا المزود بعد' using errcode = '22023';
  end if;

  return query
    select v_row.merchant_identifier, v_row.public_key,
           (select decrypted_secret from vault.decrypted_secrets where id = v_row.api_key_secret_id),
           (select decrypted_secret from vault.decrypted_secrets where id = v_row.hmac_secret_id),
           v_row.id;
end;
$$;


ALTER FUNCTION "public"."get_payment_provider_credentials"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_provider" "text", "p_environment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_payment_provider_settings_credentials"("p_settings_id" "uuid") RETURNS TABLE("api_key" "text", "hmac_secret" "text", "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault'
    AS $$
declare
  v_row public.payment_provider_settings;
begin
  select * into v_row from public.payment_provider_settings where id = p_settings_id;
  if v_row.id is null or not public.has_permission(auth.uid(), v_row.organization_id, 'finance.online_payments.manage') then
    raise exception 'FORBIDDEN: لا تملك صلاحية إدارة مزودي الدفع' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_row.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;

  return query
    select
      (select decrypted_secret from vault.decrypted_secrets where id = v_row.api_key_secret_id),
      (select decrypted_secret from vault.decrypted_secrets where id = v_row.hmac_secret_id),
      v_row.updated_at;
end;
$$;


ALTER FUNCTION "public"."get_payment_provider_settings_credentials"("p_settings_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_charge_allocations"("p_levy_id" "uuid") RETURNS TABLE("allocation_id" "uuid", "unit_id" "uuid", "unit_code" "text", "unit_type" "text", "basis_value" numeric, "share_amount" numeric, "share_percent" numeric, "due_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
  v_total numeric;
begin
  select organization_id, total_amount into v_org, v_total
  from public.service_charge_levies where id = p_levy_id;

  if v_org is null then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_FOUND: تحصيلة رسوم الخدمة غير موجودة' using errcode = 'P0002';
  end if;

  if not (
    public.has_permission(auth.uid(), v_org, 'finance.service_charges.read')
    or public.has_permission(auth.uid(), v_org, 'finance.service_charges.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على رسوم الخدمة' using errcode = '42501';
  end if;

  return query
  select a.id, u.id, u.code, u.unit_type, a.basis_value, a.share_amount,
         case when v_total > 0 then round(a.share_amount * 100 / v_total, 4) else 0 end,
         a.due_id
  from public.service_charge_allocations a
  join public.units u on u.id = a.unit_id
  where a.levy_id = p_levy_id
  order by u.code;
end;
$$;


ALTER FUNCTION "public"."get_service_charge_allocations"("p_levy_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tax_decision_coverage"("p_organization_id" "uuid") RETURNS TABLE("total_dues" bigint, "dues_with_decision" bigint, "dues_without_decision" bigint, "earliest_undecided_issue_date" "date", "latest_undecided_issue_date" "date", "undecided_amount" numeric, "enforcement_enabled" boolean, "enforcement_enabled_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.tax_mapping.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.tax_mapping.manage')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.tax_enforcement.manage')
  ) then
    raise exception 'FORBIDDEN_TAX_ENFORCEMENT: غير مصرح لك بالاطلاع على تغطية القرارات الضريبية'
      using errcode = '42501';
  end if;

  return query
  with scoped as (
    select d.id, d.issue_date, d.amount,
           exists (
             select 1 from public.tax_decisions td
             where td.source_type = 'DUE' and td.source_id = d.id
               and td.reverses_decision_id is null
               and not exists (
                 select 1 from public.tax_decisions r where r.reverses_decision_id = td.id
               )
           ) as has_decision
    from public.dues d
    where d.organization_id = p_organization_id
      and d.status <> 'VOID'
  )
  select
    count(*)::bigint,
    count(*) filter (where has_decision)::bigint,
    count(*) filter (where not has_decision)::bigint,
    min(issue_date) filter (where not has_decision),
    max(issue_date) filter (where not has_decision),
    coalesce(sum(amount) filter (where not has_decision), 0),
    o.tax_enforcement_enabled,
    o.tax_enforcement_enabled_at
  from scoped, public.organizations o
  where o.id = p_organization_id
  group by o.tax_enforcement_enabled, o.tax_enforcement_enabled_at;
end;
$$;


ALTER FUNCTION "public"."get_tax_decision_coverage"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_trial_balance"("p_organization_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("account_id" "uuid", "code" "text", "name_ar" "text", "name_en" "text", "category" "text", "normal_balance" "text", "total_debit" numeric, "total_credit" numeric, "balance" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.code,
    a.name_ar,
    a.name_en,
    a.category,
    a.normal_balance,
    coalesce(sum(l.debit), 0) as total_debit,
    coalesce(sum(l.credit), 0) as total_credit,
    case when a.normal_balance = 'DEBIT'
      then coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0)
      else coalesce(sum(l.credit), 0) - coalesce(sum(l.debit), 0)
    end as balance
  from public.chart_of_accounts a
  left join public.journal_entry_lines l on l.account_id = a.id
  left join public.journal_entries je on je.id = l.journal_entry_id
    and je.status = 'POSTED'
    and je.entry_date between p_start_date and p_end_date
  where a.organization_id = p_organization_id
    and not a.is_group
  group by a.id, a.code, a.name_ar, a.name_en, a.category, a.normal_balance
  order by a.code;
end;
$$;


ALTER FUNCTION "public"."get_trial_balance"("p_organization_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unrecognized_dues_summary"("p_organization_id" "uuid") RETURNS TABLE("pending_count" integer, "pending_total" numeric, "earliest_issue_date" "date", "latest_issue_date" "date")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية' using errcode = '42501';
  end if;

  return query
  select count(*)::int, coalesce(sum(d.amount), 0), min(d.issue_date), max(d.issue_date)
  from public.dues d
  where d.organization_id = p_organization_id
    and d.journal_entry_id is null
    and d.status not in ('DRAFT', 'VOID');
end;
$$;


ALTER FUNCTION "public"."get_unrecognized_dues_summary"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_financial_permission"("p_organization_id" "uuid", "p_permission_key" "text", "p_resort_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_actor_id uuid;
  v_org_status text;
  v_has_perm boolean := false;
BEGIN
  -- أ. الاعتماد حصراً على auth.uid() ومنع الاستدعاء كمنفذ آخر
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  -- ب. فحص حالة المنظمة (العمليات المالية تُرفض إذا كانت SUSPENDED أو ARCHIVED)
  SELECT status INTO v_org_status
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_status IS NULL OR v_org_status IN ('SUSPENDED', 'ARCHIVED') THEN
    RETURN false;
  END IF;

  -- ج. التحقق من صحة المنتجع وتبعيته للمنظمة إن تم تزويده
  IF p_resort_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.resorts
      WHERE id = p_resort_id AND organization_id = p_organization_id
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- د. التحقق من العضوية النشطة للمستخدم في المنظمة
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
      AND user_id = v_actor_id
      AND status = 'active'
  ) THEN
    RETURN false;
  END IF;

  -- هـ. استثناء منشئ/مالك المنظمة (Owner Bypass) بشرط حالة المنظمة النشطة
  IF EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_organization_id AND created_by = v_actor_id
  ) THEN
    RETURN true;
  END IF;

  -- و. فحص التعيينات والأدوار والصلاحيات المربوطة مع مراعاة نطاق المنتجع (Resort Scope)
  SELECT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ura.user_id = v_actor_id
      AND ura.organization_id = p_organization_id
      AND (r.organization_id IS NULL OR r.organization_id = p_organization_id)
      AND (
        ura.property_id IS NULL
        OR p_resort_id IS NULL
        OR ura.property_id = p_resort_id
      )
      AND p.key = p_permission_key
  ) INTO v_has_perm;

  RETURN COALESCE(v_has_perm, false);
END;
$$;


ALTER FUNCTION "public"."has_financial_permission"("p_organization_id" "uuid", "p_permission_key" "text", "p_resort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_organization_id" "uuid", "p_permission_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin(p_user_id)
  or exists (
    select 1
    from public.user_role_assignments ura
    join public.role_permissions rp on rp.role_id = ura.role_id
    join public.permissions p on p.id = rp.permission_id
    where ura.user_id = p_user_id
      and ura.organization_id = p_organization_id
      and p.key = p_permission_key
  );
$$;


ALTER FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_organization_id" "uuid", "p_permission_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_property_csv"("p_organization_id" "uuid", "p_import_kind" "text", "p_rows" "jsonb", "p_resort_id" "uuid" DEFAULT NULL::"uuid", "p_allow_partial" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_row jsonb;
  v_index int := 0;
  v_imported int := 0;
  v_skipped int := 0;
  v_failures jsonb := '[]'::jsonb;
  v_unit_id uuid;
  v_member_id uuid;
  v_owner_id uuid;
  v_new_member_id uuid;
  v_email text;
  v_phone text;
  v_full_name text;
  v_is_company boolean;
  v_code text;
  v_unit_type text;
  v_custom_type_label text;
  v_floor_number int;
  v_area numeric(10,2);
  v_share_percentage numeric(5,2);
  v_start_date date;
  v_building_id uuid;
  v_zone_id uuid;
  v_owner_full_name text;
  v_owner_email text;
  v_owner_phone text;
  v_existing_ownership_id uuid;
  v_created_by uuid := auth.uid();
begin
  if p_import_kind not in ('units', 'members') then
    raise exception 'invalid import kind';
  end if;

  if p_import_kind = 'members' then
    if not public.has_permission(auth.uid(), p_organization_id, 'property.members.manage') then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  else
    if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage')
      or not public.has_permission(auth.uid(), p_organization_id, 'property.members.manage') then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    if p_resort_id is null then
      raise exception 'resort id is required for unit import';
    end if;
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    begin
      if p_import_kind = 'members' then
        v_full_name := trim(coalesce(v_row->>'full_name', ''));
        v_email := nullif(trim(coalesce(v_row->>'email', '')), '');
        v_phone := nullif(trim(coalesce(v_row->>'phone', '')), '');
        v_is_company := coalesce((v_row->>'is_company')::boolean, false);

        if v_full_name = '' then
          raise exception 'full_name is required';
        end if;

        v_member_id := null;
        if v_email is not null then
          select id into v_member_id from public.members m
          where m.organization_id = p_organization_id
            and lower(m.email) = lower(v_email)
          limit 1;
        end if;
        if v_member_id is null and v_phone is not null then
          select id into v_member_id from public.members m
          where m.organization_id = p_organization_id
            and lower(m.phone) = lower(v_phone)
          limit 1;
        end if;

        if v_member_id is not null then
          raise exception 'duplicate_member: matches an existing member by email or phone';
        end if;

        insert into public.members (organization_id, full_name, email, phone, is_company, created_by)
        values (p_organization_id, v_full_name, v_email, v_phone, v_is_company, v_created_by)
        returning id into v_member_id;
        v_imported := v_imported + 1;
      else
        v_code := trim(coalesce(v_row->>'code', ''));
        if v_code = '' then
          raise exception 'code is required';
        end if;

        v_unit_type := upper(trim(coalesce(v_row->>'unit_type', '')));
        if v_unit_type not in ('VILLA', 'CHALET', 'APARTMENT', 'SHOP', 'OFFICE', 'SERVICE', 'OTHER') then
          raise exception 'invalid unit_type';
        end if;

        v_custom_type_label := nullif(trim(coalesce(v_row->>'custom_type_label', '')), '');
        if v_unit_type = 'OTHER' and v_custom_type_label is null then
          raise exception 'custom_type_label is required for OTHER unit_type';
        end if;

        v_floor_number := nullif(trim(coalesce(v_row->>'floor_number', '')), '')::int;
        v_area := nullif(trim(coalesce(v_row->>'area', '')), '')::numeric(10,2);
        if v_area is not null and v_area <= 0 then
          raise exception 'area must be positive';
        end if;

        v_building_id := nullif(trim(coalesce(v_row->>'building_id', '')), '')::uuid;
        if v_building_id is not null then
          if not exists (
            select 1 from public.buildings b
            where b.id = v_building_id
              and b.organization_id = p_organization_id
              and b.property_id = p_resort_id
          ) then
            raise exception 'building does not belong to selected resort';
          end if;
        end if;

        v_zone_id := nullif(trim(coalesce(v_row->>'zone_id', '')), '')::uuid;
        if v_zone_id is not null then
          if not exists (
            select 1 from public.zones z
            where z.id = v_zone_id
              and z.organization_id = p_organization_id
              and z.property_id = p_resort_id
          ) then
            raise exception 'zone does not belong to selected resort';
          end if;
        end if;

        v_owner_id := null;
        v_owner_email := nullif(trim(coalesce(v_row->>'owner_email', '')), '');
        v_owner_phone := nullif(trim(coalesce(v_row->>'owner_phone', '')), '');
        v_owner_full_name := nullif(trim(coalesce(v_row->>'owner_full_name', '')), '');
        if nullif(trim(coalesce(v_row->>'owner_id', '')), '') is not null then
          v_owner_id := (v_row->>'owner_id')::uuid;
          if not exists (
            select 1 from public.members m
            where m.id = v_owner_id
              and m.organization_id = p_organization_id
          ) then
            raise exception 'owner_id does not belong to this organization';
          end if;
        elsif v_owner_email is not null or v_owner_phone is not null then
          if v_owner_email is not null then
            select id into v_owner_id from public.members m
            where m.organization_id = p_organization_id
              and lower(m.email) = lower(v_owner_email)
            limit 1;
          end if;
          if v_owner_id is null and v_owner_phone is not null then
            select id into v_owner_id from public.members m
            where m.organization_id = p_organization_id
              and lower(m.phone) = lower(v_owner_phone)
            limit 1;
          end if;
          if v_owner_id is null then
            if v_owner_full_name is null then
              raise exception 'owner_full_name is required when owner_email or owner_phone does not match an existing member';
            end if;
            insert into public.members (organization_id, full_name, email, phone, is_company, created_by)
            values (p_organization_id, v_owner_full_name, v_owner_email, v_owner_phone, false, v_created_by)
            returning id into v_owner_id;
          end if;
        end if;

        v_share_percentage := coalesce(nullif(trim(coalesce(v_row->>'share_percentage', '')), '')::numeric(5,2), 100);
        if v_share_percentage <= 0 or v_share_percentage > 100 then
          raise exception 'share_percentage must be between 0 and 100';
        end if;

        v_start_date := nullif(trim(coalesce(v_row->>'start_date', '')), '')::date;

        select id into v_unit_id from public.units u
        where u.organization_id = p_organization_id
          and u.property_id = p_resort_id
          and u.code = v_code;

        if v_unit_id is not null then
          update public.units set
            building_id = v_building_id,
            zone_id = v_zone_id,
            unit_type = v_unit_type,
            custom_type_label = v_custom_type_label,
            floor_number = v_floor_number,
            area = v_area
          where id = v_unit_id;
        else
          insert into public.units (
            organization_id,
            property_id,
            building_id,
            zone_id,
            code,
            unit_type,
            custom_type_label,
            floor_number,
            area,
            created_by
          ) values (
            p_organization_id,
            p_resort_id,
            v_building_id,
            v_zone_id,
            v_code,
            v_unit_type,
            v_custom_type_label,
            v_floor_number,
            v_area,
            v_created_by
          ) returning id into v_unit_id;
        end if;

        if v_owner_id is not null then
          select id into v_existing_ownership_id from public.unit_ownerships
          where unit_id = v_unit_id
            and member_id = v_owner_id
            and (end_date is null or end_date >= current_date);

          if v_existing_ownership_id is not null then
            update public.unit_ownerships set
              share_percentage = v_share_percentage,
              start_date = coalesce(v_start_date, start_date)
            where id = v_existing_ownership_id;
          else
            insert into public.unit_ownerships (
              organization_id,
              unit_id,
              member_id,
              share_percentage,
              start_date,
              created_by
            ) values (
              p_organization_id,
              v_unit_id,
              v_owner_id,
              v_share_percentage,
              coalesce(v_start_date, current_date),
              v_created_by
            );
          end if;
        end if;

        v_imported := v_imported + 1;
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      if not p_allow_partial then
        raise;
      end if;
      v_failures := v_failures || jsonb_build_object('row', v_index, 'error', substring(sqlerrm for 512));
    end;
  end loop;

  insert into public.property_import_logs (
    organization_id,
    property_id,
    import_kind,
    imported_rows,
    skipped_rows,
    allow_partial,
    failures,
    created_by
  ) values (
    p_organization_id,
    p_resort_id,
    p_import_kind,
    v_imported,
    v_skipped,
    p_allow_partial,
    v_failures,
    v_created_by
  );

  return jsonb_build_object(
    'imported_rows', v_imported,
    'skipped_rows', v_skipped,
    'failures', v_failures
  );
end;
$$;


ALTER FUNCTION "public"."import_property_csv"("p_organization_id" "uuid", "p_import_kind" "text", "p_rows" "jsonb", "p_resort_id" "uuid", "p_allow_partial" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_user_id" "uuid", "p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.user_id = p_user_id
      and om.organization_id = p_organization_id
      and om.status <> 'suspended'
  ) or public.is_platform_admin(p_user_id);
$$;


ALTER FUNCTION "public"."is_org_member"("p_user_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_role_assignments ura
    join public.roles r on r.id = ura.role_id
    where ura.user_id = p_user_id
      and r.key = 'PLATFORM_SUPER_ADMIN'
      and r.organization_id is null
  );
$$;


ALTER FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_resort_member"("p_user_id" "uuid", "p_resort_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.resort_memberships rm
    where rm.user_id = p_user_id
      and rm.property_id = p_resort_id
  ) or public.is_platform_admin(p_user_id);
$$;


ALTER FUNCTION "public"."is_resort_member"("p_user_id" "uuid", "p_resort_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_credit_note"("p_due_id" "uuid", "p_gross_amount" numeric, "p_reason" "text", "p_credit_date" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_due record;
  v_decision record;
  v_snap jsonb;
  v_org record;
  v_decimals integer;
  v_remaining numeric(19,4);
  v_gross numeric(19,4);
  v_vat numeric(19,4);
  v_base numeric(19,4);
  v_rate numeric;
  v_number text;
  v_period uuid;
  v_entry uuid;
  v_id uuid := gen_random_uuid();
begin
  select d.id, d.organization_id, d.property_id, d.issue_date, d.receivable_account_id,
         dt.default_revenue_account_id
  into v_due
  from public.dues d
  join public.due_types dt on dt.id = d.due_type_id
  where d.id = p_due_id;

  if v_due.id is null then
    raise exception 'DUE_NOT_FOUND: المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_due.organization_id, 'finance.entries.reverse') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار إشعارات خصم'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'CREDIT_NOTE_REASON_REQUIRED: الإشعار يحتاج سببًا' using errcode = '22023';
  end if;

  if coalesce(p_gross_amount, 0) <= 0 then
    raise exception 'CREDIT_NOTE_AMOUNT_INVALID: قيمة الإشعار يجب أن تكون موجبة'
      using errcode = '22023';
  end if;

  select td.* into v_decision
  from public.tax_decisions td
  where td.source_type = 'DUE' and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
  order by td.decided_at desc limit 1;

  if v_decision.id is null then
    raise exception
      'TAX_DECISION_MISSING: لا إشعار خصم بلا قرار ضريبي مختوم للأصل'
      using errcode = 'P0001';
  end if;

  perform 1 from public.dues where id = p_due_id for update;

  v_remaining := public.creditable_remaining(p_due_id);
  select o.default_currency into v_org from public.organizations o
  where o.id = v_due.organization_id;
  v_decimals := public.currency_decimals(coalesce(v_org.default_currency, 'EGP'));
  v_gross := round(p_gross_amount, v_decimals);

  if v_gross > v_remaining then
    raise exception
      'CREDIT_NOTE_EXCEEDS_ORIGINAL: قيمة الإشعار (%) تتجاوز المتبقي من الأصل (%)',
      v_gross, v_remaining using errcode = 'P0001';
  end if;

  v_snap := v_decision.tax_decision_snapshot;

  v_rate := coalesce((v_snap->>'vat_rate')::numeric, 0);
  if coalesce(v_decision.vat_amount, 0) > 0 and v_rate > 0 then
    v_vat := round(v_gross * v_rate / (100 + v_rate), v_decimals);
  else
    v_vat := 0;
  end if;
  v_base := v_gross - v_vat;

  -- الرقم يُخصَّص **للإشعار نفسه** لا للمستحق: `document_numbers` فريد لكل مصدر،
  -- والمستحق قد يُخصم على دفعات — فتخصيصه بالمستحق يعيد الرقم نفسه للإشعار
  -- الثاني ويصطدم بقيده. اكتشفه اختبار خصم المتبقي بعد إشعار جزئي.
  v_number := public.allocate_document_number(
    v_due.organization_id, 'CREDIT_NOTE', 'CREDIT_NOTE', v_id, p_credit_date);

  select fp.id into v_period
  from public.fiscal_periods fp
  where fp.organization_id = v_due.organization_id
    and fp.status = 'OPEN'
    and p_credit_date between fp.start_date and fp.end_date
  order by fp.start_date limit 1;

  if v_period is not null then
    v_entry := public.create_journal_entry_internal(
      v_due.organization_id, v_due.property_id, v_period, p_credit_date,
      'إشعار خصم ' || v_number, 'JOURNAL_VOUCHER',
      case when v_vat > 0 then
        jsonb_build_array(
          jsonb_build_object('account_id', v_due.default_revenue_account_id,
                             'debit', v_base, 'credit', 0),
          jsonb_build_object('account_id', v_decision.output_tax_account_id,
                             'debit', v_vat, 'credit', 0),
          jsonb_build_object('account_id', v_due.receivable_account_id,
                             'debit', 0, 'credit', v_gross))
      else
        jsonb_build_array(
          jsonb_build_object('account_id', v_due.default_revenue_account_id,
                             'debit', v_gross, 'credit', 0),
          jsonb_build_object('account_id', v_due.receivable_account_id,
                             'debit', 0, 'credit', v_gross))
      end,
      'credit_note:' || v_id::text
    );
    perform public.post_journal_entry_internal(v_entry);
  end if;

  insert into public.credit_notes (
    id, organization_id, document_type, document_number, source_type, source_id,
    tax_decision_id, credit_date, gross_amount, taxable_base, vat_amount,
    reason, journal_entry_id, decision_snapshot, issued_by
  ) values (
    v_id, v_due.organization_id, 'CREDIT_NOTE', v_number, 'DUE', p_due_id,
    v_decision.id, p_credit_date, v_gross, v_base, v_vat,
    btrim(p_reason), v_entry,
    jsonb_build_object(
      'corrects_document_for_due', p_due_id,
      'original_gross', v_decision.gross_amount,
      'original_taxable_base', v_decision.taxable_base,
      'original_vat', v_decision.vat_amount,
      'tax_treatment', v_snap->>'tax_treatment',
      'vat_rate', v_rate,
      'revenue_nature', v_decision.revenue_nature,
      'buyer_legal_name', v_snap->>'buyer_legal_name',
      'buyer_tax_registration_number', v_snap->>'buyer_tax_registration_number',
      'output_tax_account_id', v_decision.output_tax_account_id,
      'remaining_before', v_remaining,
      'remaining_after', v_remaining - v_gross,
      'issued_at', now()
    ),
    auth.uid()
  );

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (
    auth.uid(), v_due.organization_id, 'credit_note.issued', 'credit_note', v_id,
    btrim(p_reason),
    jsonb_build_object(
      'document_number', v_number, 'source_id', p_due_id,
      'gross_amount', v_gross, 'taxable_base', v_base, 'vat_amount', v_vat,
      'remaining_after', v_remaining - v_gross, 'journal_entry_id', v_entry
    )
  );

  return v_id;
end;
$$;


ALTER FUNCTION "public"."issue_credit_note"("p_due_id" "uuid", "p_gross_amount" numeric, "p_reason" "text", "p_credit_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_dues"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_unit_ids" "uuid"[], "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_amount" numeric, "p_amount_by_unit_type" "jsonb" DEFAULT NULL::"jsonb", "p_issue_date" "date" DEFAULT CURRENT_DATE, "p_due_date" "date" DEFAULT (CURRENT_DATE + '15 days'::interval), "p_description" "text" DEFAULT NULL::"text", "p_ip_address" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_user_id uuid;
  v_unit_id uuid;
  v_unit_record record;
  v_unit_amount numeric(19, 4);
  v_issued_count integer := 0;
  v_skipped_count integer := 0;
  v_total_amount numeric(19, 4) := 0;
  v_skipped_unit_ids uuid[] := ARRAY[]::uuid[];
  v_action text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_financial_permission(p_organization_id, 'finance.dues.issue', p_resort_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار المستحقات' USING ERRCODE = '42501';
  END IF;

  IF p_unit_ids IS NULL OR array_length(p_unit_ids, 1) = 0 THEN
    RAISE EXCEPTION 'يرجى تحديد وحدة واحدة على الأقل لإصدار المستحق' USING ERRCODE = '22023';
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ المستحق لا يمكن أن يكون سالباً' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('issue_dues_' || p_organization_id::text));

  FOREACH v_unit_id IN ARRAY p_unit_ids
  LOOP
    SELECT id, unit_type INTO v_unit_record
    FROM public.units
    WHERE id = v_unit_id AND organization_id = p_organization_id AND property_id = p_resort_id;

    IF v_unit_record.id IS NULL THEN
      RAISE EXCEPTION 'الوحدة المحددة (%) غير موجودة أو لا تنتمي لهذه المنظمة والمنتجع', v_unit_id USING ERRCODE = '22023';
    END IF;

    IF p_amount_by_unit_type IS NOT NULL AND p_amount_by_unit_type ? v_unit_record.unit_type THEN
      v_unit_amount := (p_amount_by_unit_type->>v_unit_record.unit_type)::numeric(19, 4);
    ELSE
      v_unit_amount := p_amount;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.dues
      WHERE unit_id = v_unit_id
        AND due_type_id = p_due_type_id
        AND issue_date = p_issue_date
        AND COALESCE(description, '') = COALESCE(p_description, '')
        AND status <> 'VOID'
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      v_skipped_unit_ids := array_append(v_skipped_unit_ids, v_unit_id);
    ELSE
      INSERT INTO public.dues (
        organization_id,
        property_id,
        unit_id,
        due_type_id,
        receivable_account_id,
        amount,
        issue_date,
        due_date,
        description,
        status,
        created_by
      ) VALUES (
        p_organization_id,
        p_resort_id,
        v_unit_id,
        p_due_type_id,
        p_receivable_account_id,
        v_unit_amount,
        p_issue_date,
        p_due_date,
        p_description,
        'ISSUED',
        v_user_id
      );

      v_issued_count := v_issued_count + 1;
      v_total_amount := v_total_amount + v_unit_amount;
    END IF;
  END LOOP;

  v_action := CASE WHEN array_length(p_unit_ids, 1) = 1 THEN 'DUE_ISSUED' ELSE 'DUE_BATCH_ISSUED' END;

  PERFORM public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := v_action,
    p_entity_type := 'DUE',
    p_resort_id := p_resort_id,
    p_entity_id := NULL,
    p_request_id := NULL,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object(
      'target_units_count', array_length(p_unit_ids, 1),
      'issued_count', v_issued_count,
      'skipped_count', v_skipped_count,
      'total_amount', v_total_amount,
      'due_type_id', p_due_type_id,
      'issue_date', p_issue_date,
      'due_date', p_due_date
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'issued_count', v_issued_count,
    'skipped_count', v_skipped_count,
    'skipped_unit_ids', to_jsonb(v_skipped_unit_ids),
    'total_amount', v_total_amount
  );
END;
$$;


ALTER FUNCTION "public"."issue_dues"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_unit_ids" "uuid"[], "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_amount" numeric, "p_amount_by_unit_type" "jsonb", "p_issue_date" "date", "p_due_date" "date", "p_description" "text", "p_ip_address" "inet", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_service_charge_levy"("p_levy_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_levy record;
  v_allocated numeric;
  v_tolerance numeric;
  v_row record;
  v_due_id uuid;
  v_count int := 0;
begin
  select * into v_levy from public.service_charge_levies where id = p_levy_id for update;

  if v_levy.id is null then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_FOUND: تحصيلة رسوم الخدمة غير موجودة' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_levy.organization_id, 'finance.service_charges.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار رسوم الخدمة' using errcode = '42501';
  end if;

  if not public.has_permission(auth.uid(), v_levy.organization_id, 'finance.dues.issue') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار المستحقات' using errcode = '42501';
  end if;

  if v_levy.status <> 'DRAFT' then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_DRAFT: التحصيلة صادرة بالفعل' using errcode = 'P0001';
  end if;

  select power(10::numeric, -public.currency_decimals(o.default_currency)) / 2
  into v_tolerance
  from public.organizations o where o.id = v_levy.organization_id;
  v_tolerance := coalesce(v_tolerance, 0.005);

  select coalesce(sum(share_amount), 0) into v_allocated
  from public.service_charge_allocations where levy_id = v_levy.id;

  if abs(v_allocated - v_levy.total_amount) >= v_tolerance then
    raise exception
      'SERVICE_CHARGE_NOT_BALANCED: مجموع الأنصبة (%) لا يساوي إجمالي التحصيلة (%)؛ أعد حساب التوزيع',
      v_allocated, v_levy.total_amount
      using errcode = 'P0001';
  end if;

  for v_row in
    select a.id, a.unit_id, a.share_amount
    from public.service_charge_allocations a
    where a.levy_id = v_levy.id
      and a.share_amount > 0
      and a.due_id is null
    order by a.unit_id
  loop
    insert into public.dues (
      organization_id, property_id, unit_id, due_type_id, receivable_account_id,
      amount, issue_date, due_date, description, status, created_by
    ) values (
      v_levy.organization_id, v_levy.property_id, v_row.unit_id,
      v_levy.due_type_id, v_levy.receivable_account_id,
      v_row.share_amount, v_levy.issue_date, v_levy.due_date,
      v_levy.name, 'ISSUED', auth.uid()
    )
    returning id into v_due_id;

    update public.service_charge_allocations
    set due_id = v_due_id where id = v_row.id;

    v_count := v_count + 1;
  end loop;

  update public.service_charge_levies
  set status = 'ISSUED', issued_at = now(), issued_by = auth.uid()
  where id = p_levy_id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  ) values (
    auth.uid(), v_levy.organization_id, v_levy.property_id,
    'service_charge_levy.issued', 'service_charge_levy', p_levy_id,
    jsonb_build_object('total_amount', v_levy.total_amount, 'units_billed', v_count,
                       'allocation_basis', v_levy.allocation_basis)
  );

  return v_count;
end;
$$;


ALTER FUNCTION "public"."issue_service_charge_levy"("p_levy_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lease_rent_period_key"("p_frequency" "text", "p_date" "date") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select case p_frequency
    when 'MONTHLY' then to_char(p_date, 'YYYY-MM')
    when 'QUARTERLY' then to_char(p_date, 'YYYY') || '-Q' || to_char(p_date, 'Q')
    when 'YEARLY' then to_char(p_date, 'YYYY')
  end;
$$;


ALTER FUNCTION "public"."lease_rent_period_key"("p_frequency" "text", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lease_rent_period_range"("p_frequency" "text", "p_period" "text") RETURNS "daterange"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_year int;
  v_month int;
  v_quarter int;
  v_start date;
  v_end date;
begin
  if p_frequency = 'MONTHLY' then
    v_start := to_date(p_period || '-01', 'YYYY-MM-DD');
    v_end := (v_start + interval '1 month' - interval '1 day')::date;
  elsif p_frequency = 'QUARTERLY' then
    v_year := split_part(p_period, '-Q', 1)::int;
    v_quarter := split_part(p_period, '-Q', 2)::int;
    v_start := make_date(v_year, (v_quarter - 1) * 3 + 1, 1);
    v_end := (v_start + interval '3 months' - interval '1 day')::date;
  elsif p_frequency = 'YEARLY' then
    v_start := make_date(p_period::int, 1, 1);
    v_end := (v_start + interval '1 year' - interval '1 day')::date;
  else
    raise exception 'unknown rent_frequency: %', p_frequency;
  end if;
  return daterange(v_start, v_end, '[]');
end;
$$;


ALTER FUNCTION "public"."lease_rent_period_range"("p_frequency" "text", "p_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_unit_ownership"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_member_id" "uuid", "p_share_percentage" numeric, "p_is_primary_contact" boolean DEFAULT true, "p_start_date" "date" DEFAULT CURRENT_DATE, "p_end_date" "date" DEFAULT NULL::"date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_unit_org uuid;
  v_member_org uuid;
  v_existing_shares numeric;
  v_new_ownership_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('unit_ownership_' || p_unit_id::text));

  IF NOT public.has_permission(auth.uid(), p_organization_id, 'property.members.manage') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: ليس لديك صلاحية ربط الملكية' USING ERRCODE = '42501';
  END IF;

  SELECT organization_id INTO v_unit_org FROM public.units WHERE id = p_unit_id;
  IF v_unit_org IS NULL OR v_unit_org != p_organization_id THEN
    RAISE EXCEPTION 'INVALID_UNIT: الوحدة المحددة غير موجودة في هذا الكيان' USING ERRCODE = '22023';
  END IF;

  SELECT organization_id INTO v_member_org FROM public.members WHERE id = p_member_id;
  IF v_member_org IS NULL OR v_member_org != p_organization_id THEN
    RAISE EXCEPTION 'INVALID_MEMBER: العضو المحدد غير موجود في هذا الكيان' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(share_percentage), 0) INTO v_existing_shares
  FROM public.unit_ownerships
  WHERE unit_id = p_unit_id AND (end_date IS NULL OR end_date >= current_date);

  IF (v_existing_shares + p_share_percentage) > 100.00 THEN
    RAISE EXCEPTION 'SHARE_OVERFLOW: إجمالي نسب الملكية الحالية (%) بالإضافة للنسبة الجديدة ينتهي إلى أكثر من 100%%', v_existing_shares USING ERRCODE = '22023';
  END IF;

  IF p_is_primary_contact THEN
    UPDATE public.unit_ownerships
    SET is_primary_contact = false
    WHERE unit_id = p_unit_id AND (end_date IS NULL OR end_date >= current_date);
  END IF;

  INSERT INTO public.unit_ownerships (
    organization_id, unit_id, member_id, share_percentage, is_primary_contact, start_date, end_date
  ) VALUES (
    p_organization_id, p_unit_id, p_member_id, p_share_percentage, p_is_primary_contact, p_start_date, p_end_date
  ) RETURNING id INTO v_new_ownership_id;

  RETURN jsonb_build_object('success', true, 'ownership_id', v_new_ownership_id);
END;
$$;


ALTER FUNCTION "public"."link_unit_ownership"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_member_id" "uuid", "p_share_percentage" numeric, "p_is_primary_contact" boolean, "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_catalogue_items"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "code" "text", "name_ar" "text", "name_en" "text", "unit_code" "text", "item_code_type" "text", "item_code" "text", "is_active" boolean, "linked_due_types" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على كتالوج الأصناف'
      using errcode = '42501';
  end if;

  return query
  select ci.id, ci.code, ci.name_ar, ci.name_en, ci.unit_code,
         ci.item_code_type, ci.item_code, ci.is_active,
         (select count(*) from public.due_types dt where dt.catalogue_item_id = ci.id)
  from public.catalogue_items ci
  where ci.organization_id = p_organization_id
  order by (nullif(btrim(coalesce(ci.item_code, '')), '') is not null), ci.name_ar;
end;
$$;


ALTER FUNCTION "public"."list_catalogue_items"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_credit_notes"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "document_number" "text", "credit_date" "date", "source_id" "uuid", "gross_amount" numeric, "taxable_base" numeric, "vat_amount" numeric, "reason" "text", "has_journal_entry" boolean, "issued_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.dues.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.entries.reverse')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.read')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على الإشعارات'
      using errcode = '42501';
  end if;

  return query
  select cn.id, cn.document_number, cn.credit_date, cn.source_id,
         cn.gross_amount, cn.taxable_base, cn.vat_amount, cn.reason,
         cn.journal_entry_id is not null, cn.issued_at
  from public.credit_notes cn
  where cn.organization_id = p_organization_id
  order by cn.issued_at desc;
end;
$$;


ALTER FUNCTION "public"."list_credit_notes"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_creditable_dues"("p_organization_id" "uuid") RETURNS TABLE("due_id" "uuid", "description" "text", "issue_date" "date", "revenue_nature" "text", "tax_treatment" "text", "original_gross" numeric, "credited" numeric, "remaining" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.dues.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.entries.reverse')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على المستحقات'
      using errcode = '42501';
  end if;

  return query
  select d.id,
         coalesce(d.description, td.revenue_nature),
         d.issue_date,
         td.revenue_nature,
         td.tax_decision_snapshot->>'tax_treatment',
         td.gross_amount,
         coalesce((select sum(cn.gross_amount) from public.credit_notes cn
                   where cn.source_type = 'DUE' and cn.source_id = d.id
                     and cn.document_type = 'CREDIT_NOTE'), 0),
         public.creditable_remaining(d.id)
  from public.dues d
  join public.tax_decisions td
    on td.source_type = 'DUE' and td.source_id = d.id
   and td.reverses_decision_id is null
   and not exists (select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
  where d.organization_id = p_organization_id
    and d.status <> 'VOID'
  order by (public.creditable_remaining(d.id) <= 0), d.issue_date desc;
end;
$$;


ALTER FUNCTION "public"."list_creditable_dues"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_due_type_catalogue_links"("p_organization_id" "uuid") RETURNS TABLE("due_type_id" "uuid", "due_type_name_ar" "text", "due_type_name_en" "text", "catalogue_item_id" "uuid", "item_name_ar" "text", "item_code" "text", "item_code_type" "text", "unit_code" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على ربط الأصناف'
      using errcode = '42501';
  end if;

  return query
  select dt.id, dt.name_ar, dt.name_en,
         ci.id, ci.name_ar, ci.item_code, ci.item_code_type, ci.unit_code
  from public.due_types dt
  left join public.catalogue_items ci on ci.id = dt.catalogue_item_id
  where dt.organization_id = p_organization_id and dt.is_active
  order by (dt.catalogue_item_id is not null
            and nullif(btrim(coalesce(ci.item_code, '')), '') is not null),
           dt.name_ar;
end;
$$;


ALTER FUNCTION "public"."list_due_type_catalogue_links"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_due_type_tax_mappings"("p_organization_id" "uuid") RETURNS TABLE("due_type_id" "uuid", "due_type_name_ar" "text", "due_type_name_en" "text", "mapping_id" "uuid", "revenue_nature" "text", "nature_name_ar" "text", "nature_name_en" "text", "status" "text", "notes" "text", "approved_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.tax_mapping.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.tax_mapping.manage')
  ) then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بالاطلاع على ربط أنواع المستحقات'
      using errcode = '42501';
  end if;

  return query
  select
    dt.id,
    dt.name_ar,
    dt.name_en,
    m.id,
    m.revenue_nature,
    rn.name_ar,
    rn.name_en,
    coalesce(m.status, 'REVIEW_REQUIRED'),
    m.notes,
    m.approved_at,
    m.updated_at
  from public.due_types dt
  left join public.due_type_revenue_natures m
    on m.due_type_id = dt.id and m.organization_id = dt.organization_id
  left join public.revenue_natures rn on rn.code = m.revenue_nature
  where dt.organization_id = p_organization_id
    and dt.is_active
  order by (coalesce(m.status, 'REVIEW_REQUIRED') = 'APPROVED'), dt.name_ar;
end;
$$;


ALTER FUNCTION "public"."list_due_type_tax_mappings"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_dunning_candidates"("p_organization_id" "uuid", "p_as_of" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("due_id" "uuid", "description" "text", "due_date" "date", "days_overdue" integer, "outstanding" numeric, "member_id" "uuid", "member_name" "text", "member_email" "text", "member_phone" "text", "stage" smallint, "stage_name_ar" "text", "stage_name_en" "text", "already_raised" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.dunning.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.dunning.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التحصيل'
      using errcode = '42501';
  end if;

  return query
  with overdue as (
    select d.id, d.description, d.due_date, d.unit_id,
           (p_as_of - d.due_date)::integer as days_late,
           public.due_outstanding(d.id) as outstanding
    from public.dues d
    where d.organization_id = p_organization_id
      and d.status in ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')
      and d.due_date < p_as_of
  ),
  with_stage as (
    select o.*,
           (select pol.stage from public.dunning_policies pol
            where pol.organization_id = p_organization_id and pol.is_active
              and o.days_late >= pol.days_overdue
              and o.outstanding >= pol.minimum_amount
            order by pol.days_overdue desc
            limit 1) as matched_stage
    from overdue o
    where o.outstanding > 0
  )
  select w.id, coalesce(w.description, ''), w.due_date, w.days_late, w.outstanding,
         m.id, m.full_name, m.email, m.phone,
         pol.stage, pol.name_ar, pol.name_en,
         exists (select 1 from public.dunning_notices n
                 where n.due_id = w.id and n.stage = pol.stage)
  from with_stage w
  join public.dunning_policies pol
    on pol.organization_id = p_organization_id and pol.stage = w.matched_stage
  left join public.unit_ownerships uo
    on uo.unit_id = w.unit_id and uo.is_primary_contact
   and (uo.end_date is null or uo.end_date >= p_as_of)
  left join public.members m on m.id = uo.member_id
  where w.matched_stage is not null
  order by w.days_late desc, w.outstanding desc;
end;
$$;


ALTER FUNCTION "public"."list_dunning_candidates"("p_organization_id" "uuid", "p_as_of" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_dunning_notices"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "due_id" "uuid", "stage" smallint, "stage_name_ar" "text", "stage_name_en" "text", "raised_on" "date", "days_overdue" integer, "outstanding_amount" numeric, "status" "text", "delivered_at" timestamp with time zone, "delivery_channel" "text", "member_name" "text", "member_email" "text", "member_phone" "text", "due_description" "text", "due_date" "date", "unit_code" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.dunning.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.dunning.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على الإشعارات'
      using errcode = '42501';
  end if;

  return query
  select n.id, n.due_id, n.stage, pol.name_ar, pol.name_en,
         n.raised_on, n.days_overdue, n.outstanding_amount,
         n.status, n.delivered_at, n.delivery_channel,
         m.full_name, m.email, m.phone,
         coalesce(d.description, ''), d.due_date, u.code
  from public.dunning_notices n
  left join public.dunning_policies pol
    on pol.organization_id = n.organization_id and pol.stage = n.stage
  left join public.members m on m.id = n.member_id
  left join public.dues d on d.id = n.due_id
  left join public.units u on u.id = d.unit_id
  where n.organization_id = p_organization_id
  -- غير المسلَّم أولًا: الشاشة للعمل المتبقي.
  order by (n.status <> 'RAISED'), n.raised_on desc, n.outstanding_amount desc;
end;
$$;


ALTER FUNCTION "public"."list_dunning_notices"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_exchange_rates"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "foreign_currency" "text", "base_currency" "text", "rate_date" "date", "base_per_unit" numeric, "source" "text", "is_latest" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.fx.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.fx.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على أسعار الصرف'
      using errcode = '42501';
  end if;

  return query
  select r.id, r.foreign_currency, r.base_currency, r.rate_date,
         r.base_per_unit, r.source,
         r.rate_date = max(r.rate_date) over (
           partition by r.foreign_currency, r.base_currency
         )
  from public.exchange_rates r
  where r.organization_id = p_organization_id
  order by r.foreign_currency, r.rate_date desc;
end;
$$;


ALTER FUNCTION "public"."list_exchange_rates"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_fixed_assets"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "code" "text", "name_ar" "text", "name_en" "text", "status" "text", "acquisition_date" "date", "acquisition_cost" numeric, "salvage_value" numeric, "useful_life_months" integer, "accumulated" numeric, "net_book_value" numeric, "remaining" numeric, "periods_posted" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.assets.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.assets.manage')
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على الأصول الثابتة'
      using errcode = '42501';
  end if;

  return query
  select a.id, a.code, a.name_ar, a.name_en, a.status,
         a.acquisition_date, a.acquisition_cost, a.salvage_value,
         a.useful_life_months,
         coalesce(d.total, 0),
         a.acquisition_cost - coalesce(d.total, 0),
         public.depreciable_remaining(a.id),
         coalesce(d.periods, 0)
  from public.fixed_assets a
  left join lateral (
    select sum(x.amount) as total, count(*) as periods
    from public.fixed_asset_depreciation x where x.fixed_asset_id = a.id
  ) d on true
  where a.organization_id = p_organization_id
  order by (a.status <> 'ACTIVE'), a.code;
end;
$$;


ALTER FUNCTION "public"."list_fixed_assets"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_payment_provider_settings"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "property_id" "uuid", "provider" "text", "environment" "text", "merchant_identifier" "text", "public_key" "text", "has_api_key" boolean, "has_hmac_secret" boolean, "status" "text", "enabled" boolean, "verified_at" timestamp with time zone, "last_verification_error" "text")
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  select id, property_id, provider, environment, merchant_identifier, public_key,
         api_key_secret_id is not null, hmac_secret_id is not null,
         status, enabled, verified_at, last_verification_error
  from public.payment_provider_settings
  where organization_id = p_organization_id;
$$;


ALTER FUNCTION "public"."list_payment_provider_settings"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_projects"("p_organization_id" "uuid") RETURNS TABLE("id" "uuid", "code" "text", "name_ar" "text", "name_en" "text", "status" "text", "accounts_set" boolean, "budget_amount" numeric, "capitalised" numeric, "released" numeric, "wip_balance" numeric, "budget_variance" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_org_member(auth.uid(), p_organization_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على المشاريع'
      using errcode = '42501';
  end if;

  return query
  select pr.id, pr.code, pr.name_ar, pr.name_en, pr.status,
         (pr.wip_account_id is not null and pr.cost_of_sales_account_id is not null),
         pr.budget_amount, s.capitalised, s.released, s.wip_balance,
         case when pr.budget_amount is null then null
              else pr.budget_amount - s.capitalised end
  from public.projects pr
  cross join lateral public.project_wip_summary(pr.id) s
  where pr.organization_id = p_organization_id
  order by (pr.status <> 'ACTIVE'), pr.code;
end;
$$;


ALTER FUNCTION "public"."list_projects"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."revenue_natures" (
    "code" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "is_derived" boolean DEFAULT false NOT NULL,
    "sort_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."revenue_natures" OWNER TO "postgres";


COMMENT ON TABLE "public"."revenue_natures" IS 'قاموس أنواع الإيراد على مستوى النظام. لا يحمل معالجة ضريبية — المعالجة تعيش في tax_rule_versions المؤرَّخة.';



COMMENT ON COLUMN "public"."revenue_natures"."is_derived" IS 'يرث معالجة التوريد الأصلي ولا يُحسم آليًا؛ يُمنع وضع قاعدة مباشرة له.';



CREATE OR REPLACE FUNCTION "public"."list_revenue_natures"() RETURNS SETOF "public"."revenue_natures"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select * from public.revenue_natures order by sort_order;
$$;


ALTER FUNCTION "public"."list_revenue_natures"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_tax_enforcement_lapses"() RETURNS TABLE("organization_id" "uuid", "organization_name" "text", "enabled_at" timestamp with time zone, "disabled_at" timestamp with time zone, "disabled_by" "uuid", "disabled_reason" "text", "dues_without_decision" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'FORBIDDEN_TAX_ENFORCEMENT: مراقبة فجوات الإنفاذ لمشرف المنصة وحده'
      using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.name,
    o.tax_enforcement_enabled_at,
    o.tax_enforcement_disabled_at,
    o.tax_enforcement_disabled_by,
    o.tax_enforcement_disabled_reason,
    (
      select count(*)
      from public.dues d
      where d.organization_id = o.id
        and d.status <> 'VOID'
        and d.created_at >= o.tax_enforcement_disabled_at
        and not exists (
          select 1 from public.tax_decisions td
          where td.source_type = 'DUE' and td.source_id = d.id
        )
    )
  from public.organizations o
  where o.tax_enforcement_enabled = false
    and o.tax_enforcement_disabled_at is not null
  order by o.tax_enforcement_disabled_at desc;
end;
$$;


ALTER FUNCTION "public"."list_tax_enforcement_lapses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_coa_after_use"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.is_used then
    if new.category is distinct from old.category or new.is_group is distinct from old.is_group then
      raise exception 'COA_USED_TYPE_LOCKED' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."lock_coa_after_use"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_coa_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_action text;
  v_changed_fields text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
    values (
      auth.uid(),
      new.organization_id,
      'coa.created',
      'chart_of_account',
      new.id,
      jsonb_build_object(
        'new', jsonb_build_object(
          'code', new.code, 'name_ar', new.name_ar, 'name_en', new.name_en,
          'parent_id', new.parent_id, 'category', new.category,
          'normal_balance', new.normal_balance, 'is_group', new.is_group, 'is_active', new.is_active
        )
      )
    );
    return new;
  end if;

  if new.code is distinct from old.code then v_changed_fields := array_append(v_changed_fields, 'code'); end if;
  if new.name_ar is distinct from old.name_ar then v_changed_fields := array_append(v_changed_fields, 'name_ar'); end if;
  if new.name_en is distinct from old.name_en then v_changed_fields := array_append(v_changed_fields, 'name_en'); end if;
  if new.parent_id is distinct from old.parent_id then v_changed_fields := array_append(v_changed_fields, 'parent_id'); end if;
  if new.category is distinct from old.category then v_changed_fields := array_append(v_changed_fields, 'category'); end if;
  if new.normal_balance is distinct from old.normal_balance then v_changed_fields := array_append(v_changed_fields, 'normal_balance'); end if;
  if new.is_group is distinct from old.is_group then v_changed_fields := array_append(v_changed_fields, 'is_group'); end if;
  if new.is_active is distinct from old.is_active then v_changed_fields := array_append(v_changed_fields, 'is_active'); end if;

  -- Nothing tracked actually changed (e.g. only updated_at moved) -- skip.
  if array_length(v_changed_fields, 1) is null then
    return new;
  end if;

  if v_changed_fields = array['is_active'] then
    v_action := case when new.is_active then 'coa.activated' else 'coa.deactivated' end;
  else
    v_action := 'coa.updated';
  end if;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(),
    new.organization_id,
    v_action,
    'chart_of_account',
    new.id,
    jsonb_build_object(
      'changed_fields', to_jsonb(v_changed_fields),
      'old', jsonb_build_object(
        'code', old.code, 'name_ar', old.name_ar, 'name_en', old.name_en,
        'parent_id', old.parent_id, 'category', old.category,
        'normal_balance', old.normal_balance, 'is_group', old.is_group, 'is_active', old.is_active
      ),
      'new', jsonb_build_object(
        'code', new.code, 'name_ar', new.name_ar, 'name_en', new.name_en,
        'parent_id', new.parent_id, 'category', new.category,
        'normal_balance', new.normal_balance, 'is_group', new.is_group, 'is_active', new.is_active
      )
    )
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."log_coa_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_sequence_value"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_sequence_type" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_value bigint;
begin
  insert into public.document_sequences (organization_id, property_id, sequence_type, next_value)
  values (p_organization_id, p_resort_id, p_sequence_type, 1)
  on conflict (organization_id, property_id, sequence_type) do nothing;

  update public.document_sequences
  set next_value = next_value + 1
  where organization_id = p_organization_id
    and (property_id = p_resort_id or (property_id is null and p_resort_id is null))
    and sequence_type = p_sequence_type
  returning next_value - 1 into v_value;

  return v_value;
end;
$$;


ALTER FUNCTION "public"."next_sequence_value"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_sequence_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_phone"("p_phone" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_res text;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  v_res := trim(p_phone);
  v_res := translate(v_res, '٠١٢٣٤٥٦٧٨٩', '0123456789');
  v_res := regexp_replace(v_res, '[\s\-\(\)]', '', 'g');
  RETURN v_res;
END;
$$;


ALTER FUNCTION "public"."normalize_phone"("p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_cashier_session"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_cashbox_id" "uuid", "p_opening_balance" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session_id uuid;
  v_cashbox_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'cashier.sessions.open') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية فتح جلسات الكاشير' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  select property_id into v_cashbox_resort_id
  from public.cashboxes
  where id = p_cashbox_id and organization_id = p_organization_id and is_active;
  if v_cashbox_resort_id is null then
    raise exception 'CASHBOX_NOT_FOUND: الصندوق غير موجود في هذا الكيان أو غير نشط' using errcode = '22023';
  end if;
  if v_cashbox_resort_id <> p_resort_id then
    raise exception 'CASHBOX_RESORT_MISMATCH: الصندوق المحدد يتبع موقعًا مختلفًا عن الموقع المحدد' using errcode = '22023';
  end if;

  if exists (select 1 from public.cashier_sessions where cashbox_id = p_cashbox_id and status = 'OPEN') then
    raise exception 'OPEN_SESSION_EXISTS: يوجد بالفعل جلسة مفتوحة لهذا الصندوق' using errcode = '22023';
  end if;

  insert into public.cashier_sessions (organization_id, property_id, cashbox_id, opened_by, opening_balance)
  values (p_organization_id, p_resort_id, p_cashbox_id, auth.uid(), coalesce(p_opening_balance, 0))
  returning id into v_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'cashier_session.opened', 'cashier_session', v_session_id,
    jsonb_build_object('opening_balance', p_opening_balance));

  return v_session_id;
end;
$$;


ALTER FUNCTION "public"."open_cashier_session"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_cashbox_id" "uuid", "p_opening_balance" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."organization_is_active"("p_organization_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.status in ('TRIAL', 'ACTIVE')
  );
$$;


ALTER FUNCTION "public"."organization_is_active"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_commission"("p_commission_id" "uuid", "p_cash_account_id" "uuid", "p_paid_date" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_c record;
  v_payable_account uuid;
  v_fiscal_period_id uuid;
  v_entry_id uuid;
  v_broker_name text;
begin
  select * into v_c from public.commissions where id = p_commission_id for update;
  if v_c.id is null then
    raise exception 'COMMISSION_NOT_FOUND: العمولة غير موجودة' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_c.organization_id, 'finance.commissions.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بسداد العمولات' using errcode = '42501';
  end if;

  if v_c.status <> 'ACCRUED' then
    raise exception 'COMMISSION_NOT_ACCRUED: لا يمكن سداد عمولة غير مستحقة أو مسددة بالفعل' using errcode = 'P0001';
  end if;

  select commission_payable_account_id into v_payable_account
  from public.organization_finance_settings
  where organization_id = v_c.organization_id
  order by (property_id = v_c.property_id) desc nulls last
  limit 1;

  if v_payable_account is null then
    raise exception 'COMMISSION_ACCOUNTS_NOT_SET: لم يُحدَّد حساب التزام العمولات' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_cash_account_id and organization_id = v_c.organization_id and not is_group
  ) then
    raise exception 'CASH_ACCOUNT_INVALID: حساب النقدية لا ينتمي لهذه المؤسسة' using errcode = '22023';
  end if;

  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = v_c.organization_id
    and fp.status = 'OPEN'
    and p_paid_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  if v_fiscal_period_id is null then
    raise exception
      'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي تاريخ السداد (%)', p_paid_date
      using errcode = 'P0001';
  end if;

  select name into v_broker_name from public.brokers where id = v_c.broker_id;

  v_entry_id := public.create_journal_entry_internal(
    v_c.organization_id, v_c.property_id, v_fiscal_period_id, p_paid_date,
    'Commission paid — ' || coalesce(v_broker_name, ''),
    'PAYMENT_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_payable_account, 'debit', v_c.net_amount, 'credit', 0),
      jsonb_build_object('account_id', p_cash_account_id, 'debit', 0, 'credit', v_c.net_amount)
    ),
    'commission_payment:' || p_commission_id::text
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.commissions
  set status = 'PAID', paid_date = p_paid_date, payment_journal_entry_id = v_entry_id
  where id = p_commission_id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  ) values (
    auth.uid(), v_c.organization_id, v_c.property_id,
    'commission.paid', 'commission', p_commission_id,
    jsonb_build_object('broker', v_broker_name, 'net_paid', v_c.net_amount)
  );

  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."pay_commission"("p_commission_id" "uuid", "p_cash_account_id" "uuid", "p_paid_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_depreciation_for_period"("p_organization_id" "uuid", "p_fiscal_period_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_period public.fiscal_periods;
  v_asset public.fixed_assets;
  v_amount numeric;
  v_entry_id uuid;
  v_posted int := 0;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.assets.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بترحيل الإهلاك'
      using errcode = '42501';
  end if;

  select * into v_period from public.fiscal_periods
  where id = p_fiscal_period_id and organization_id = p_organization_id;
  if not found then
    raise exception 'FISCAL_PERIOD_NOT_FOUND: الفترة المالية غير موجودة في هذه المؤسسة'
      using errcode = 'P0001';
  end if;

  if v_period.status <> 'OPEN' then
    raise exception
      'FISCAL_PERIOD_NOT_OPEN: الفترة (%) ليست مفتوحة، فلا يمكن ترحيل الإهلاك إليها', v_period.name
      using errcode = 'P0001';
  end if;

  for v_asset in
    select a.* from public.fixed_assets a
    where a.organization_id = p_organization_id
      and a.status = 'ACTIVE'
      and a.acquisition_date <= v_period.end_date
      and not exists (
        select 1 from public.fixed_asset_depreciation d
        where d.fixed_asset_id = a.id and d.fiscal_period_id = p_fiscal_period_id
      )
    order by a.code
  loop
    v_amount := public.depreciation_for_period(v_asset.id);

    if v_amount <= 0 then
      update public.fixed_assets set status = 'FULLY_DEPRECIATED' where id = v_asset.id;
      continue;
    end if;

    v_entry_id := public.create_journal_entry_internal(
      p_organization_id,
      v_asset.property_id,
      p_fiscal_period_id,
      v_period.end_date,
      'Depreciation — ' || v_asset.code || ' ' || v_asset.name_en,
      'JOURNAL_VOUCHER',
      jsonb_build_array(
        jsonb_build_object('account_id', v_asset.depreciation_expense_account_id, 'debit', v_amount, 'credit', 0),
        jsonb_build_object('account_id', v_asset.accumulated_depreciation_account_id, 'debit', 0, 'credit', v_amount)
      ),
      'depreciation:' || v_asset.id::text || ':' || p_fiscal_period_id::text
    );
    perform public.post_journal_entry_internal(v_entry_id);

    insert into public.fixed_asset_depreciation (
      organization_id, fixed_asset_id, fiscal_period_id, entry_date, amount,
      journal_entry_id, posted_by
    ) values (
      p_organization_id, v_asset.id, p_fiscal_period_id, v_period.end_date, v_amount,
      v_entry_id, auth.uid()
    );

    if public.depreciable_remaining(v_asset.id) <= 0 then
      update public.fixed_assets set status = 'FULLY_DEPRECIATED' where id = v_asset.id;
    end if;

    v_posted := v_posted + 1;
  end loop;

  return v_posted;
end;
$$;


ALTER FUNCTION "public"."post_depreciation_for_period"("p_organization_id" "uuid", "p_fiscal_period_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_due_to_ledger"("p_due_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_due record;
  v_revenue_account_id uuid;
  v_fiscal_period_id uuid;
  v_entry_id uuid;
  v_decision record;
  v_lines jsonb;
begin
  select d.*, dt.default_revenue_account_id
  into v_due
  from public.dues d
  join public.due_types dt on dt.id = d.due_type_id
  where d.id = p_due_id;

  if v_due.id is null then
    return null;
  end if;

  if v_due.status in ('DRAFT', 'VOID') then
    return null;
  end if;

  if v_due.journal_entry_id is not null then
    return v_due.journal_entry_id;
  end if;

  v_revenue_account_id := v_due.default_revenue_account_id;
  if v_revenue_account_id is null then
    raise exception 'DUE_TYPE_HAS_NO_REVENUE_ACCOUNT: نوع المستحق لا يحمل حساب إيراد' using errcode = 'P0001';
  end if;

  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = v_due.organization_id
    and fp.status = 'OPEN'
    and v_due.issue_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  if v_fiscal_period_id is null then
    return null;
  end if;

  -- القرار الضريبي النشط، إن وُجد. الـtrigger يختمه قبل هذا الترحيل، فالقيد
  -- يعرف نصيب الضريبة من الإجمالي قبل أن يُكتب لا بعده.
  select td.taxable_base, td.vat_amount, td.gross_amount, td.output_tax_account_id
  into v_decision
  from public.tax_decisions td
  where td.source_type = 'DUE' and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
  order by td.decided_at desc
  limit 1;

  if v_decision.vat_amount is not null and v_decision.vat_amount > 0 then
    if v_decision.output_tax_account_id is null then
      raise exception 'OUTPUT_TAX_ACCOUNT_MISSING: القرار الضريبي بلا حساب ضريبة مخرجات'
        using errcode = 'P0001';
    end if;
    -- الذمم بالإجمالي، الإيراد بالصافي، والضريبة التزام. والإجمالي هو مبلغ
    -- المستحق نفسه لأن الأساس الصافي مرفوض عند القرار، فتبقى الذمم مطابقة
    -- للسجل الفرعي الذي تُخصَّص عليه المدفوعات.
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_due.receivable_account_id,
                         'debit', v_decision.gross_amount, 'credit', 0),
      jsonb_build_object('account_id', v_revenue_account_id,
                         'debit', 0, 'credit', v_decision.taxable_base),
      jsonb_build_object('account_id', v_decision.output_tax_account_id,
                         'debit', 0, 'credit', v_decision.vat_amount)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_due.receivable_account_id, 'debit', v_due.amount, 'credit', 0),
      jsonb_build_object('account_id', v_revenue_account_id, 'debit', 0, 'credit', v_due.amount)
    );
  end if;

  v_entry_id := public.create_journal_entry_internal(
    v_due.organization_id,
    v_due.property_id,
    v_fiscal_period_id,
    v_due.issue_date,
    coalesce(v_due.description, 'Due issued'),
    'JOURNAL_VOUCHER',
    v_lines,
    'due:' || p_due_id::text
  );

  perform public.post_journal_entry_internal(v_entry_id);

  update public.dues set journal_entry_id = v_entry_id where id = p_due_id;

  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."post_due_to_ledger"("p_due_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_fx_difference"("p_organization_id" "uuid", "p_property_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_difference" numeric, "p_counter_account_id" "uuid", "p_description" "text", "p_idempotency_key" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ready boolean;
  v_gain uuid;
  v_loss uuid;
  v_reason text;
  v_scale int;
  v_currency text;
  v_diff numeric;
  v_entry_id uuid;
begin
  select r.ready, r.gain_account_id, r.loss_account_id, r.reason
  into v_ready, v_gain, v_loss, v_reason
  from public.check_fx_readiness(p_organization_id) r;

  if not v_ready then
    raise exception
      '%: عيّن حسابي ربح وخسارة فرق العملة قبل ترحيل أي فرق', v_reason
      using errcode = 'P0001';
  end if;

  select o.default_currency into v_currency from public.organizations o where o.id = p_organization_id;
  v_scale := public.currency_decimals(coalesce(v_currency, 'EGP'));
  v_diff := round(p_difference, v_scale);

  if v_diff = 0 then
    return null;
  end if;

  if v_diff > 0 then
    v_entry_id := public.create_journal_entry_internal(
      p_organization_id, p_property_id, p_fiscal_period_id, p_entry_date,
      p_description, 'JOURNAL_VOUCHER',
      jsonb_build_array(
        jsonb_build_object('account_id', p_counter_account_id, 'debit', v_diff, 'credit', 0),
        jsonb_build_object('account_id', v_gain, 'debit', 0, 'credit', v_diff)
      ),
      p_idempotency_key
    );
  else
    v_entry_id := public.create_journal_entry_internal(
      p_organization_id, p_property_id, p_fiscal_period_id, p_entry_date,
      p_description, 'JOURNAL_VOUCHER',
      jsonb_build_array(
        jsonb_build_object('account_id', v_loss, 'debit', -v_diff, 'credit', 0),
        jsonb_build_object('account_id', p_counter_account_id, 'debit', 0, 'credit', -v_diff)
      ),
      p_idempotency_key
    );
  end if;

  perform public.post_journal_entry_internal(v_entry_id);
  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."post_fx_difference"("p_organization_id" "uuid", "p_property_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_difference" numeric, "p_counter_account_id" "uuid", "p_description" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_journal_entry"("p_journal_entry_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id from public.journal_entries where id = p_journal_entry_id;
  if v_org_id is null then
    raise exception 'journal entry not found';
  end if;

  if not public.has_permission(auth.uid(), v_org_id, 'finance.entries.post') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform public.post_journal_entry_internal(p_journal_entry_id);
end;
$$;


ALTER FUNCTION "public"."post_journal_entry"("p_journal_entry_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_journal_entry_internal"("p_journal_entry_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_entry public.journal_entries;
  v_period public.fiscal_periods;
  v_line_count int;
  v_total_debit numeric(19, 4);
  v_total_credit numeric(19, 4);
  v_bad_account_count int;
  v_missing_cost_center_count int;
  v_entry_number bigint;
begin
  select * into v_entry from public.journal_entries where id = p_journal_entry_id;
  if v_entry.id is null then
    raise exception 'journal entry not found';
  end if;

  if not public.organization_is_active(v_entry.organization_id) then
    raise exception 'organization is not active';
  end if;
  if v_entry.status not in ('DRAFT', 'UNDER_REVIEW') then
    raise exception 'only draft or under-review entries can be posted';
  end if;

  select * into v_period from public.fiscal_periods where id = v_entry.fiscal_period_id;
  if v_period.status <> 'OPEN' then
    raise exception 'fiscal period is not open';
  end if;
  if v_entry.entry_date < v_period.start_date or v_entry.entry_date > v_period.end_date then
    raise exception 'entry date does not belong to the selected period';
  end if;

  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into v_line_count, v_total_debit, v_total_credit
  from public.journal_entry_lines
  where journal_entry_id = p_journal_entry_id;

  if v_line_count < 2 then
    raise exception 'a posted entry requires at least two lines';
  end if;
  if v_total_debit <> v_total_credit then
    raise exception 'unbalanced entry: total debit % does not equal total credit %', v_total_debit, v_total_credit;
  end if;

  select count(*) into v_bad_account_count
  from public.journal_entry_lines l
  join public.chart_of_accounts a on a.id = l.account_id
  where l.journal_entry_id = p_journal_entry_id
    and (a.is_group or not a.is_active or a.organization_id <> v_entry.organization_id);

  if v_bad_account_count > 0 then
    raise exception 'entry contains lines posted to a group, inactive, or cross-tenant account';
  end if;

  select count(*) into v_missing_cost_center_count
  from public.journal_entry_lines l
  join public.chart_of_accounts a on a.id = l.account_id
  where l.journal_entry_id = p_journal_entry_id
    and a.requires_cost_center
    and l.cost_center_id is null;

  if v_missing_cost_center_count > 0 then
    raise exception 'one or more lines are missing a required cost center';
  end if;

  v_entry_number := public.next_sequence_value(v_entry.organization_id, null, 'journal_entry');

  update public.journal_entries
  set status = 'POSTED', posted_by = auth.uid(), posted_at = now(), entry_number = v_entry_number
  where id = p_journal_entry_id;

  update public.chart_of_accounts
  set is_used = true
  where id in (
    select account_id from public.journal_entry_lines where journal_entry_id = p_journal_entry_id
  ) and not is_used;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_entry.organization_id, v_entry.property_id, 'journal_entry.posted', 'journal_entry', p_journal_entry_id,
    jsonb_build_object('entry_number', v_entry_number, 'total', v_total_debit));
end;
$$;


ALTER FUNCTION "public"."post_journal_entry_internal"("p_journal_entry_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_payment_internal"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_member_id" "uuid", "p_unit_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_deposit_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid", "p_actor_id" "uuid") RETURNS TABLE("payment_id" "uuid", "allocated_amount" numeric, "unallocated_amount" numeric, "affected_due_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_alloc jsonb;
  v_due public.dues;
  v_allocated_total numeric(19,4) := 0;
  v_remaining numeric(19,4);
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_payment_id uuid;
  v_existing_payment_id uuid;
  v_receipt_number bigint;
  v_paid_so_far numeric(19,4);
  v_new_status text;
  v_session public.cashier_sessions;
  v_affected_due_ids uuid[] := '{}';
begin
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if p_amount <= 0 then
    raise exception 'AMOUNT_INVALID: يجب أن يكون المبلغ أكبر من صفر' using errcode = '22023';
  end if;
  if p_allocations is null or jsonb_array_length(p_allocations) < 1 then
    raise exception 'ALLOCATIONS_REQUIRED: يجب توزيع المبلغ على استحقاق واحد على الأقل' using errcode = '22023';
  end if;

  if p_cashier_session_id is not null then
    select * into v_session from public.cashier_sessions where id = p_cashier_session_id;
    if v_session.id is null or v_session.organization_id <> p_organization_id then
      raise exception 'CASHIER_SESSION_NOT_FOUND: جلسة الكاشير غير موجودة في هذا الكيان' using errcode = '22023';
    end if;
    if v_session.status <> 'OPEN' then
      raise exception 'CASHIER_SESSION_NOT_OPEN: جلسة الكاشير غير مفتوحة' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.cashboxes
      where id = v_session.cashbox_id and gl_account_id = p_deposit_account_id
    ) then
      raise exception 'DEPOSIT_ACCOUNT_MISMATCH: حساب الإيداع لا يطابق صندوق جلسة الكاشير' using errcode = '22023';
    end if;
  end if;

  if p_idempotency_key is not null then
    select id into v_payment_id
    from public.payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return query
        select v_payment_id, p_amount, 0::numeric(19,4),
          array(select pa.due_id from public.payment_allocations pa where pa.payment_id = v_payment_id);
      return;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  if p_idempotency_key is not null then
    select id into v_payment_id
    from public.payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return query
        select v_payment_id, p_amount, 0::numeric(19,4),
          array(select pa.due_id from public.payment_allocations pa where pa.payment_id = v_payment_id);
      return;
    end if;
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    select * into v_due from public.dues where id = (v_alloc ->> 'due_id')::uuid for update;
    if v_due.id is null or v_due.organization_id <> p_organization_id then
      raise exception 'DUE_NOT_FOUND: الاستحقاق غير موجود في هذا الكيان' using errcode = '22023';
    end if;
    if v_due.property_id <> p_resort_id then
      raise exception 'DUE_RESORT_MISMATCH: الاستحقاق % يتبع موقعًا مختلفًا عن موقع الدفعة', v_due.id using errcode = '22023';
    end if;
    if v_due.status = 'VOID' then
      raise exception 'DUE_VOID: لا يمكن سداد استحقاق ملغى' using errcode = '22023';
    end if;

    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    v_remaining := v_due.amount - v_paid_so_far;
    if (v_alloc ->> 'amount')::numeric(19,4) > v_remaining then
      raise exception 'ALLOCATION_EXCEEDS_REMAINING: المبلغ (%) أكبر من المتبقي (%) على الاستحقاق %', v_alloc ->> 'amount', v_remaining, v_due.id using errcode = '22023';
    end if;

    v_allocated_total := v_allocated_total + (v_alloc ->> 'amount')::numeric(19,4);
  end loop;

  if v_allocated_total <> p_amount then
    raise exception 'ALLOCATIONS_MISMATCH: مجموع التوزيع (%) يجب أن يساوي مبلغ الدفعة (%)', v_allocated_total, p_amount using errcode = '22023';
  end if;

  for v_grouped in
    select d.receivable_account_id as account_id, sum((a ->> 'amount')::numeric(19,4)) as total
    from jsonb_array_elements(p_allocations) a
    join public.dues d on d.id = (a ->> 'due_id')::uuid
    group by d.receivable_account_id
  loop
    v_credit_lines := v_credit_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_grouped.account_id, 'debit', 0, 'credit', v_grouped.total)
    );
  end loop;

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_payment_date,
    'Payment received', 'RECEIPT_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id', p_deposit_account_id, 'debit', p_amount, 'credit', 0)) || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  v_receipt_number := public.next_sequence_value(p_organization_id, null, 'receipt');

  begin
    insert into public.payments (
      organization_id, property_id, member_id, unit_id, amount, method, payment_date,
      receipt_number, deposit_account_id, journal_entry_id, idempotency_key, created_by
    ) values (
      p_organization_id, p_resort_id, p_member_id, p_unit_id, p_amount, p_method, p_payment_date,
      v_receipt_number, p_deposit_account_id, v_entry_id, p_idempotency_key, p_actor_id
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      if p_idempotency_key is not null then
        select id into v_existing_payment_id
        from public.payments
        where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
        if v_existing_payment_id is null then raise; end if;
        return query
          select v_existing_payment_id, p_amount, 0::numeric(19,4),
            array(select pa.due_id from public.payment_allocations pa where pa.payment_id = v_existing_payment_id);
        return;
      else
        raise;
      end if;
  end;

  if p_cashier_session_id is not null then
    insert into public.cash_transactions (organization_id, session_id, type, amount, payment_id, created_by)
    values (p_organization_id, p_cashier_session_id, 'RECEIPT', p_amount, v_payment_id, p_actor_id);
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    insert into public.payment_allocations (payment_id, due_id, amount)
    values (v_payment_id, (v_alloc ->> 'due_id')::uuid, (v_alloc ->> 'amount')::numeric(19,4));

    select * into v_due from public.dues where id = (v_alloc ->> 'due_id')::uuid;
    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    v_new_status := case when v_paid_so_far >= v_due.amount then 'PAID' else 'PARTIALLY_PAID' end;
    update public.dues set status = v_new_status where id = v_due.id;
    v_affected_due_ids := v_affected_due_ids || v_due.id;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (p_actor_id, p_organization_id, p_resort_id, 'payment.recorded', 'payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'receipt_number', v_receipt_number, 'cashier_session_id', p_cashier_session_id));

  return query select v_payment_id, v_allocated_total, (p_amount - v_allocated_total), v_affected_due_ids;
end;
$$;


ALTER FUNCTION "public"."post_payment_internal"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_member_id" "uuid", "p_unit_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_deposit_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_supplier_invoice"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_order_id" "uuid", "p_invoice_number" "text", "p_expense_account_id" "uuid", "p_net_amount" numeric, "p_discount_amount" numeric, "p_vat_rate" numeric, "p_vat_account_id" "uuid", "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_invoice_date" "date", "p_due_date" "date", "p_fiscal_period_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_payable_account_id uuid;
  v_entry_id uuid;
  v_invoice_id uuid;
  v_taxable_base numeric(19, 4);
  v_vat_amount numeric(19, 4);
  v_wht_amount numeric(19, 4);
  v_gross_amount numeric(19, 4);
  v_debit_lines jsonb;
  v_po public.purchase_orders;
  v_already_invoiced numeric(19, 4);
begin
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية ترحيل فواتير في هذا الموقع' using errcode = '42501';
  end if;
  if p_net_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if coalesce(p_discount_amount, 0) < 0 or coalesce(p_discount_amount, 0) >= p_net_amount then
    raise exception 'discount must be zero or less than the invoice net amount';
  end if;
  if coalesce(p_vat_rate, 0) < 0 or coalesce(p_vat_rate, 0) > 100 then
    raise exception 'VAT rate out of range';
  end if;
  if coalesce(p_wht_rate, 0) < 0 or coalesce(p_wht_rate, 0) > 100 then
    raise exception 'WHT rate out of range';
  end if;
  if coalesce(p_vat_rate, 0) > 0 and p_vat_account_id is null then
    raise exception 'VAT account is required when a VAT rate is set';
  end if;
  if coalesce(p_wht_rate, 0) > 0 and p_wht_account_id is null then
    raise exception 'WHT account is required when a WHT rate is set';
  end if;
  if p_vat_account_id is not null and not exists (
    select 1 from public.chart_of_accounts where id = p_vat_account_id and organization_id = p_organization_id
  ) then
    raise exception 'VAT account does not belong to this organization';
  end if;
  if p_wht_account_id is not null and not exists (
    select 1 from public.chart_of_accounts where id = p_wht_account_id and organization_id = p_organization_id
  ) then
    raise exception 'WHT account does not belong to this organization';
  end if;

  select payable_account_id into v_payable_account_id
  from public.suppliers where id = p_supplier_id and organization_id = p_organization_id;
  if v_payable_account_id is null then
    raise exception 'supplier does not belong to this organization';
  end if;

  v_taxable_base := p_net_amount - coalesce(p_discount_amount, 0);
  v_vat_amount := round(v_taxable_base * coalesce(p_vat_rate, 0) / 100, 4);
  v_wht_amount := round(v_taxable_base * coalesce(p_wht_rate, 0) / 100, 4);
  v_gross_amount := v_taxable_base + v_vat_amount;

  if p_purchase_order_id is not null then
    perform pg_advisory_xact_lock(hashtext('post_supplier_invoice_po_' || p_purchase_order_id::text));

    select * into v_po from public.purchase_orders where id = p_purchase_order_id;
    if v_po.id is null or v_po.organization_id <> p_organization_id then
      raise exception 'PO_NOT_FOUND: أمر الشراء غير موجود في هذا الكيان' using errcode = '22023';
    end if;
    if v_po.supplier_id <> p_supplier_id then
      raise exception 'PO_SUPPLIER_MISMATCH: أمر الشراء صادر لمورد مختلف عن المورد المحدد' using errcode = '22023';
    end if;
    if v_po.status not in ('APPROVED', 'RECEIVED') then
      raise exception 'PO_NOT_APPROVED: لا يمكن ترحيل فاتورة على أمر شراء غير معتمد' using errcode = '22023';
    end if;

    select coalesce(sum(net_amount), 0) into v_already_invoiced
    from public.supplier_invoices
    where purchase_order_id = p_purchase_order_id and status <> 'CANCELLED';

    if v_already_invoiced + p_net_amount > v_po.amount then
      raise exception 'PO_AMOUNT_EXCEEDED: مبلغ الفاتورة (%) يتجاوز المتبقي من أمر الشراء (%)', p_net_amount, v_po.amount - v_already_invoiced
        using errcode = '22023';
    end if;
  end if;

  v_debit_lines := jsonb_build_array(jsonb_build_object('account_id', p_expense_account_id, 'debit', v_taxable_base, 'credit', 0));
  -- ضريبة المدخلات كانت تُحمَّل كاملةً على حساب يمرره المستدعي، أي **أصلًا
  -- قابلًا للاسترداد دائمًا** بلا أي إثبات أهلية. صار التقسيم من نموذج الأهلية:
  -- الجزء القابل أصل على الحساب المحلول، والباقي تكلفة على حساب المصروف.
  -- وغياب الإعلان أو المستند أو رقم المورد يعني **لا أصل** لا يعني لا تسجيل.
  if v_vat_amount > 0 then
    v_debit_lines := v_debit_lines || (
      select case
        when s.recoverable_amount > 0 and s.non_recoverable_amount > 0 then
          jsonb_build_array(
            jsonb_build_object('account_id', s.input_tax_account_id,
                               'debit', s.recoverable_amount, 'credit', 0),
            jsonb_build_object('account_id', p_expense_account_id,
                               'debit', s.non_recoverable_amount, 'credit', 0))
        when s.recoverable_amount > 0 then
          jsonb_build_array(
            jsonb_build_object('account_id', s.input_tax_account_id,
                               'debit', s.recoverable_amount, 'credit', 0))
        else
          jsonb_build_array(
            jsonb_build_object('account_id', p_expense_account_id,
                               'debit', v_vat_amount, 'credit', 0))
      end
      from public.compute_input_tax_split(
        p_organization_id, p_expense_account_id, p_supplier_id, p_invoice_number, v_vat_amount,
        public.currency_decimals(
          coalesce((select default_currency from public.organizations where id = p_organization_id), 'EGP'))
      ) s
    );
  end if;

  -- Uses the _internal variants (see 20260813000005): finance.entries.create
  -- (checked above, resort-scoped) already authorizes this whole atomic
  -- "post invoice + post its own entry" action.
  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_invoice_date,
    'Supplier invoice ' || p_invoice_number, 'JOURNAL_VOUCHER',
    v_debit_lines || jsonb_build_array(jsonb_build_object('account_id', v_payable_account_id, 'debit', 0, 'credit', v_gross_amount)),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  insert into public.supplier_invoices (
    organization_id, property_id, supplier_id, purchase_order_id, invoice_number,
    expense_account_id, payable_account_id, amount, net_amount, discount_amount,
    vat_rate, vat_amount, vat_account_id, wht_rate, wht_amount, wht_account_id,
    invoice_date, due_date, journal_entry_id, created_by
  ) values (
    p_organization_id, p_resort_id, p_supplier_id, p_purchase_order_id, p_invoice_number,
    p_expense_account_id, v_payable_account_id, v_gross_amount, p_net_amount, coalesce(p_discount_amount, 0),
    coalesce(p_vat_rate, 0), v_vat_amount, p_vat_account_id, coalesce(p_wht_rate, 0), v_wht_amount, p_wht_account_id,
    p_invoice_date, p_due_date, v_entry_id, auth.uid()
  )
  returning id into v_invoice_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'supplier_invoice.posted', 'supplier_invoice', v_invoice_id,
    jsonb_build_object('amount', v_gross_amount, 'invoice_number', p_invoice_number, 'purchase_order_id', p_purchase_order_id));

  return v_invoice_id;
end;
$$;


ALTER FUNCTION "public"."post_supplier_invoice"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_order_id" "uuid", "p_invoice_number" "text", "p_expense_account_id" "uuid", "p_net_amount" numeric, "p_discount_amount" numeric, "p_vat_rate" numeric, "p_vat_account_id" "uuid", "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_invoice_date" "date", "p_due_date" "date", "p_fiscal_period_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_supplier_invoice_in_currency"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_order_id" "uuid", "p_invoice_number" "text", "p_expense_account_id" "uuid", "p_net_amount" numeric, "p_discount_amount" numeric, "p_vat_rate" numeric, "p_vat_account_id" "uuid", "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_invoice_date" "date", "p_due_date" "date", "p_fiscal_period_id" "uuid", "p_currency" "text", "p_exchange_rate" numeric DEFAULT NULL::numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_base text;
  v_rate numeric;
  v_scale int;
  v_base_net numeric;
  v_base_discount numeric;
  v_invoice_id uuid;
  v_foreign_gross numeric;
begin
  select o.default_currency into v_base
  from public.organizations o where o.id = p_organization_id;
  if v_base is null then
    raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_currency is null or upper(p_currency) = upper(v_base) then
    return public.post_supplier_invoice(
      p_organization_id, p_resort_id, p_supplier_id, p_purchase_order_id,
      p_invoice_number, p_expense_account_id, p_net_amount, p_discount_amount,
      p_vat_rate, p_vat_account_id, p_wht_rate, p_wht_account_id,
      p_invoice_date, p_due_date, p_fiscal_period_id
    );
  end if;

  if p_exchange_rate is not null then
    if p_exchange_rate <= 0 then
      raise exception 'EXCHANGE_RATE_INVALID: السعر يجب أن يكون أكبر من صفر'
        using errcode = '22023';
    end if;
    v_rate := p_exchange_rate;
  else
    select g.rate into v_rate
    from public.get_exchange_rate(p_organization_id, p_currency, v_base, p_invoice_date) g;

    if v_rate is null then
      raise exception
        'EXCHANGE_RATE_MISSING: لا يوجد سعر صرف لـ % مقابل % في % أو قبله — سجّل السعر أو مرّر سعر الفاتورة',
        upper(p_currency), upper(v_base), p_invoice_date
        using errcode = 'P0001';
    end if;
  end if;

  v_scale := public.currency_decimals(v_base);
  v_base_net := round(p_net_amount * v_rate, v_scale);
  v_base_discount := round(coalesce(p_discount_amount, 0) * v_rate, v_scale);

  v_invoice_id := public.post_supplier_invoice(
    p_organization_id, p_resort_id, p_supplier_id, p_purchase_order_id,
    p_invoice_number, p_expense_account_id, v_base_net, v_base_discount,
    p_vat_rate, p_vat_account_id, p_wht_rate, p_wht_account_id,
    p_invoice_date, p_due_date, p_fiscal_period_id
  );

  v_foreign_gross := round(
    (p_net_amount - coalesce(p_discount_amount, 0))
    * (1 + coalesce(p_vat_rate, 0) / 100), 4);

  update public.supplier_invoices
  set currency = upper(p_currency),
      exchange_rate = v_rate,
      foreign_net_amount = p_net_amount,
      foreign_discount_amount = coalesce(p_discount_amount, 0),
      foreign_amount = v_foreign_gross
  where id = v_invoice_id;

  return v_invoice_id;
end;
$$;


ALTER FUNCTION "public"."post_supplier_invoice_in_currency"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_order_id" "uuid", "p_invoice_number" "text", "p_expense_account_id" "uuid", "p_net_amount" numeric, "p_discount_amount" numeric, "p_vat_rate" numeric, "p_vat_account_id" "uuid", "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_invoice_date" "date", "p_due_date" "date", "p_fiscal_period_id" "uuid", "p_currency" "text", "p_exchange_rate" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_delete_used_coa"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.is_used then
    raise exception 'COA_USED_DELETE_FORBIDDEN' using errcode = '22023';
  end if;
  return old;
end;
$$;


ALTER FUNCTION "public"."prevent_delete_used_coa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_uncancel_supplier_invoice"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status = 'CANCELLED' and new.status <> 'CANCELLED' then
    raise exception 'cannot change the status of an already-cancelled supplier invoice';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_uncancel_supplier_invoice"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_unreverse_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.status = 'REVERSED' and new.status <> 'REVERSED' then
    raise exception 'cannot change the status of an already-reversed payment';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_unreverse_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_unreverse_payment_allocation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.reversed_at is not null and new.reversed_at is null then
    raise exception 'cannot clear reversed_at on an already-reversed payment allocation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_unreverse_payment_allocation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_unreverse_supplier_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.reversed_at is not null and new.reversed_at is null then
    raise exception 'cannot clear reversed_at on an already-reversed supplier payment';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_unreverse_supplier_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_unreverse_supplier_payment_allocation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if old.reversed_at is not null and new.reversed_at is null then
    raise exception 'cannot clear reversed_at on an already-reversed supplier payment allocation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_unreverse_supplier_payment_allocation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."preview_generate_recurring_dues"("p_organization_id" "uuid", "p_schedule_id" "uuid", "p_period" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_schedule record;
  v_building_ids jsonb;
  v_zone_ids jsonb;
  v_unit_types jsonb;
  v_issue_date date;
  v_due_date date;
  v_existing_run record;
  v_unit_count int := 0;
  v_total_amount numeric(19, 4) := 0;
  v_by_unit_type jsonb := '{}'::jsonb;
  v_sample_units jsonb := '[]'::jsonb;
  v_unit_record record;
  v_unit_amount numeric(19, 4);
  v_type_entry jsonb;
begin
  select * into v_schedule
  from public.due_schedules
  where id = p_schedule_id and organization_id = p_organization_id;

  if v_schedule.id is null then
    raise exception 'جدول الرسوم الدوري غير موجود' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.schedules.generate', v_schedule.property_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بمعاينة توليد الرسوم الدورية' using errcode = '42501';
  end if;

  if not v_schedule.is_active then
    raise exception 'جدول الرسوم الدوري موقوف' using errcode = '22023';
  end if;

  select id, generated_units_count, total_amount, generated_at
    into v_existing_run
  from public.due_generation_runs
  where schedule_id = p_schedule_id and period = p_period;

  if v_existing_run.id is not null then
    return jsonb_build_object(
      'schedule_name', v_schedule.name,
      'period', p_period,
      'idempotent', true,
      'existing_run', jsonb_build_object(
        'generated_units_count', v_existing_run.generated_units_count,
        'total_amount', v_existing_run.total_amount,
        'generated_at', v_existing_run.generated_at
      )
    );
  end if;

  if v_schedule.frequency = 'MONTHLY' then
    v_issue_date := to_date(p_period || '-01', 'YYYY-MM-DD');
  else
    v_issue_date := to_date(p_period || '-01-01', 'YYYY-MM-DD');
  end if;
  v_due_date := v_issue_date + (v_schedule.due_offset_days || ' days')::interval;

  v_building_ids := v_schedule.scope->'building_ids';
  v_zone_ids := v_schedule.scope->'zone_ids';
  v_unit_types := v_schedule.scope->'unit_types';

  for v_unit_record in
    select u.id, u.code, u.unit_type
    from public.units u
    where u.organization_id = p_organization_id
      and u.property_id = v_schedule.property_id
      and (
        (v_schedule.scope->>'all')::boolean = true
        or (v_building_ids is not null and v_building_ids ? u.building_id::text)
        or (v_zone_ids is not null and v_zone_ids ? u.zone_id::text)
        or (v_unit_types is not null and v_unit_types ? u.unit_type)
      )
    order by u.code
  loop
    if v_schedule.amount_by_unit_type is not null and v_schedule.amount_by_unit_type ? v_unit_record.unit_type then
      v_unit_amount := (v_schedule.amount_by_unit_type->>v_unit_record.unit_type)::numeric(19, 4);
    else
      v_unit_amount := v_schedule.amount;
    end if;

    v_unit_count := v_unit_count + 1;
    v_total_amount := v_total_amount + v_unit_amount;

    v_type_entry := coalesce(v_by_unit_type->v_unit_record.unit_type, jsonb_build_object('count', 0, 'total', 0));
    v_by_unit_type := jsonb_set(
      v_by_unit_type,
      array[v_unit_record.unit_type],
      jsonb_build_object(
        'count', (v_type_entry->>'count')::int + 1,
        'total', (v_type_entry->>'total')::numeric(19, 4) + v_unit_amount
      )
    );

    if v_unit_count <= 10 then
      v_sample_units := v_sample_units || jsonb_build_object(
        'id', v_unit_record.id,
        'code', v_unit_record.code,
        'unitType', v_unit_record.unit_type,
        'calculatedAmount', v_unit_amount
      );
    end if;
  end loop;

  return jsonb_build_object(
    'schedule_name', v_schedule.name,
    'period', p_period,
    'idempotent', false,
    'issue_date', v_issue_date,
    'due_date', v_due_date,
    'unit_count', v_unit_count,
    'total_amount', v_total_amount,
    'by_unit_type', v_by_unit_type,
    'sample_units', v_sample_units
  );
end;
$$;


ALTER FUNCTION "public"."preview_generate_recurring_dues"("p_organization_id" "uuid", "p_schedule_id" "uuid", "p_period" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_wip_summary"("p_project_id" "uuid") RETURNS TABLE("capitalised" numeric, "released" numeric, "wip_balance" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_wip uuid;
begin
  select pr.wip_account_id into v_wip from public.projects pr where pr.id = p_project_id;

  return query
  select
    coalesce(sum(l.debit) filter (where l.account_id = v_wip), 0),
    coalesce(sum(l.credit) filter (where l.account_id = v_wip), 0),
    coalesce(sum(l.debit) filter (where l.account_id = v_wip), 0)
      - coalesce(sum(l.credit) filter (where l.account_id = v_wip), 0)
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  where l.project_id = p_project_id and je.status = 'POSTED';
end;
$$;


ALTER FUNCTION "public"."project_wip_summary"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."raise_dunning_notices"("p_organization_id" "uuid", "p_stage" smallint, "p_as_of" "date" DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row record;
  v_count int := 0;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.dunning.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك برفع إشعارات التحصيل'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.dunning_policies
    where organization_id = p_organization_id and stage = p_stage and is_active
  ) then
    raise exception 'DUNNING_STAGE_NOT_FOUND: لا يوجد مستوى تحصيل نشط بهذا الرقم (%)', p_stage
      using errcode = '22023';
  end if;

  for v_row in
    select * from public.list_dunning_candidates(p_organization_id, p_as_of) c
    where c.stage = p_stage and not c.already_raised
  loop
    insert into public.dunning_notices (
      organization_id, due_id, member_id, stage, raised_on,
      days_overdue, outstanding_amount, raised_by
    ) values (
      p_organization_id, v_row.due_id, v_row.member_id, p_stage, p_as_of,
      v_row.days_overdue, v_row.outstanding, auth.uid()
    )
    on conflict (due_id, stage) do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."raise_dunning_notices"("p_organization_id" "uuid", "p_stage" smallint, "p_as_of" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recognize_pending_dues"("p_organization_id" "uuid", "p_fiscal_period_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_period record;
  v_due_id uuid;
  v_count int := 0;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.entries.post') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بترحيل القيود' using errcode = '42501';
  end if;

  select * into v_period
  from public.fiscal_periods
  where id = p_fiscal_period_id and organization_id = p_organization_id;

  if v_period.id is null then
    raise exception 'FISCAL_PERIOD_NOT_FOUND: الفترة المالية غير موجودة' using errcode = 'P0002';
  end if;

  if v_period.status <> 'OPEN' then
    raise exception 'FISCAL_PERIOD_NOT_OPEN: لا يمكن الاعتراف بالمستحقات في فترة غير مفتوحة' using errcode = 'P0001';
  end if;

  for v_due_id in
    select d.id from public.dues d
    where d.organization_id = p_organization_id
      and d.journal_entry_id is null
      and d.status not in ('DRAFT', 'VOID')
      and d.issue_date between v_period.start_date and v_period.end_date
    order by d.issue_date, d.id
  loop
    if public.post_due_to_ledger(v_due_id) is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."recognize_pending_dues"("p_organization_id" "uuid", "p_fiscal_period_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_cashier_session"("p_session_id" "uuid", "p_note" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_session public.cashier_sessions;
begin
  select * into v_session from public.cashier_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'cashier session not found';
  end if;
  if not public.has_permission(auth.uid(), v_session.organization_id, 'cashier.reconciliations.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_session.status <> 'CLOSED' then
    raise exception 'only a closed session can be reconciled';
  end if;

  update public.cashier_sessions set status = 'RECONCILED' where id = p_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason)
  values (auth.uid(), v_session.organization_id, v_session.property_id, 'cashier_session.reconciled', 'cashier_session', p_session_id, p_note);
end;
$$;


ALTER FUNCTION "public"."reconcile_cashier_session"("p_session_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_dunning_delivery"("p_notice_id" "uuid", "p_channel" "text", "p_reference" "text" DEFAULT NULL::"text", "p_delivered_at" timestamp with time zone DEFAULT "now"()) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
  v_status text;
begin
  select organization_id, status into v_org, v_status
  from public.dunning_notices where id = p_notice_id;

  if v_org is null then
    raise exception 'DUNNING_NOTICE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.dunning.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتسجيل تسليم الإشعارات'
      using errcode = '42501';
  end if;

  if v_status = 'CANCELLED' then
    raise exception 'DUNNING_NOTICE_CANCELLED: الإشعار ملغى، فلا يُسجَّل له تسليم'
      using errcode = '22023';
  end if;

  -- التسليم واقعة لا تتكرر: تسجيله مرتين يوحي بتنبيهين ولم يقع إلا واحد.
  if v_status = 'DELIVERED' then
    raise exception 'DUNNING_NOTICE_ALREADY_DELIVERED: سُجِّل تسليم هذا الإشعار من قبل'
      using errcode = '22023';
  end if;

  update public.dunning_notices
  set status = 'DELIVERED',
      delivered_at = p_delivered_at,
      delivery_channel = p_channel,
      delivery_reference = nullif(btrim(coalesce(p_reference, '')), '')
  where id = p_notice_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_org, 'dunning_notice.delivered', 'dunning_notice', p_notice_id,
    jsonb_build_object('channel', p_channel, 'delivered_at', p_delivered_at)
  );
end;
$$;


ALTER FUNCTION "public"."record_dunning_delivery"("p_notice_id" "uuid", "p_channel" "text", "p_reference" "text", "p_delivered_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_einvoice_attempt"("p_document_id" "uuid", "p_operation" "text", "p_resulting_status" "text", "p_http_status" integer DEFAULT NULL::integer, "p_authority_status" "text" DEFAULT NULL::"text", "p_authority_uuid" "text" DEFAULT NULL::"text", "p_authority_long_id" "text" DEFAULT NULL::"text", "p_qr_payload" "text" DEFAULT NULL::"text", "p_error_code" "text" DEFAULT NULL::"text", "p_error_detail" "text" DEFAULT NULL::"text", "p_request_summary" "jsonb" DEFAULT NULL::"jsonb", "p_response_summary" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_doc record;
  v_attempt int;
begin
  select * into v_doc from public.einvoice_documents where id = p_document_id for update;
  if v_doc.id is null then
    raise exception 'EINVOICE_DOCUMENT_NOT_FOUND: المستند غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_doc.organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإرسال الفواتير الإلكترونية' using errcode = '42501';
  end if;

  if p_resulting_status not in
     ('DRAFT','SIGNED','SUBMITTED','ACCEPTED','REJECTED','CANCELLED','FAILED') then
    raise exception 'EINVOICE_STATUS_INVALID: حالة غير معروفة' using errcode = '22023';
  end if;

  v_attempt := v_doc.attempt_count + 1;

  update public.einvoice_documents
  set status = p_resulting_status,
      authority_status = coalesce(p_authority_status, authority_status),
      authority_uuid = coalesce(p_authority_uuid, authority_uuid),
      authority_long_id = coalesce(p_authority_long_id, authority_long_id),
      qr_payload = coalesce(p_qr_payload, qr_payload),
      last_error_code = p_error_code,
      last_error_detail = left(p_error_detail, 1000),
      attempt_count = v_attempt,
      submitted_at = case when p_resulting_status = 'SUBMITTED' then now() else submitted_at end,
      settled_at = case
        when p_resulting_status in ('ACCEPTED','REJECTED','CANCELLED') then now()
        else settled_at end
  where id = p_document_id;

  insert into public.einvoice_submission_attempts (
    organization_id, document_id, attempt_number, operation,
    http_status, authority_status, resulting_status, request_summary, response_summary
  ) values (
    v_doc.organization_id, p_document_id, v_attempt, p_operation,
    p_http_status, p_authority_status, p_resulting_status, p_request_summary, p_response_summary
  );
end;
$$;


ALTER FUNCTION "public"."record_einvoice_attempt"("p_document_id" "uuid", "p_operation" "text", "p_resulting_status" "text", "p_http_status" integer, "p_authority_status" "text", "p_authority_uuid" "text", "p_authority_long_id" "text", "p_qr_payload" "text", "p_error_code" "text", "p_error_detail" "text", "p_request_summary" "jsonb", "p_response_summary" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_expense"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_expense_category_id" "uuid", "p_description" "text", "p_amount" numeric, "p_expense_date" "date", "p_payment_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_cashier_session_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_expense_account_id uuid;
  v_entry_id uuid;
  v_expense_id uuid;
  v_voucher_number bigint;
  v_session public.cashier_sessions;
begin
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل مصروف في هذا الموقع' using errcode = '42501';
  end if;

  if p_amount <= 0 then
    raise exception 'مبلغ يجب أن يكون أكبر من صفر';
  end if;

  select default_expense_account_id into v_expense_account_id
  from public.expense_categories where id = p_expense_category_id and organization_id = p_organization_id;
  if v_expense_account_id is null then
    raise exception 'expense category does not belong to this organization';
  end if;

  if p_cashier_session_id is not null then
    select * into v_session from public.cashier_sessions where id = p_cashier_session_id;
    if v_session.id is null or v_session.organization_id <> p_organization_id then
      raise exception 'cashier session does not belong to this organization';
    end if;
    if v_session.status <> 'OPEN' then
      raise exception 'cashier session is not open';
    end if;
    if not exists (
      select 1 from public.cashboxes where id = v_session.cashbox_id and gl_account_id = p_payment_account_id
    ) then
      raise exception 'payment account does not match this cashier session''s cashbox';
    end if;
  end if;

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_expense_date,
    coalesce(p_description, 'Expense'), 'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_expense_account_id, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_id', p_payment_account_id, 'debit', 0, 'credit', p_amount)
    ),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  v_voucher_number := public.next_sequence_value(p_organization_id, null, 'expense');

  insert into public.expenses (
    organization_id, property_id, expense_category_id, description, amount, expense_date,
    payment_account_id, voucher_number, journal_entry_id, cashier_session_id, created_by
  ) values (
    p_organization_id, p_resort_id, p_expense_category_id, p_description, p_amount, p_expense_date,
    p_payment_account_id, v_voucher_number, v_entry_id, p_cashier_session_id, auth.uid()
  )
  returning id into v_expense_id;

  if p_cashier_session_id is not null then
    insert into public.cash_transactions (organization_id, session_id, type, amount, description, created_by)
    values (p_organization_id, p_cashier_session_id, 'PAYMENT', p_amount, 'Expense ' || v_expense_id, auth.uid());
  end if;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'expense.recorded', 'expense', v_expense_id,
    jsonb_build_object('amount', p_amount, 'voucher_number', v_voucher_number));

  return v_expense_id;
end;
$$;


ALTER FUNCTION "public"."record_expense"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_expense_category_id" "uuid", "p_description" "text", "p_amount" numeric, "p_expense_date" "date", "p_payment_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_cashier_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_incoming_cheque"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_bank_account_id" "uuid", "p_cheque_number" "text", "p_amount" numeric, "p_member_id" "uuid", "p_cheque_date" "date", "p_due_date" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cheque_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'banking.cheques.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if not exists (select 1 from public.bank_accounts where id = p_bank_account_id and organization_id = p_organization_id) then
    raise exception 'bank account does not belong to this organization';
  end if;

  insert into public.cheques (
    organization_id, property_id, bank_account_id, direction, cheque_number, amount,
    member_id, cheque_date, due_date, status, created_by
  ) values (
    p_organization_id, p_resort_id, p_bank_account_id, 'INCOMING', p_cheque_number, p_amount,
    p_member_id, p_cheque_date, p_due_date, 'RECEIVED', auth.uid()
  )
  returning id into v_cheque_id;

  insert into public.cheque_status_history (cheque_id, from_status, to_status, changed_by)
  values (v_cheque_id, null, 'RECEIVED', auth.uid());

  return v_cheque_id;
end;
$$;


ALTER FUNCTION "public"."record_incoming_cheque"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_bank_account_id" "uuid", "p_cheque_number" "text", "p_amount" numeric, "p_member_id" "uuid", "p_cheque_date" "date", "p_due_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_input_tax_decision"("p_invoice_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_inv record;
  v_supplier record;
  v_decl record;
  v_split record;
  v_decimals integer;
  v_currency text;
  v_active record;
  v_previous_id uuid;
  v_id uuid;
begin
  select si.id, si.organization_id, si.supplier_id, si.expense_account_id,
         si.invoice_number, si.invoice_date, si.net_amount, si.vat_amount
  into v_inv
  from public.supplier_invoices si where si.id = p_invoice_id;

  if v_inv.id is null then
    raise exception 'SUPPLIER_INVOICE_NOT_FOUND: فاتورة المورد غير موجودة' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_inv.organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتسجيل قرار ضريبة مدخلات'
      using errcode = '42501';
  end if;

  select o.default_currency into v_currency
  from public.organizations o where o.id = v_inv.organization_id;
  v_decimals := public.currency_decimals(coalesce(v_currency, 'EGP'));

  select td.* into v_active
  from public.input_tax_decisions td
  where td.source_type = 'SUPPLIER_INVOICE' and td.source_id = p_invoice_id
    and td.reverses_decision_id is null
    and not exists (
      select 1 from public.input_tax_decisions r where r.reverses_decision_id = td.id)
  order by td.decided_at desc limit 1;
  if v_active.id is not null then
    return v_active.id;
  end if;

  select td.id into v_previous_id
  from public.input_tax_decisions td
  where td.source_type = 'SUPPLIER_INVOICE' and td.source_id = p_invoice_id
    and td.reverses_decision_id is null
    and not exists (
      select 1 from public.input_tax_decisions s where s.replaces_decision_id = td.id)
  order by td.decided_at desc limit 1;

  select * into v_split
  from public.compute_input_tax_split(
    v_inv.organization_id, v_inv.expense_account_id, v_inv.supplier_id,
    v_inv.invoice_number, v_inv.vat_amount, v_decimals);

  -- القرار يُرفض حيث لا يجوز أن يوجد قرار أصلًا، ويُسجَّل حيث توجد أهلية مثبتة
  -- أو عدم قابلية مُعلَنة. أما «غير مؤهل لسبب» فيُرفض برسالته لا يُسجَّل صامتًا.
  if v_split.ineligible_reason = 'NO_TAX' then
    raise exception 'INPUT_TAX_NOT_ELIGIBLE: الفاتورة بلا ضريبة مدخلات' using errcode = 'P0001';
  end if;
  if v_split.ineligible_reason is not null then
    raise exception '%: %', v_split.ineligible_reason,
      'لا يُسجَّل قرار ضريبة مدخلات قبل اكتمال شرطه' using errcode = 'P0001';
  end if;

  select s.id, s.name, s.tax_number into v_supplier
  from public.suppliers s where s.id = v_inv.supplier_id;
  select * into v_decl from public.expense_account_input_tax where id = v_split.declaration_id;

  insert into public.input_tax_decisions (
    organization_id, source_type, source_id, supplier_id, expense_account_id,
    invoice_number, invoice_date, gross_amount, taxable_base, tax_amount,
    recoverability, recoverable_ratio, recoverable_amount, non_recoverable_amount,
    input_tax_account_id, decision_snapshot, replaces_decision_id, decided_by
  ) values (
    v_inv.organization_id, 'SUPPLIER_INVOICE', p_invoice_id, v_inv.supplier_id,
    v_inv.expense_account_id, v_inv.invoice_number, v_inv.invoice_date,
    round(coalesce(v_inv.net_amount, 0) + v_inv.vat_amount, v_decimals),
    round(coalesce(v_inv.net_amount, 0), v_decimals),
    round(v_inv.vat_amount, v_decimals),
    v_split.recoverability, v_split.recoverable_ratio,
    v_split.recoverable_amount, v_split.non_recoverable_amount,
    v_split.input_tax_account_id,
    jsonb_build_object(
      'supplier_id', v_supplier.id, 'supplier_name', v_supplier.name,
      'supplier_tax_number', v_supplier.tax_number,
      'invoice_number', v_inv.invoice_number, 'invoice_date', v_inv.invoice_date,
      'expense_account_id', v_inv.expense_account_id,
      'currency', coalesce(v_currency, 'EGP'), 'currency_decimals', v_decimals,
      'taxable_base', round(coalesce(v_inv.net_amount, 0), v_decimals),
      'tax_amount', round(v_inv.vat_amount, v_decimals),
      'recoverability', v_split.recoverability, 'recoverable_ratio', v_split.recoverable_ratio,
      'ratio_method', v_decl.ratio_method, 'ratio_period', v_decl.ratio_period,
      'ratio_reference', v_decl.ratio_reference,
      'recoverable_amount', v_split.recoverable_amount,
      'non_recoverable_amount', v_split.non_recoverable_amount,
      'input_tax_account_id', v_split.input_tax_account_id,
      'expense_account_charged_with_tax',
        case when v_split.non_recoverable_amount > 0 then v_inv.expense_account_id else null end,
      'declaration_id', v_split.declaration_id, 'declaration_approved_at', v_decl.approved_at,
      'decided_at', now()
    ),
    v_previous_id, auth.uid()
  )
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_inv.organization_id, 'input_tax_decision.recorded',
    'input_tax_decision', v_id,
    jsonb_build_object(
      'source_id', p_invoice_id, 'invoice_number', v_inv.invoice_number,
      'recoverability', v_split.recoverability, 'recoverable_ratio', v_split.recoverable_ratio,
      'tax_amount', round(v_inv.vat_amount, v_decimals),
      'recoverable_amount', v_split.recoverable_amount,
      'non_recoverable_amount', v_split.non_recoverable_amount
    )
  );

  return v_id;
end;
$$;


ALTER FUNCTION "public"."record_input_tax_decision"("p_invoice_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_lease_deposit_event"("p_lease_id" "uuid", "p_event_type" "text", "p_amount" numeric, "p_settlement_account_id" "uuid", "p_reason" "text" DEFAULT NULL::"text", "p_event_date" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lease record;
  v_liability_account uuid;
  v_fiscal_period_id uuid;
  v_received numeric;
  v_returned numeric;
  v_held numeric;
  v_entry_id uuid;
  v_event_id uuid;
  v_debit uuid;
  v_credit uuid;
begin
  select l.*, u.id as unit_ref
  into v_lease
  from public.unit_leases l
  join public.units u on u.id = l.unit_id
  where l.id = p_lease_id;

  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_lease.organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN_PROPERTY_PERMISSION: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;

  if not public.organization_is_active(v_lease.organization_id) then
    raise exception 'ORGANIZATION_NOT_ACTIVE: المؤسسة غير نشطة' using errcode = 'P0001';
  end if;

  if p_event_type not in ('RECEIVED', 'REFUNDED', 'DEDUCTED') then
    raise exception 'INVALID_DEPOSIT_EVENT_TYPE: نوع حركة الوديعة غير صحيح' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT: مبلغ حركة الوديعة يجب أن يكون موجبًا' using errcode = '22023';
  end if;

  if p_event_type <> 'RECEIVED' and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'DEPOSIT_REASON_REQUIRED: يجب ذكر سبب الرد أو الخصم' using errcode = '22023';
  end if;

  select
    coalesce(sum(amount) filter (where event_type = 'RECEIVED'), 0),
    coalesce(sum(amount) filter (where event_type in ('REFUNDED', 'DEDUCTED')), 0)
  into v_received, v_returned
  from public.unit_lease_deposit_events
  where lease_id = p_lease_id;

  v_held := v_received - v_returned;

  if p_event_type in ('REFUNDED', 'DEDUCTED') and p_amount > v_held then
    raise exception
      'DEPOSIT_EXCEEDS_HELD: المبلغ (%) يتجاوز الوديعة المحتفظ بها (%)', p_amount, v_held
      using errcode = 'P0001';
  end if;

  select security_deposit_liability_account_id into v_liability_account
  from public.organization_finance_settings
  where organization_id = v_lease.organization_id
  order by (property_id = v_lease.property_id) desc nulls last
  limit 1;

  if v_liability_account is null then
    raise exception
      'DEPOSIT_LIABILITY_ACCOUNT_NOT_SET: لم يُحدَّد حساب التزام ودائع التأمين في إعدادات المالية'
      using errcode = 'P0001';
  end if;

  if p_settlement_account_id is null then
    raise exception 'SETTLEMENT_ACCOUNT_REQUIRED: يجب تحديد الحساب المقابل' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_settlement_account_id
      and organization_id = v_lease.organization_id
      and not is_group
  ) then
    raise exception 'SETTLEMENT_ACCOUNT_INVALID: الحساب المقابل لا ينتمي لهذه المؤسسة' using errcode = '22023';
  end if;

  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = v_lease.organization_id
    and fp.status = 'OPEN'
    and p_event_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  if v_fiscal_period_id is null then
    raise exception
      'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي تاريخ الحركة (%)', p_event_date
      using errcode = 'P0001';
  end if;

  if p_event_type = 'RECEIVED' then
    v_debit := p_settlement_account_id;
    v_credit := v_liability_account;
  else
    v_debit := v_liability_account;
    v_credit := p_settlement_account_id;
  end if;

  insert into public.unit_lease_deposit_events
    (lease_id, event_type, amount, reason, event_date, settlement_account_id, created_by)
  values
    (p_lease_id, p_event_type, p_amount, p_reason, p_event_date, p_settlement_account_id, auth.uid())
  returning id into v_event_id;

  v_entry_id := public.create_journal_entry_internal(
    v_lease.organization_id,
    v_lease.property_id,
    v_fiscal_period_id,
    p_event_date,
    case p_event_type
      when 'RECEIVED' then 'Security deposit received'
      when 'REFUNDED' then 'Security deposit refunded'
      else 'Security deposit deduction'
    end || coalesce(' — ' || p_reason, ''),
    'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_debit, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_id', v_credit, 'debit', 0, 'credit', p_amount)
    ),
    'deposit_event:' || v_event_id::text
  );

  perform public.post_journal_entry_internal(v_entry_id);

  update public.unit_lease_deposit_events
  set journal_entry_id = v_entry_id where id = v_event_id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  ) values (
    auth.uid(), v_lease.organization_id, v_lease.property_id,
    'lease_deposit.' || lower(p_event_type), 'unit_lease_deposit_event', v_event_id,
    jsonb_build_object('lease_id', p_lease_id, 'amount', p_amount, 'held_after',
                       case when p_event_type = 'RECEIVED' then v_held + p_amount else v_held - p_amount end)
  );

  return v_event_id;
end;
$$;


ALTER FUNCTION "public"."record_lease_deposit_event"("p_lease_id" "uuid", "p_event_type" "text", "p_amount" numeric, "p_settlement_account_id" "uuid", "p_reason" "text", "p_event_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_online_payment"("p_transaction_id" "uuid", "p_webhook_event_id" "text", "p_provider_payload" "jsonb" DEFAULT NULL::"jsonb") RETURNS TABLE("status" "text", "payment_id" "uuid", "failure_code" "text", "failure_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_txn public.online_payment_transactions;
  v_alloc record;
  v_due public.dues;
  v_paid_so_far numeric(19,4);
  v_result record;
  v_allocations_jsonb jsonb := '[]'::jsonb;
  v_clearing_account_id uuid;
  v_clearing_account public.chart_of_accounts;
  v_fiscal_period_id uuid;
  v_failure_message text;
begin
  select * into v_txn from public.online_payment_transactions
  where id = p_transaction_id for update;

  if v_txn.id is null then
    raise exception 'ONLINE_TXN_NOT_FOUND: transaction % not found', p_transaction_id using errcode = '22023';
  end if;

  if v_txn.status = 'PAID' then
    return query select 'PAID'::text, v_txn.payment_id, null::text, null::text;
    return;
  end if;

  if v_txn.status <> 'PENDING' then
    raise exception 'ONLINE_TXN_NOT_PENDING: cannot post a % transaction', v_txn.status using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('record_payment_' || v_txn.organization_id::text));

  select ofs.online_payments_clearing_account_id into v_clearing_account_id
  from public.organization_finance_settings ofs
  where ofs.organization_id = v_txn.organization_id and ofs.property_id = v_txn.property_id;

  if v_clearing_account_id is not null then
    select * into v_clearing_account from public.chart_of_accounts where id = v_clearing_account_id;
  end if;

  if v_clearing_account_id is null
    or v_clearing_account.id is null
    or v_clearing_account.category <> 'ASSET'
    or v_clearing_account.is_group
    or not v_clearing_account.is_active
    or (v_clearing_account.property_id is not null and v_clearing_account.property_id <> v_txn.property_id)
  then
    v_failure_message := format('No valid online-payments clearing account configured for resort %s', v_txn.property_id);
    update public.online_payment_transactions
    set status = 'FAILED', failed_at = now(),
        failure_code = 'CLEARING_ACCOUNT_NOT_CONFIGURED',
        failure_message = v_failure_message
    where id = p_transaction_id;
    return query select 'FAILED'::text, null::uuid, 'CLEARING_ACCOUNT_NOT_CONFIGURED'::text, v_failure_message;
    return;
  end if;

  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = v_txn.organization_id
    and fp.status = 'OPEN'
    and current_date between fp.start_date and fp.end_date
  order by fp.start_date desc
  limit 1;

  if v_fiscal_period_id is null then
    v_failure_message := format('No open fiscal period covers %s for organization %s', current_date, v_txn.organization_id);
    update public.online_payment_transactions
    set failure_code = 'OPEN_PERIOD_REQUIRED',
        failure_message = v_failure_message
    where id = p_transaction_id;
    return query select 'PENDING'::text, null::uuid, 'OPEN_PERIOD_REQUIRED'::text, v_failure_message;
    return;
  end if;

  for v_alloc in
    select due_id, amount from public.online_payment_transaction_allocations
    where transaction_id = p_transaction_id
    order by due_id
  loop
    select * into v_due from public.dues where id = v_alloc.due_id for update;

    if v_due.id is null or v_due.organization_id <> v_txn.organization_id or v_due.property_id <> v_txn.property_id then
      v_failure_message := format('Due %s is outside this transaction''s organization/resort', v_alloc.due_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_OUT_OF_SCOPE', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_OUT_OF_SCOPE'::text, v_failure_message;
      return;
    end if;

    if not exists (
      select 1 from public.unit_ownerships uo
      where uo.unit_id = v_due.unit_id
        and uo.member_id = v_txn.member_id
        and (uo.end_date is null or uo.end_date >= current_date)
    ) then
      v_failure_message := format('Due %s''s unit is not owned by member %s', v_alloc.due_id, v_txn.member_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_NOT_OWNED_BY_MEMBER', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_NOT_OWNED_BY_MEMBER'::text, v_failure_message;
      return;
    end if;

    if v_due.status = 'VOID' then
      v_failure_message := format('Due %s is no longer payable (void)', v_alloc.due_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_ALREADY_SETTLED', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_ALREADY_SETTLED'::text, v_failure_message;
      return;
    end if;

    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    if v_alloc.amount > (v_due.amount - v_paid_so_far) then
      v_failure_message := format('Due %s no longer has enough remaining balance for %s', v_alloc.due_id, v_alloc.amount);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_ALREADY_SETTLED', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_ALREADY_SETTLED'::text, v_failure_message;
      return;
    end if;

    v_allocations_jsonb := v_allocations_jsonb || jsonb_build_array(jsonb_build_object('due_id', v_alloc.due_id, 'amount', v_alloc.amount));
  end loop;

  select * into v_result from public.post_payment_internal(
    p_organization_id => v_txn.organization_id,
    p_resort_id => v_txn.property_id,
    p_member_id => v_txn.member_id,
    p_unit_id => null,
    p_amount => v_txn.amount,
    p_method => 'ONLINE',
    p_payment_date => current_date,
    p_deposit_account_id => v_clearing_account_id,
    p_fiscal_period_id => v_fiscal_period_id,
    p_allocations => v_allocations_jsonb,
    p_idempotency_key => 'online:' || p_transaction_id::text,
    p_cashier_session_id => null,
    p_actor_id => null
  );

  update public.online_payment_transactions
  set status = 'PAID',
      payment_id = v_result.payment_id,
      paid_at = now(),
      webhook_event_id = p_webhook_event_id,
      provider_payload = coalesce(p_provider_payload, provider_payload)
  where id = p_transaction_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (null, v_txn.organization_id, v_txn.property_id, 'online_payment.posted', 'online_payment_transaction', p_transaction_id,
    jsonb_build_object('payment_id', v_result.payment_id, 'amount', v_txn.amount, 'provider', v_txn.provider));

  return query select 'PAID'::text, v_result.payment_id, null::text, null::text;
end;
$$;


ALTER FUNCTION "public"."record_online_payment"("p_transaction_id" "uuid", "p_webhook_event_id" "text", "p_provider_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_payment"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_member_id" "uuid", "p_unit_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_deposit_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_result record;
begin
  if not public.has_financial_permission(
       p_organization_id, 'receivables.payments.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل دفعات'
      using errcode = '42501';
  end if;

  select * into v_result from public.post_payment_internal(
    p_organization_id => p_organization_id,
    p_resort_id => p_resort_id,
    p_member_id => p_member_id,
    p_unit_id => p_unit_id,
    p_amount => p_amount,
    p_method => p_method,
    p_payment_date => p_payment_date,
    p_deposit_account_id => p_deposit_account_id,
    p_fiscal_period_id => p_fiscal_period_id,
    p_allocations => p_allocations,
    p_idempotency_key => p_idempotency_key,
    p_cashier_session_id => p_cashier_session_id,
    p_actor_id => auth.uid()
  );

  return v_result.payment_id;
end;
$$;


ALTER FUNCTION "public"."record_payment"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_member_id" "uuid", "p_unit_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_deposit_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_payment_provider_verification"("p_settings_id" "uuid", "p_success" boolean, "p_error_message" "text" DEFAULT NULL::"text", "p_expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org_id uuid;
  v_updated_rows int;
begin
  select organization_id into v_org_id from public.payment_provider_settings where id = p_settings_id;
  if v_org_id is null or not public.has_permission(auth.uid(), v_org_id, 'finance.online_payments.manage') then
    raise exception 'FORBIDDEN: لا تملك صلاحية إدارة مزودي الدفع' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_org_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;

  update public.payment_provider_settings
  set status = case when p_success then 'VERIFIED' else 'DRAFT' end,
      verified_at = case when p_success then now() else verified_at end,
      last_verification_error = case when p_success then null else coalesce(left(p_error_message, 500), 'فشل التحقق من الاتصال') end,
      updated_by = auth.uid()
  where id = p_settings_id
    and (p_expected_updated_at is null or updated_at = p_expected_updated_at);

  get diagnostics v_updated_rows = row_count;
  if v_updated_rows = 0 and p_expected_updated_at is not null then
    raise exception 'STALE_VERIFICATION: تغيّر الإعداد أثناء فحص الاتصال، يرجى إعادة المحاولة' using errcode = '22023';
  end if;
end;
$$;


ALTER FUNCTION "public"."record_payment_provider_verification"("p_settings_id" "uuid", "p_success" boolean, "p_error_message" "text", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_supplier_payment"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_payment_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_alloc jsonb;
  v_invoice public.supplier_invoices;
  v_allocated_total numeric(19, 4) := 0;
  v_total_wht numeric(19, 4) := 0;
  v_alloc_wht numeric(19, 4);
  v_remaining numeric(19, 4);
  v_debit_lines jsonb := '[]'::jsonb;
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_payment_id uuid;
  v_existing_payment_id uuid;
  v_voucher_number bigint;
  v_paid_so_far numeric(19, 4);
  v_new_status text;
  v_session public.cashier_sessions;
  v_expected_cash numeric(19, 4);
begin
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل دفعات في هذا الموقع' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_allocations is null or jsonb_array_length(p_allocations) < 1 then
    raise exception 'at least one allocation is required';
  end if;

  if p_cashier_session_id is not null then
    select * into v_session from public.cashier_sessions where id = p_cashier_session_id;
    if v_session.id is null or v_session.organization_id <> p_organization_id then
      raise exception 'cashier session does not belong to this organization';
    end if;
    if v_session.status <> 'OPEN' then
      raise exception 'cashier session is not open';
    end if;
    if not exists (
      select 1 from public.cashboxes where id = v_session.cashbox_id and gl_account_id = p_payment_account_id
    ) then
      raise exception 'payment account does not match this cashier session''s cashbox';
    end if;
  end if;

  if p_idempotency_key is not null then
    select id into v_payment_id
    from public.supplier_payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('record_supplier_payment_' || p_organization_id::text));

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    select * into v_invoice from public.supplier_invoices where id = (v_alloc ->> 'invoice_id')::uuid;
    if v_invoice.id is null or v_invoice.organization_id <> p_organization_id then
      raise exception 'invoice does not belong to this organization';
    end if;
    if v_invoice.status = 'CANCELLED' then
      raise exception 'cannot allocate to a cancelled invoice';
    end if;

    select coalesce(sum(spa.amount), 0) into v_paid_so_far
    from public.supplier_payment_allocations spa
    where spa.invoice_id = v_invoice.id and spa.reversed_at is null;

    v_remaining := v_invoice.amount - v_paid_so_far;
    if (v_alloc ->> 'amount')::numeric(19, 4) > v_remaining then
      raise exception 'allocation of % exceeds remaining balance % for invoice %', v_alloc ->> 'amount', v_remaining, v_invoice.id;
    end if;

    if v_invoice.wht_amount > 0 and v_invoice.amount > 0 then
      v_alloc_wht := round((v_alloc ->> 'amount')::numeric(19, 4) * v_invoice.wht_amount / v_invoice.amount, 4);
    else
      v_alloc_wht := 0;
    end if;
    v_total_wht := v_total_wht + v_alloc_wht;

    v_allocated_total := v_allocated_total + (v_alloc ->> 'amount')::numeric(19, 4);
  end loop;

  v_expected_cash := v_allocated_total - v_total_wht;
  if v_expected_cash <> p_amount then
    raise exception 'cash amount (%) must equal allocations (%) minus WHT withheld (%) = %', p_amount, v_allocated_total, v_total_wht, v_expected_cash;
  end if;

  for v_grouped in
    select si.payable_account_id as account_id, sum((a ->> 'amount')::numeric(19, 4)) as total
    from jsonb_array_elements(p_allocations) a
    join public.supplier_invoices si on si.id = (a ->> 'invoice_id')::uuid
    group by si.payable_account_id
  loop
    v_debit_lines := v_debit_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_grouped.account_id, 'debit', v_grouped.total, 'credit', 0)
    );
  end loop;

  v_credit_lines := jsonb_build_array(jsonb_build_object('account_id', p_payment_account_id, 'debit', 0, 'credit', p_amount));

  if v_total_wht > 0 then
    for v_grouped in
      select si.wht_account_id as account_id,
        sum(round((a ->> 'amount')::numeric(19, 4) * si.wht_amount / nullif(si.amount, 0), 4)) as total
      from jsonb_array_elements(p_allocations) a
      join public.supplier_invoices si on si.id = (a ->> 'invoice_id')::uuid
      where si.wht_amount > 0
      group by si.wht_account_id
    loop
      v_credit_lines := v_credit_lines || jsonb_build_array(
        jsonb_build_object('account_id', v_grouped.account_id, 'debit', 0, 'credit', v_grouped.total)
      );
    end loop;
  end if;

  -- Uses the _internal variants: finance.entries.create (checked above,
  -- resort-scoped) already authorizes this whole atomic "record payment +
  -- post its own entry" action.
  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_payment_date,
    'Supplier payment', 'PAYMENT_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  v_voucher_number := public.next_sequence_value(p_organization_id, null, 'supplier_payment');

  begin
    insert into public.supplier_payments (
      organization_id, property_id, supplier_id, amount, method, payment_date,
      voucher_number, payment_account_id, wht_amount, journal_entry_id, cashier_session_id, idempotency_key, created_by
    ) values (
      p_organization_id, p_resort_id, p_supplier_id, p_amount, p_method, p_payment_date,
      v_voucher_number, p_payment_account_id, v_total_wht, v_entry_id, p_cashier_session_id, p_idempotency_key, auth.uid()
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      if p_idempotency_key is not null then
        select id into v_existing_payment_id
        from public.supplier_payments
        where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
        if v_existing_payment_id is null then raise; end if;
        return v_existing_payment_id;
      else
        raise;
      end if;
  end;

  if p_cashier_session_id is not null then
    insert into public.cash_transactions (organization_id, session_id, type, amount, description, created_by)
    values (p_organization_id, p_cashier_session_id, 'PAYMENT', p_amount, 'Supplier payment ' || v_payment_id, auth.uid());
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    insert into public.supplier_payment_allocations (payment_id, invoice_id, amount)
    values (v_payment_id, (v_alloc ->> 'invoice_id')::uuid, (v_alloc ->> 'amount')::numeric(19, 4));

    select * into v_invoice from public.supplier_invoices where id = (v_alloc ->> 'invoice_id')::uuid;
    select coalesce(sum(spa.amount), 0) into v_paid_so_far
    from public.supplier_payment_allocations spa
    where spa.invoice_id = v_invoice.id and spa.reversed_at is null;

    v_new_status := case when v_paid_so_far >= v_invoice.amount then 'PAID' else 'PARTIALLY_PAID' end;
    update public.supplier_invoices set status = v_new_status where id = v_invoice.id;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'supplier_payment.recorded', 'supplier_payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'wht_amount', v_total_wht, 'voucher_number', v_voucher_number));

  return v_payment_id;
end;
$$;


ALTER FUNCTION "public"."record_supplier_payment"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_payment_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_tax_decision_for_due"("p_due_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.dues where id = p_due_id;
  if v_org is null then
    raise exception 'DUE_NOT_FOUND: المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بتسجيل قرار ضريبي' using errcode = '42501';
  end if;

  return public.record_tax_decision_for_due_internal(p_due_id);
end;
$$;


ALTER FUNCTION "public"."record_tax_decision_for_due"("p_due_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_tax_decision_for_due_internal"("p_due_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_due record;
  v_jurisdiction text;
  v_currency text;
  v_decimals integer;
  v_map record;
  v_rule public.tax_rule_versions;
  v_active record;
  v_previous_id uuid;
  v_id uuid;
  v_base numeric(19,4);
  v_vat numeric(19,4);
  v_gross numeric(19,4);
  v_basis text;
  v_account uuid;
  v_buyer record;
  v_member record;
  v_buyer_snapshot jsonb := '{}'::jsonb;
begin
  select d.id, d.organization_id, d.due_type_id, d.issue_date, d.status, d.amount
  into v_due
  from public.dues d where d.id = p_due_id;

  if v_due.id is null then
    raise exception 'DUE_NOT_FOUND: المستحق غير موجود' using errcode = 'P0002';
  end if;
  if v_due.status = 'VOID' then
    raise exception 'DUE_VOID: لا يُسجَّل قرار ضريبي لمستحق ملغى' using errcode = 'P0001';
  end if;
  if v_due.due_type_id is null then
    raise exception
      'TAX_REVIEW_REQUIRED: المستحق بلا نوع، فلا سبيل إلى طبيعة إيراد' using errcode = 'P0001';
  end if;

  select nullif(btrim(tax_jurisdiction), ''), default_currency
  into v_jurisdiction, v_currency
  from public.organizations where id = v_due.organization_id;

  if v_jurisdiction is null then
    raise exception
      'TAX_JURISDICTION_MISSING: لم يُسجَّل الاختصاص الضريبي للمؤسسة؛ سجّله قبل أي قرار ضريبي'
      using errcode = 'P0001';
  end if;

  select * into v_map
  from public.due_type_revenue_natures
  where organization_id = v_due.organization_id and due_type_id = v_due.due_type_id;

  if v_map.id is null then
    raise exception
      'TAX_REVIEW_REQUIRED: نوع المستحق غير مربوط بطبيعة إيراد؛ الربط الصريح مطلوب قبل الترحيل'
      using errcode = 'P0001';
  end if;
  if v_map.status <> 'APPROVED' then
    raise exception 'TAX_REVIEW_REQUIRED: ربط نوع المستحق لم يُعتمد بعد' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_jurisdiction), hashtext(v_map.revenue_nature));

  select td.* into v_active
  from public.tax_decisions td
  where td.source_type = 'DUE' and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (select 1 from public.tax_decisions r where r.reverses_decision_id = td.id)
  order by td.decided_at desc limit 1;
  if v_active.id is not null then
    return v_active.id;
  end if;

  select td.id into v_previous_id
  from public.tax_decisions td
  where td.source_type = 'DUE' and td.source_id = p_due_id
    and td.reverses_decision_id is null
    and not exists (select 1 from public.tax_decisions s where s.replaces_decision_id = td.id)
  order by td.decided_at desc limit 1;

  select * into v_rule
  from public.resolve_tax_rule(v_jurisdiction, v_map.revenue_nature, v_due.issue_date);

  if v_rule.id is null then
    raise exception
      'TAX_REVIEW_REQUIRED: لا توجد قاعدة ضريبية معتمدة لـ(%) في (%) بتاريخ %',
      v_map.revenue_nature, v_jurisdiction, v_due.issue_date
      using errcode = 'P0001';
  end if;
  if v_rule.tax_treatment = 'REVIEW_REQUIRED' then
    raise exception
      'TAX_REVIEW_REQUIRED: المعالجة الضريبية لـ(%) ما تزال قيد المراجعة', v_map.revenue_nature
      using errcode = 'P0001';
  end if;

  -- المشتري يُشتق دائمًا ويُختم دائمًا، لكن **الحجب للخاضع وحده**: المعفى
  -- والخارج عن النطاق يبقيان على قواعدهما ولا يُعطَّلان لغياب هوية.
  select * into v_buyer from public.resolve_due_buyer(p_due_id);
  if v_buyer.member_id is not null then
    select m.customer_type, m.tax_registration_number, m.identity_document_type,
           m.identity_document_number, m.legal_name, m.full_name, m.country_code,
           m.billing_address, m.identity_verified_at, m.identity_verification_source
    into v_member
    from public.members m where m.id = v_buyer.member_id;
  end if;

  if v_rule.tax_treatment = 'TAXABLE' then
    if v_buyer.member_id is null then
      raise exception
        'TAX_BUYER_UNRESOLVED: لا يمكن تحديد المشتري لهذا المستحق (%)',
        coalesce(v_buyer.ambiguity, 'UNKNOWN') using errcode = 'P0001';
    end if;

    if v_member.customer_type = 'UNRESOLVED' then
      raise exception
        'TAX_BUYER_STATUS_UNRESOLVED: تصنيف المشتري (منشأة أم فرد) غير محسوم؛ لا يُستنتج من الاسم'
        using errcode = 'P0001';
    end if;

    if v_member.customer_type = 'B2B'
       and nullif(btrim(coalesce(v_member.tax_registration_number, '')), '') is null then
      raise exception
        'TAX_BUYER_TAX_ID_MISSING: المشتري منشأة بلا رقم تسجيل ضريبي؛ لا تُصدر فاتورة خاضعة له'
        using errcode = 'P0001';
    end if;
  end if;

  v_decimals := public.currency_decimals(coalesce(v_currency, 'EGP'));

  if v_rule.tax_treatment = 'TAXABLE' then
    if v_map.amount_basis is null then
      raise exception
        'TAX_AMOUNT_BASIS_REQUIRED: المعالجة خاضعة (%) ولم يُحدَّد هل مبلغ نوع المستحق صافٍ أم شامل للضريبة',
        v_map.revenue_nature using errcode = 'P0001';
    end if;
    v_basis := v_map.amount_basis;

    if v_basis = 'NET' then
      raise exception
        'TAX_NET_BASIS_NOT_POSTABLE: أساس صافٍ لنوع خاضع غير قابل للترحيل؛ مبلغ المستحق يجب أن يكون شاملًا للضريبة حتى تطابق الذمم ما يدين به العميل'
        using errcode = 'P0001';
    end if;

    v_gross := round(v_due.amount, v_decimals);
    v_vat   := round(v_gross * v_rule.vat_rate / (100 + v_rule.vat_rate), v_decimals);
    v_base  := v_gross - v_vat;

    v_account := public.resolve_output_tax_account(v_due.organization_id);
    if v_account is null then
      raise exception
        'OUTPUT_TAX_ACCOUNT_MISSING: لا يوجد حساب ضريبة مخرجات صالح للمؤسسة'
        using errcode = 'P0001';
    end if;
  else
    v_basis := v_map.amount_basis;
    v_base  := round(v_due.amount, v_decimals);
    v_vat   := 0;
    v_gross := v_base;
    v_account := null;
  end if;

  -- لقطة المشتري وقت الإصدار، فلا يُعاد العرض من قيمة `members` الحالية.
  -- **ورقم الهوية الشخصية لا يُنسخ هنا عمدًا**: جدول القرارات غير قابل للتعديل
  -- بحكم التصميم، فرقم شخصي يُكتب فيه لا يمكن تصحيحه ولا محوه أبدًا. يُسجَّل
  -- نوعه ووجوده، ويُقرأ الرقم من مصدره وقت بناء المستند.
  if v_buyer.member_id is not null then
    v_buyer_snapshot := jsonb_build_object(
      'buyer_member_id', v_buyer.member_id,
      'buyer_resolved_via', v_buyer.resolved_via,
      'buyer_customer_type', v_member.customer_type,
      'buyer_legal_name', coalesce(v_member.legal_name, v_member.full_name),
      'buyer_country_code', v_member.country_code,
      'buyer_billing_address', v_member.billing_address,
      'buyer_tax_registration_number', v_member.tax_registration_number,
      'buyer_identity_document_type', v_member.identity_document_type,
      'buyer_identity_document_on_file',
        nullif(btrim(coalesce(v_member.identity_document_number, '')), '') is not null,
      'buyer_identity_verified_at', v_member.identity_verified_at,
      'buyer_identity_verification_source', v_member.identity_verification_source
    );
  else
    v_buyer_snapshot := jsonb_build_object(
      'buyer_member_id', null, 'buyer_resolved_via', null,
      'buyer_unresolved_reason', v_buyer.ambiguity
    );
  end if;

  insert into public.tax_decisions (
    organization_id, source_type, source_id, revenue_nature, jurisdiction,
    transaction_date, tax_rule_version_id, tax_rule_hash, tax_decision_snapshot,
    replaces_decision_id, decided_by, amount_basis, taxable_base, vat_amount, gross_amount,
    output_tax_account_id, buyer_member_id
  ) values (
    v_due.organization_id, 'DUE', p_due_id, v_map.revenue_nature, v_jurisdiction,
    v_due.issue_date, v_rule.id, v_rule.rule_hash,
    jsonb_build_object(
      'jurisdiction', v_rule.jurisdiction, 'revenue_nature', v_rule.revenue_nature,
      'tax_treatment', v_rule.tax_treatment, 'vat_rate', v_rule.vat_rate,
      'e_document_type', v_rule.e_document_type, 'issuer_scope', v_rule.issuer_scope,
      'effective_from', v_rule.effective_from, 'version', v_rule.version,
      'rule_hash', v_rule.rule_hash, 'legal_reference', v_rule.legal_reference,
      'source_issue_date', v_due.issue_date, 'source_amount', v_due.amount,
      'currency', coalesce(v_currency, 'EGP'), 'currency_decimals', v_decimals,
      'amount_basis', v_basis, 'taxable_base', v_base, 'vat_amount', v_vat,
      'gross_amount', v_gross, 'output_tax_account_id', v_account, 'decided_at', now()
    ) || v_buyer_snapshot,
    v_previous_id, auth.uid(), v_basis, v_base, v_vat, v_gross, v_account, v_buyer.member_id
  )
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_due.organization_id, 'tax_decision.recorded', 'tax_decision', v_id,
    jsonb_build_object(
      'source_type', 'DUE', 'source_id', p_due_id,
      'revenue_nature', v_map.revenue_nature, 'tax_treatment', v_rule.tax_treatment,
      'transaction_date', v_due.issue_date, 'tax_rule_version_id', v_rule.id,
      'amount_basis', v_basis, 'taxable_base', v_base, 'vat_amount', v_vat,
      'gross_amount', v_gross, 'output_tax_account_id', v_account,
      'buyer_member_id', v_buyer.member_id, 'buyer_resolved_via', v_buyer.resolved_via,
      'replaces_decision_id', v_previous_id
    )
  );

  return v_id;
end;
$$;


ALTER FUNCTION "public"."record_tax_decision_for_due_internal"("p_due_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_project_wip"("p_project_id" "uuid", "p_amount" numeric, "p_entry_date" "date", "p_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_project public.projects;
  v_period public.fiscal_periods;
  v_balance numeric;
  v_entry_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_project.organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتحرير تكاليف المشاريع'
      using errcode = '42501';
  end if;

  if v_project.wip_account_id is null or v_project.cost_of_sales_account_id is null then
    raise exception
      'PROJECT_ACCOUNTS_NOT_SET: عيّن حسابي المشروع (%) أولًا', v_project.code
      using errcode = '22023';
  end if;

  if p_amount <= 0 then
    raise exception 'PROJECT_RELEASE_NOT_POSITIVE: قيمة التحرير يجب أن تكون موجبة'
      using errcode = '22023';
  end if;

  select s.wip_balance into v_balance from public.project_wip_summary(p_project_id) s;

  if p_amount > coalesce(v_balance, 0) then
    raise exception
      'PROJECT_RELEASE_EXCEEDS_WIP: التحرير (%) يتجاوز رصيد الأعمال تحت التنفيذ (%)',
      p_amount, coalesce(v_balance, 0)
      using errcode = '22023';
  end if;

  select * into v_period from public.fiscal_periods fp
  where fp.organization_id = v_project.organization_id
    and fp.status = 'OPEN'
    and p_entry_date between fp.start_date and fp.end_date
  order by fp.start_date limit 1;

  if v_period.id is null then
    raise exception 'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي التاريخ (%)', p_entry_date
      using errcode = 'P0001';
  end if;

  v_entry_id := public.create_journal_entry_internal(
    v_project.organization_id, v_project.property_id, v_period.id, p_entry_date,
    'Cost of sales — ' || v_project.code || coalesce(' — ' || p_description, ''),
    'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_project.cost_of_sales_account_id,
                         'debit', p_amount, 'credit', 0, 'project_id', p_project_id),
      jsonb_build_object('account_id', v_project.wip_account_id,
                         'debit', 0, 'credit', p_amount, 'project_id', p_project_id)
    ),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."release_project_wip"("p_project_id" "uuid", "p_amount" numeric, "p_entry_date" "date", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reopen_bank_reconciliation"("p_statement_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
begin
  select organization_id into v_org
  from public.bank_statements where id = p_statement_id;

  if v_org is null then
    raise exception 'BANK_STATEMENT_NOT_FOUND: كشف الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.bank_reconciliation.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإعادة فتح المطابقة البنكية' using errcode = '42501';
  end if;

  update public.bank_statements
  set status = 'DRAFT', reconciled_at = null, reconciled_by = null
  where id = p_statement_id and status = 'RECONCILED';
end;
$$;


ALTER FUNCTION "public"."reopen_bank_reconciliation"("p_statement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_due_buyer"("p_due_id" "uuid") RETURNS TABLE("member_id" "uuid", "resolved_via" "text", "ambiguity" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- ١) إيجار مولَّد من عقد: المستأجر هو المدين، ما لم يقل العقد غير ذلك.
  if v_due.source_type = 'LEASE_RENT' and v_due.source_id is not null then
    select case when l.billing_recipient = 'TENANT' then l.tenant_member_id else null end
    into v_lease_member
    from public.unit_leases l where l.id = v_due.source_id;

    if v_lease_member is not null then
      member_id := v_lease_member; resolved_via := 'LEASE_TENANT'; ambiguity := null;
      return next; return;
    end if;
  end if;

  -- ٢) ملكية سارية بتاريخ الإصدار. الملكية قد تتعدد بحصص، فمالك واحد يُحسم،
  -- وتعدد المُلّاك يُحسم بجهة الاتصال الأساسية وحدها — وإلا فهو التباس معلن.
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


ALTER FUNCTION "public"."resolve_due_buyer"("p_due_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_input_tax_account"("p_organization_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select a.id from public.organizations o
     join public.chart_of_accounts a on a.id = o.input_tax_account_id
     where o.id = p_organization_id
       and a.organization_id = p_organization_id
       and a.category = 'ASSET' and not a.is_group and a.is_active),
    (select a.id from public.chart_of_accounts a
     where a.organization_id = p_organization_id and a.code = '1140'
       and a.category = 'ASSET' and not a.is_group and a.is_active
     limit 1)
  );
$$;


ALTER FUNCTION "public"."resolve_input_tax_account"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_output_tax_account"("p_organization_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select a.id from public.organizations o
     join public.chart_of_accounts a on a.id = o.output_tax_account_id
     where o.id = p_organization_id
       and a.organization_id = p_organization_id
       and a.category = 'LIABILITY' and not a.is_group and a.is_active),
    (select a.id from public.chart_of_accounts a
     where a.organization_id = p_organization_id and a.code = '2300'
       and a.category = 'LIABILITY' and not a.is_group and a.is_active
     limit 1)
  );
$$;


ALTER FUNCTION "public"."resolve_output_tax_account"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tax_rule_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "jurisdiction" "text" NOT NULL,
    "revenue_nature" "text" NOT NULL,
    "tax_treatment" "text" NOT NULL,
    "vat_rate" numeric(6,3),
    "effective_from" "date" NOT NULL,
    "effective_to" "date",
    "e_document_type" "text" NOT NULL,
    "issuer_scope" "text" NOT NULL,
    "version" integer NOT NULL,
    "rule_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "legal_reference" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tax_rule_approved_has_approver" CHECK (((("status" = 'DRAFT'::"text") AND ("approved_by" IS NULL) AND ("approved_at" IS NULL)) OR (("status" = ANY (ARRAY['APPROVED'::"text", 'SUPERSEDED'::"text"])) AND ("approved_by" IS NOT NULL) AND ("approved_at" IS NOT NULL)))),
    CONSTRAINT "tax_rule_rate_matches_treatment" CHECK (((("tax_treatment" = 'TAXABLE'::"text") AND ("vat_rate" IS NOT NULL) AND ("vat_rate" > (0)::numeric)) OR (("tax_treatment" = ANY (ARRAY['EXEMPT'::"text", 'ZERO_RATED'::"text"])) AND ("vat_rate" = (0)::numeric)) OR (("tax_treatment" = ANY (ARRAY['OUT_OF_SCOPE'::"text", 'REVIEW_REQUIRED'::"text"])) AND ("vat_rate" IS NULL)))),
    CONSTRAINT "tax_rule_versions_e_document_type_check" CHECK (("e_document_type" = ANY (ARRAY['E_INVOICE'::"text", 'E_RECEIPT'::"text", 'BY_CUSTOMER_TYPE'::"text", 'NONE'::"text", 'REVIEW_REQUIRED'::"text"]))),
    CONSTRAINT "tax_rule_versions_jurisdiction_check" CHECK (("jurisdiction" = ANY (ARRAY['EG'::"text", 'SA'::"text"]))),
    CONSTRAINT "tax_rule_versions_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'APPROVED'::"text", 'SUPERSEDED'::"text"]))),
    CONSTRAINT "tax_rule_versions_tax_treatment_check" CHECK (("tax_treatment" = ANY (ARRAY['TAXABLE'::"text", 'EXEMPT'::"text", 'ZERO_RATED'::"text", 'OUT_OF_SCOPE'::"text", 'REVIEW_REQUIRED'::"text"]))),
    CONSTRAINT "tax_rule_versions_version_check" CHECK (("version" >= 1)),
    CONSTRAINT "tax_rule_window_ordered" CHECK ((("effective_to" IS NULL) OR ("effective_to" > "effective_from")))
);


ALTER TABLE "public"."tax_rule_versions" OWNER TO "postgres";


COMMENT ON TABLE "public"."tax_rule_versions" IS 'قواعد ضريبية مؤرَّخة السريان ومُصدَّرة. الصف المعتمد لا يُعدَّل — يُخلَف بإصدار جديد.';



CREATE OR REPLACE FUNCTION "public"."resolve_tax_rule"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_transaction_date" "date") RETURNS "public"."tax_rule_versions"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select *
  from public.tax_rule_versions
  where jurisdiction = p_jurisdiction
    and revenue_nature = p_revenue_nature
    and status in ('APPROVED', 'SUPERSEDED')
    and effective_from <= p_transaction_date
    and (effective_to is null or effective_to > p_transaction_date)
  order by effective_from desc
  limit 1;
$$;


ALTER FUNCTION "public"."resolve_tax_rule"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_transaction_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_unit"("p_organization_id" "uuid", "p_unit_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك باستعادة الوحدة' using errcode = '42501';
  end if;

  select property_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  update public.units
  set is_active = true,
      archived_at = null,
      archived_by = null
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.restored', 'unit', p_unit_id, '{}'::jsonb);
end;
$$;


ALTER FUNCTION "public"."restore_unit"("p_organization_id" "uuid", "p_unit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_journal_entry"("p_journal_entry_id" "uuid", "p_reversal_fiscal_period_id" "uuid", "p_reversal_date" "date", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_original public.journal_entries;
  v_new_entry_id uuid;
  v_entry_number bigint;
  v_period public.fiscal_periods;
begin
  select * into v_original from public.journal_entries where id = p_journal_entry_id;
  if v_original.id is null then
    raise exception 'journal entry not found';
  end if;
  if v_original.status <> 'POSTED' then
    raise exception 'only posted entries can be reversed';
  end if;

  if not public.has_permission(auth.uid(), v_original.organization_id, 'finance.entries.reverse') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_original.organization_id) then
    raise exception 'organization is not active';
  end if;

  select * into v_period from public.fiscal_periods where id = p_reversal_fiscal_period_id;
  if v_period.id is null or v_period.organization_id <> v_original.organization_id then
    raise exception 'reversal fiscal period does not belong to this organization';
  end if;
  if v_period.status <> 'OPEN' then
    raise exception 'reversal fiscal period is not open';
  end if;

  insert into public.journal_entries (
    organization_id, property_id, fiscal_period_id, entry_date, description,
    source_type, status, reversed_entry_id, created_by, posted_by, posted_at
  ) values (
    v_original.organization_id, v_original.property_id, p_reversal_fiscal_period_id, p_reversal_date,
    coalesce(p_reason, 'Reversal of entry ' || coalesce(v_original.entry_number::text, v_original.id::text)),
    v_original.source_type, 'POSTED', v_original.id, auth.uid(), auth.uid(), now()
  )
  returning id into v_new_entry_id;

  v_entry_number := public.next_sequence_value(v_original.organization_id, null, 'journal_entry');
  update public.journal_entries set entry_number = v_entry_number where id = v_new_entry_id;

  insert into public.journal_entry_lines (journal_entry_id, line_number, account_id, description, debit, credit, cost_center_id, project_id)
  select v_new_entry_id, line_number, account_id, description, credit, debit, cost_center_id, project_id
  from public.journal_entry_lines
  where journal_entry_id = p_journal_entry_id;

  update public.journal_entries set status = 'REVERSED' where id = p_journal_entry_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), v_original.organization_id, v_original.property_id, 'journal_entry.reversed', 'journal_entry', p_journal_entry_id, p_reason,
    jsonb_build_object('reversal_entry_id', v_new_entry_id, 'reversal_entry_number', v_entry_number));

  return v_new_entry_id;
end;
$$;


ALTER FUNCTION "public"."reverse_journal_entry"("p_journal_entry_id" "uuid", "p_reversal_fiscal_period_id" "uuid", "p_reversal_date" "date", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_tax_decision"("p_decision_id" "uuid", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_original public.tax_decisions;
  v_id uuid;
begin
  select * into v_original from public.tax_decisions where id = p_decision_id;
  if v_original.id is null then
    raise exception 'TAX_DECISION_NOT_FOUND: القرار غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_original.organization_id, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بإبطال قرار ضريبي' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'TAX_DECISION_REASON_REQUIRED: الإبطال يحتاج سببًا' using errcode = '22023';
  end if;

  if v_original.reverses_decision_id is not null then
    raise exception 'TAX_DECISION_IS_REVERSAL: القرار العكسي لا يُعكَس' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.tax_decisions where reverses_decision_id = p_decision_id) then
    raise exception 'TAX_DECISION_ALREADY_REVERSED: القرار مُبطَل بالفعل' using errcode = 'P0001';
  end if;

  insert into public.tax_decisions (
    organization_id, source_type, source_id, revenue_nature, jurisdiction,
    transaction_date, tax_rule_version_id, tax_rule_hash, tax_decision_snapshot,
    reverses_decision_id, reason, decided_by
  ) values (
    v_original.organization_id, v_original.source_type, v_original.source_id,
    v_original.revenue_nature, v_original.jurisdiction, v_original.transaction_date,
    v_original.tax_rule_version_id, v_original.tax_rule_hash,
    v_original.tax_decision_snapshot || jsonb_build_object('reversal_of', p_decision_id),
    p_decision_id, p_reason, auth.uid()
  )
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (
    auth.uid(), v_original.organization_id, 'tax_decision.reversed', 'tax_decision', v_id,
    p_reason,
    jsonb_build_object(
      'reverses_decision_id', p_decision_id,
      'source_type', v_original.source_type,
      'source_id', v_original.source_id,
      'revenue_nature', v_original.revenue_nature
    )
  );

  return v_id;
end;
$$;


ALTER FUNCTION "public"."reverse_tax_decision"("p_decision_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_due_type_revenue_nature_approval"("p_mapping_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_map record;
begin
  select * into v_map from public.due_type_revenue_natures where id = p_mapping_id;
  if v_map.id is null then
    raise exception 'TAX_MAPPING_NOT_FOUND: الربط غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_map.organization_id, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بسحب الاعتماد' using errcode = '42501';
  end if;

  if v_map.status <> 'APPROVED' then
    raise exception 'TAX_MAPPING_NOT_APPROVED: الربط ليس معتمدًا' using errcode = 'P0001';
  end if;

  update public.due_type_revenue_natures
  set status = 'REVIEW_REQUIRED', approved_by = null, approved_at = null, updated_at = now()
  where id = p_mapping_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (
    auth.uid(), v_map.organization_id, 'tax_mapping.approval_revoked',
    'due_type_revenue_nature', p_mapping_id, p_reason,
    jsonb_build_object(
      'due_type_id',    v_map.due_type_id,
      'revenue_nature', v_map.revenue_nature,
      'status_from',    'APPROVED',
      'status_to',      'REVIEW_REQUIRED'
    )
  );
end;
$$;


ALTER FUNCTION "public"."revoke_due_type_revenue_nature_approval"("p_mapping_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_due_schedules"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_schedule record;
  v_current_day integer := EXTRACT(DAY FROM CURRENT_DATE);
  v_current_month integer := EXTRACT(MONTH FROM CURRENT_DATE);
  v_period text;
  v_res jsonb;
  v_total_runs integer := 0;
BEGIN
  FOR v_schedule IN
    SELECT * FROM public.due_schedules
    WHERE is_active = true
      AND (
        (frequency = 'MONTHLY' AND day_of_month = v_current_day)
        OR (frequency = 'YEARLY' AND day_of_month = v_current_day AND month_of_year = v_current_month)
      )
  LOOP
    IF v_schedule.frequency = 'MONTHLY' THEN
      v_period := to_char(CURRENT_DATE, 'YYYY-MM');
    ELSE
      v_period := to_char(CURRENT_DATE, 'YYYY');
    END IF;

    v_res := public.generate_recurring_dues(
      p_organization_id := v_schedule.organization_id,
      p_schedule_id := v_schedule.id,
      p_period := v_period,
      p_generated_by := NULL
    );

    v_total_runs := v_total_runs + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'executed_schedules_count', v_total_runs
  );
END;
$$;


ALTER FUNCTION "public"."run_due_schedules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_lease_rent_generation"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lease record;
  v_period text;
  v_result jsonb;
  v_generated int := 0;
  v_idempotent int := 0;
  v_blocked int := 0;
  v_skipped int := 0;
  v_errored int := 0;
begin
  for v_lease in
    select id, organization_id, rent_frequency
    from public.unit_leases
    where status = 'ACTIVE'
      and starts_on <= current_date
      and (ends_on is null or ends_on >= current_date)
  loop
    v_period := public.lease_rent_period_key(v_lease.rent_frequency, current_date);
    begin
      v_result := public.generate_lease_rent_dues(v_lease.organization_id, v_lease.id, v_period);
      if (v_result ->> 'generated')::boolean is true then
        v_generated := v_generated + 1;
      elsif (v_result ->> 'idempotent')::boolean is true then
        v_idempotent := v_idempotent + 1;
      elsif (v_result ->> 'blocked')::boolean is true then
        v_blocked := v_blocked + 1;
      elsif (v_result ->> 'skipped')::boolean is true then
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_errored := v_errored + 1;
    end;
  end loop;

  return jsonb_build_object(
    'generated', v_generated, 'idempotent', v_idempotent,
    'blocked', v_blocked, 'skipped', v_skipped, 'errored', v_errored
  );
end;
$$;


ALTER FUNCTION "public"."run_lease_rent_generation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."schedule_unit_handover"("p_unit_id" "uuid", "p_scheduled_date" "date", "p_handed_to_member_id" "uuid" DEFAULT NULL::"uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_unit record;
  v_id uuid;
begin
  select * into v_unit from public.units where id = p_unit_id;
  if v_unit.id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_unit.organization_id, 'property.handover.manage') then
    raise exception 'FORBIDDEN_PROPERTY_PERMISSION: غير مصرح لك بإدارة تسليم الوحدات' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_unit.organization_id) then
    raise exception 'ORGANIZATION_NOT_ACTIVE: المؤسسة غير نشطة' using errcode = 'P0001';
  end if;

  insert into public.unit_handovers (
    organization_id, property_id, unit_id, handed_to_member_id,
    status, scheduled_date, note, created_by
  ) values (
    v_unit.organization_id, v_unit.property_id, p_unit_id, p_handed_to_member_id,
    'SCHEDULED', p_scheduled_date, p_note, auth.uid()
  )
  on conflict (unit_id) do update
    set scheduled_date = excluded.scheduled_date,
        handed_to_member_id = excluded.handed_to_member_id,
        note = excluded.note
    where unit_handovers.status = 'SCHEDULED'
  returning id into v_id;

  if v_id is null then
    raise exception 'HANDOVER_ALREADY_COMPLETED: تم تسليم هذه الوحدة بالفعل' using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."schedule_unit_handover"("p_unit_id" "uuid", "p_scheduled_date" "date", "p_handed_to_member_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."security_function_grant_inventory"() RETURNS TABLE("function_name" "text", "is_security_definer" boolean, "anon_can_execute" boolean, "authenticated_can_execute" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
  SELECT DISTINCT
    p.proname::text,
    p.prosecdef,
    has_function_privilege('anon', p.oid, 'EXECUTE'),
    has_function_privilege('authenticated', p.oid, 'EXECUTE')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_depend d
    ON d.objid = p.oid
   AND d.classid = 'pg_proc'::regclass
   AND d.deptype = 'e'
  WHERE n.nspname = 'public'
    AND d.objid IS NULL
    AND p.prokind = 'f';
$$;


ALTER FUNCTION "public"."security_function_grant_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_asset_disposal_accounts"("p_organization_id" "uuid", "p_gain_account_id" "uuid", "p_loss_account_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before jsonb;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتعيين حسابات استبعاد الأصول'
      using errcode = '42501';
  end if;

  if p_gain_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_gain_account_id and a.organization_id = p_organization_id
      and a.category = 'REVENUE' and not a.is_group and a.is_active
  ) then
    raise exception
      'DISPOSAL_GAIN_ACCOUNT_INVALID: حساب أرباح الاستبعاد يجب أن يكون إيرادًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  if p_loss_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_loss_account_id and a.organization_id = p_organization_id
      and a.category = 'EXPENSE' and not a.is_group and a.is_active
  ) then
    raise exception
      'DISPOSAL_LOSS_ACCOUNT_INVALID: حساب خسائر الاستبعاد يجب أن يكون مصروفًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  select jsonb_build_object('gain', asset_disposal_gain_account_id,
                            'loss', asset_disposal_loss_account_id)
  into v_before from public.organizations where id = p_organization_id;

  update public.organizations
  set asset_disposal_gain_account_id = p_gain_account_id,
      asset_disposal_loss_account_id = p_loss_account_id
  where id = p_organization_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), p_organization_id, 'asset_disposal_accounts.set', 'organization', p_organization_id,
    jsonb_build_object('from', v_before,
      'to', jsonb_build_object('gain', p_gain_account_id, 'loss', p_loss_account_id))
  );
end;
$$;


ALTER FUNCTION "public"."set_asset_disposal_accounts"("p_organization_id" "uuid", "p_gain_account_id" "uuid", "p_loss_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_cheque_status"("p_cheque_id" "uuid", "p_new_status" "text", "p_note" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cheque public.cheques;
  v_legal boolean;
begin
  select * into v_cheque from public.cheques where id = p_cheque_id;
  if v_cheque.id is null then
    raise exception 'CHEQUE_NOT_FOUND: الشيك غير موجود' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_cheque.organization_id, 'banking.cheques.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إدارة الشيكات' using errcode = '42501';
  end if;

  v_legal := (v_cheque.status, p_new_status) in (
    ('RECEIVED', 'DEPOSITED'), ('RECEIVED', 'CANCELLED'),
    ('DEPOSITED', 'RETURNED'),
    ('DRAFT', 'ISSUED'),
    ('ISSUED', 'CLEARED'), ('ISSUED', 'CANCELLED'), ('ISSUED', 'RETURNED')
  );
  if not v_legal then
    raise exception 'ILLEGAL_CHEQUE_STATUS: لا يمكن تغيير حالة الشيك من % إلى %', v_cheque.status, p_new_status using errcode = '22023';
  end if;

  update public.cheques set status = p_new_status where id = p_cheque_id;

  insert into public.cheque_status_history (cheque_id, from_status, to_status, changed_by, note)
  values (p_cheque_id, v_cheque.status, p_new_status, auth.uid(), p_note);
end;
$$;


ALTER FUNCTION "public"."set_cheque_status"("p_cheque_id" "uuid", "p_new_status" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_due_type_catalogue_item"("p_due_type_id" "uuid", "p_catalogue_item_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
  v_item_org uuid;
begin
  select organization_id into v_org from public.due_types where id = p_due_type_id;
  if v_org is null then
    raise exception 'DUE_TYPE_NOT_FOUND: نوع المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بربط الأصناف'
      using errcode = '42501';
  end if;

  if p_catalogue_item_id is not null then
    select organization_id into v_item_org
    from public.catalogue_items where id = p_catalogue_item_id and is_active;
    if v_item_org is null or v_item_org <> v_org then
      raise exception
        'CATALOGUE_ITEM_NOT_IN_ORGANIZATION: الصنف غير موجود أو لا يتبع هذه المؤسسة'
        using errcode = '22023';
    end if;
  end if;

  update public.due_types set catalogue_item_id = p_catalogue_item_id where id = p_due_type_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_org, 'due_type_catalogue_item.set', 'due_type', p_due_type_id,
    jsonb_build_object('catalogue_item_id', p_catalogue_item_id)
  );
end;
$$;


ALTER FUNCTION "public"."set_due_type_catalogue_item"("p_due_type_id" "uuid", "p_catalogue_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_due_type_revenue_nature"("p_due_type_id" "uuid", "p_revenue_nature" "text", "p_notes" "text" DEFAULT NULL::"text", "p_amount_basis" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
  v_id uuid;
  v_before record;
begin
  select organization_id into v_org from public.due_types where id = p_due_type_id;
  if v_org is null then
    raise exception 'DUE_TYPE_NOT_FOUND: نوع المستحق غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.tax_mapping.manage') then
    raise exception 'FORBIDDEN_TAX_MAPPING: غير مصرح لك بربط أنواع المستحقات'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.revenue_natures where code = p_revenue_nature) then
    raise exception 'REVENUE_NATURE_UNKNOWN: طبيعة إيراد غير معروفة (%)', p_revenue_nature
      using errcode = '22023';
  end if;

  if p_amount_basis is not null and p_amount_basis not in ('NET', 'GROSS') then
    raise exception 'TAX_AMOUNT_BASIS_INVALID: أساس المبلغ إما NET أو GROSS' using errcode = '22023';
  end if;

  select revenue_nature, status into v_before
  from public.due_type_revenue_natures
  where organization_id = v_org and due_type_id = p_due_type_id;

  insert into public.due_type_revenue_natures (
    organization_id, due_type_id, revenue_nature, status, notes, amount_basis, created_by
  ) values (
    v_org, p_due_type_id, p_revenue_nature, 'REVIEW_REQUIRED', p_notes, p_amount_basis, auth.uid()
  )
  on conflict (organization_id, due_type_id) do update
  set revenue_nature = excluded.revenue_nature,
      notes          = excluded.notes,
      amount_basis   = excluded.amount_basis,
      status         = 'REVIEW_REQUIRED',
      approved_by    = null,
      approved_at    = null,
      updated_at     = now()
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_org, 'tax_mapping.set', 'due_type_revenue_nature', v_id,
    jsonb_build_object(
      'due_type_id',         p_due_type_id,
      'revenue_nature_from', v_before.revenue_nature,
      'revenue_nature_to',   p_revenue_nature,
      'amount_basis',        p_amount_basis,
      'status_from',         v_before.status,
      'status_to',           'REVIEW_REQUIRED',
      'approval_revoked',    coalesce(v_before.status = 'APPROVED', false)
    )
  );

  return v_id;
end;
$$;


ALTER FUNCTION "public"."set_due_type_revenue_nature"("p_due_type_id" "uuid", "p_revenue_nature" "text", "p_notes" "text", "p_amount_basis" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_einvoice_profile_enabled"("p_profile_id" "uuid", "p_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_profile record;
begin
  select * into v_profile from public.einvoice_profiles where id = p_profile_id;
  if v_profile.id is null then
    raise exception 'EINVOICE_PROFILE_NOT_FOUND: ملف التسجيل غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_profile.organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة إعدادات الفوترة الإلكترونية'
      using errcode = '42501';
  end if;

  if p_enabled and (v_profile.status <> 'ACTIVE' or v_profile.verified_at is null) then
    raise exception
      'EINVOICE_NOT_VERIFIED: لا يمكن تفعيل الإرسال قبل التحقق الفعلي من بيانات الاعتماد'
      using errcode = 'P0001';
  end if;

  update public.einvoice_profiles
  set enabled = p_enabled, updated_by = auth.uid()
  where id = p_profile_id;
end;
$$;


ALTER FUNCTION "public"."set_einvoice_profile_enabled"("p_profile_id" "uuid", "p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_einvoice_profile_verification"("p_profile_id" "uuid", "p_success" boolean, "p_error" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.einvoice_profiles where id = p_profile_id;
  if v_org is null then
    raise exception 'EINVOICE_PROFILE_NOT_FOUND: ملف التسجيل غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة الفوترة الإلكترونية' using errcode = '42501';
  end if;

  if p_success then
    update public.einvoice_profiles
    set status = 'ACTIVE', verified_at = now(), last_verification_error = null, updated_by = auth.uid()
    where id = p_profile_id;
  else
    update public.einvoice_profiles
    set status = 'DRAFT', verified_at = null,
        last_verification_error = left(coalesce(p_error, 'verification failed'), 500),
        enabled = false, updated_by = auth.uid()
    where id = p_profile_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."set_einvoice_profile_verification"("p_profile_id" "uuid", "p_success" boolean, "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_expense_account_input_tax"("p_expense_account_id" "uuid", "p_recoverability" "text", "p_recoverable_ratio" numeric DEFAULT NULL::numeric, "p_ratio_method" "text" DEFAULT NULL::"text", "p_ratio_period" "text" DEFAULT NULL::"text", "p_ratio_reference" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_org uuid;
  v_before record;
  v_id uuid;
begin
  select organization_id into v_org
  from public.chart_of_accounts where id = p_expense_account_id;
  if v_org is null then
    raise exception 'ACCOUNT_NOT_FOUND: الحساب غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_org, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإعلان قابلية خصم ضريبة المدخلات'
      using errcode = '42501';
  end if;

  if p_recoverability not in ('FULLY_RECOVERABLE', 'NON_RECOVERABLE', 'MIXED') then
    raise exception 'INPUT_TAX_RECOVERABILITY_INVALID: قيمة قابلية الخصم غير معروفة'
      using errcode = '22023';
  end if;

  if p_recoverability = 'MIXED' then
    if p_recoverable_ratio is null then
      raise exception 'MIXED_USE_RATIO_MISSING: المصروف المختلط يحتاج نسبة قابلية خصم'
        using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_ratio_method, '')), '') is null then
      raise exception 'MIXED_USE_METHOD_MISSING: النسبة بلا منهج لا تُراجَع ولا تُعاد حسابها'
        using errcode = '22023';
    end if;
    if nullif(btrim(coalesce(p_ratio_period, '')), '') is null then
      raise exception 'MIXED_USE_PERIOD_MISSING: النسبة تخص فترة محددة، وبلا فترة لا تسوية دورية'
        using errcode = '22023';
    end if;
  end if;

  select recoverability, status into v_before
  from public.expense_account_input_tax
  where organization_id = v_org and expense_account_id = p_expense_account_id;

  insert into public.expense_account_input_tax (
    organization_id, expense_account_id, recoverability, recoverable_ratio,
    ratio_method, ratio_period, ratio_reference, status, notes, created_by
  ) values (
    v_org, p_expense_account_id, p_recoverability,
    case when p_recoverability = 'MIXED' then p_recoverable_ratio else null end,
    p_ratio_method, p_ratio_period, p_ratio_reference, 'REVIEW_REQUIRED', p_notes, auth.uid()
  )
  on conflict (organization_id, expense_account_id) do update
  set recoverability    = excluded.recoverability,
      recoverable_ratio = excluded.recoverable_ratio,
      ratio_method      = excluded.ratio_method,
      ratio_period      = excluded.ratio_period,
      ratio_reference   = excluded.ratio_reference,
      notes             = excluded.notes,
      status            = 'REVIEW_REQUIRED',
      approved_by       = null,
      approved_at       = null,
      updated_at        = now()
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), v_org, 'input_tax_recoverability.set', 'expense_account_input_tax', v_id,
    jsonb_build_object(
      'expense_account_id', p_expense_account_id,
      'recoverability_from', v_before.recoverability,
      'recoverability_to', p_recoverability,
      'ratio', p_recoverable_ratio, 'method', p_ratio_method, 'period', p_ratio_period,
      'status_from', v_before.status, 'status_to', 'REVIEW_REQUIRED',
      'approval_revoked', coalesce(v_before.status = 'APPROVED', false)
    )
  );

  return v_id;
end;
$$;


ALTER FUNCTION "public"."set_expense_account_input_tax"("p_expense_account_id" "uuid", "p_recoverability" "text", "p_recoverable_ratio" numeric, "p_ratio_method" "text", "p_ratio_period" "text", "p_ratio_reference" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_fiscal_period_status"("p_fiscal_period_id" "uuid", "p_status" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_period public.fiscal_periods;
begin
  select * into v_period from public.fiscal_periods where id = p_fiscal_period_id;
  if v_period.id is null then
    raise exception 'fiscal period not found';
  end if;
  if not public.has_permission(auth.uid(), v_period.organization_id, 'finance.periods.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('PLANNED', 'OPEN', 'CLOSED', 'LOCKED') then
    raise exception 'invalid status: %', p_status;
  end if;
  -- Reopening a closed/locked period is a deliberate, audited exception --
  -- permission-gated the same as any other period change, with the reason
  -- captured below (spec §12: "Reopening requires permission and reason").

  update public.fiscal_periods set status = p_status where id = p_fiscal_period_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), v_period.organization_id, 'fiscal_period.status_changed', 'fiscal_period', p_fiscal_period_id, p_reason,
    jsonb_build_object('new_status', p_status));
end;
$$;


ALTER FUNCTION "public"."set_fiscal_period_status"("p_fiscal_period_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_fx_difference_accounts"("p_organization_id" "uuid", "p_gain_account_id" "uuid", "p_loss_account_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before jsonb;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتعيين حسابات فروق الصرف'
      using errcode = '42501';
  end if;

  if p_gain_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_gain_account_id and a.organization_id = p_organization_id
      and a.category = 'REVENUE' and not a.is_group and a.is_active
  ) then
    raise exception
      'FX_GAIN_ACCOUNT_INVALID: حساب ربح فرق العملة يجب أن يكون إيرادًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  if p_loss_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_loss_account_id and a.organization_id = p_organization_id
      and a.category = 'EXPENSE' and not a.is_group and a.is_active
  ) then
    raise exception
      'FX_LOSS_ACCOUNT_INVALID: حساب خسارة فرق العملة يجب أن يكون مصروفًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  select jsonb_build_object('gain', fx_gain_account_id, 'loss', fx_loss_account_id)
  into v_before from public.organizations where id = p_organization_id;

  update public.organizations
  set fx_gain_account_id = p_gain_account_id,
      fx_loss_account_id = p_loss_account_id
  where id = p_organization_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), p_organization_id, 'fx_difference_accounts.set', 'organization', p_organization_id,
    jsonb_build_object('from', v_before,
      'to', jsonb_build_object('gain', p_gain_account_id, 'loss', p_loss_account_id))
  );
end;
$$;


ALTER FUNCTION "public"."set_fx_difference_accounts"("p_organization_id" "uuid", "p_gain_account_id" "uuid", "p_loss_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_input_tax_account"("p_organization_id" "uuid", "p_account_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before uuid;
  v_output uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتعيين حساب ضريبة المدخلات'
      using errcode = '42501';
  end if;

  if p_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_account_id and a.organization_id = p_organization_id
      and a.category = 'ASSET' and not a.is_group and a.is_active
  ) then
    raise exception
      'INPUT_TAX_ACCOUNT_INVALID: يجب أن يكون الحساب أصلًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  v_output := public.resolve_output_tax_account(p_organization_id);
  if p_account_id is not null and v_output is not null and p_account_id = v_output then
    raise exception
      'INPUT_TAX_ACCOUNT_CONFLICT: لا يجوز أن يكون حساب ضريبة المدخلات هو حساب ضريبة المخرجات نفسه'
      using errcode = '22023';
  end if;

  select input_tax_account_id into v_before
  from public.organizations where id = p_organization_id;

  update public.organizations set input_tax_account_id = p_account_id
  where id = p_organization_id;

  update public.expense_account_input_tax
  set status = 'REVIEW_REQUIRED', approved_by = null, approved_at = null, updated_at = now()
  where organization_id = p_organization_id and status = 'APPROVED';

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), p_organization_id, 'input_tax_account.set', 'organization', p_organization_id,
    jsonb_build_object('from', v_before, 'to', p_account_id, 'approvals_revoked', true)
  );
end;
$$;


ALTER FUNCTION "public"."set_input_tax_account"("p_organization_id" "uuid", "p_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_member_tax_identity"("p_member_id" "uuid", "p_customer_type" "text", "p_tax_registration_number" "text" DEFAULT NULL::"text", "p_identity_document_type" "text" DEFAULT NULL::"text", "p_identity_document_number" "text" DEFAULT NULL::"text", "p_legal_name" "text" DEFAULT NULL::"text", "p_country_code" "text" DEFAULT NULL::"text", "p_billing_address" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- منشأة بلا رقم تسجيل ليست هوية صالحة للفوترة الخاضعة، ورفضها هنا أوضح من
  -- قبولها ثم رفض كل فاتورة لاحقًا.
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


ALTER FUNCTION "public"."set_member_tax_identity"("p_member_id" "uuid", "p_customer_type" "text", "p_tax_registration_number" "text", "p_identity_document_type" "text", "p_identity_document_number" "text", "p_legal_name" "text", "p_country_code" "text", "p_billing_address" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_organization_status"("p_organization_id" "uuid", "p_status" "text", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_status not in ('TRIAL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED') then
    raise exception 'invalid status: %', p_status;
  end if;

  update public.organizations
  set status = p_status, updated_by = auth.uid()
  where id = p_organization_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, 'organization.status_changed', 'organization', p_organization_id, p_reason,
    jsonb_build_object('new_status', p_status));
end;
$$;


ALTER FUNCTION "public"."set_organization_status"("p_organization_id" "uuid", "p_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_output_tax_account"("p_organization_id" "uuid", "p_account_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتعيين حساب ضريبة المخرجات'
      using errcode = '42501';
  end if;

  if p_account_id is not null and not exists (
    select 1 from public.chart_of_accounts a
    where a.id = p_account_id and a.organization_id = p_organization_id
      and a.category = 'LIABILITY' and not a.is_group and a.is_active
  ) then
    raise exception
      'OUTPUT_TAX_ACCOUNT_INVALID: يجب أن يكون الحساب التزامًا نشطًا غير تجميعي ويخص المؤسسة نفسها'
      using errcode = '22023';
  end if;

  select output_tax_account_id into v_before
  from public.organizations where id = p_organization_id;

  update public.organizations set output_tax_account_id = p_account_id
  where id = p_organization_id;

  update public.due_type_revenue_natures
  set status = 'REVIEW_REQUIRED', approved_by = null, approved_at = null, updated_at = now()
  where organization_id = p_organization_id and status = 'APPROVED';

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), p_organization_id, 'tax_output_account.set', 'organization', p_organization_id,
    jsonb_build_object('from', v_before, 'to', p_account_id, 'approvals_revoked', true)
  );
end;
$$;


ALTER FUNCTION "public"."set_output_tax_account"("p_organization_id" "uuid", "p_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_purchase_order_status"("p_purchase_order_id" "uuid", "p_new_status" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order public.purchase_orders;
  v_legal boolean;
begin
  select * into v_order from public.purchase_orders where id = p_purchase_order_id;
  if v_order.id is null then
    raise exception 'purchase order not found';
  end if;
  if not public.has_permission(auth.uid(), v_order.organization_id, 'purchasing.orders.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_legal := (v_order.status, p_new_status) in (('APPROVED', 'RECEIVED'), ('DRAFT', 'CANCELLED'), ('APPROVED', 'CANCELLED'));
  if not v_legal then
    raise exception 'illegal purchase order status transition: % -> %', v_order.status, p_new_status;
  end if;

  update public.purchase_orders set status = p_new_status where id = p_purchase_order_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_order.organization_id, v_order.property_id, 'purchase_order.status_changed', 'purchase_order', p_purchase_order_id,
    jsonb_build_object('new_status', p_new_status));
end;
$$;


ALTER FUNCTION "public"."set_purchase_order_status"("p_purchase_order_id" "uuid", "p_new_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_tax_enforcement"("p_organization_id" "uuid", "p_enabled" boolean, "p_reason" "text" DEFAULT NULL::"text", "p_acknowledged_undecided_dues" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_gaps text;
  v_count integer;
  v_was boolean;
  v_undecided integer;
  v_earliest date;
  v_latest date;
  v_amount numeric;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.tax_enforcement.manage') then
    raise exception 'FORBIDDEN_TAX_ENFORCEMENT: غير مصرح لك بتفعيل الإنفاذ الضريبي'
      using errcode = '42501';
  end if;

  select tax_enforcement_enabled into v_was
  from public.organizations where id = p_organization_id;
  if v_was is null then
    raise exception 'ORGANIZATION_NOT_FOUND: المؤسسة غير موجودة' using errcode = 'P0002';
  end if;

  if p_enabled then
    select count(*), string_agg(gap_code || ': ' || detail, ' | ')
    into v_count, v_gaps
    from public.check_tax_enforcement_readiness(p_organization_id);

    if v_count > 0 then
      raise exception 'TAX_ENFORCEMENT_NOT_READY: %', v_gaps using errcode = 'P0001';
    end if;

    select c.dues_without_decision, c.earliest_undecided_issue_date,
           c.latest_undecided_issue_date, c.undecided_amount
    into v_undecided, v_earliest, v_latest, v_amount
    from public.get_tax_decision_coverage(p_organization_id) c;

    v_undecided := coalesce(v_undecided, 0);

    -- التفعيل يعمل إلى الأمام فقط، فالمستحقات السابقة تبقى بلا قرار. هذا ليس
    -- خللًا بل قرار محاسبي غير محسوم، ولا يجوز أن يُقبل ضمنًا. المستدعي يجب أن
    -- يذكر العدد الذي يعرف أنه يقبله، ويُرفض إن خالف الواقع — فلا يمكن التفعيل
    -- فوق فجوة لم يُنظر فيها.
    if v_undecided > 0
       and coalesce(p_acknowledged_undecided_dues, -1) <> v_undecided then
      raise exception
        'TAX_HISTORICAL_GAP_UNACKNOWLEDGED: % مستحقًا قائمًا بلا قرار ضريبي (% إلى %، بمبلغ %). التفعيل يعمل إلى الأمام فقط ولن يصنّفها؛ أكّد العدد صراحةً بعد تقرير أثره',
        v_undecided, v_earliest, v_latest, v_amount
        using errcode = 'P0001';
    end if;
  end if;

  if not p_enabled and v_was and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception
      'TAX_ENFORCEMENT_DISABLE_REASON_REQUIRED: إيقاف الإنفاذ يفتح فجوة في السجل الضريبي؛ اذكر السبب'
      using errcode = '22023';
  end if;

  update public.organizations
  set tax_enforcement_enabled = p_enabled,
      tax_enforcement_enabled_at =
        case when p_enabled then now() else tax_enforcement_enabled_at end,
      tax_enforcement_enabled_by =
        case when p_enabled then auth.uid() else tax_enforcement_enabled_by end,
      tax_enforcement_disabled_at = case when p_enabled then null else now() end,
      tax_enforcement_disabled_by = case when p_enabled then null else auth.uid() end,
      tax_enforcement_disabled_reason = case when p_enabled then null else p_reason end
  where id = p_organization_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (
    auth.uid(), p_organization_id,
    case when p_enabled then 'tax_enforcement.enabled' else 'tax_enforcement.disabled' end,
    'organization', p_organization_id, p_reason,
    jsonb_build_object(
      'from', v_was, 'to', p_enabled,
      -- الفجوة المقبولة تُختم لحظة قبولها: من قبلها، ومتى، وكم كانت.
      'historical_undecided_dues', case when p_enabled then coalesce(v_undecided, 0) else null end,
      'historical_undecided_amount', case when p_enabled then v_amount else null end,
      'historical_undecided_from', case when p_enabled then v_earliest else null end,
      'historical_undecided_to', case when p_enabled then v_latest else null end
    )
  );
end;
$$;


ALTER FUNCTION "public"."set_tax_enforcement"("p_organization_id" "uuid", "p_enabled" boolean, "p_reason" "text", "p_acknowledged_undecided_dues" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_unit_lease_billing_recipient"("p_lease_id" "uuid", "p_billing_recipient" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lease public.unit_leases;
begin
  select * into v_lease from public.unit_leases where id = p_lease_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_lease.organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;
  if v_lease.status not in ('DRAFT', 'ACTIVE') then
    raise exception 'ILLEGAL_STATE: لا يمكن تعديل جهة الفوترة لعقد منتهٍ أو ملغى (الحالة الحالية: %)', v_lease.status
      using errcode = '22023';
  end if;

  update public.unit_leases set billing_recipient = p_billing_recipient where id = p_lease_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_lease.organization_id, v_lease.property_id, 'unit_lease.billing_recipient_changed', 'unit_lease', p_lease_id,
    jsonb_build_object('billing_recipient', p_billing_recipient));
end;
$$;


ALTER FUNCTION "public"."set_unit_lease_billing_recipient"("p_lease_id" "uuid", "p_billing_recipient" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_supplier_invoice_fx_difference"("p_invoice_id" "uuid", "p_settlement_date" "date", "p_settlement_rate" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_inv public.supplier_invoices;
  v_period public.fiscal_periods;
  v_difference numeric;
  v_scale int;
  v_base text;
begin
  select * into v_inv from public.supplier_invoices where id = p_invoice_id;
  if not found then
    raise exception 'SUPPLIER_INVOICE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_permission(auth.uid(), v_inv.organization_id, 'finance.entries.create') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية ترحيل فروق التسوية'
      using errcode = '42501';
  end if;

  if v_inv.currency is null then
    raise exception
      'INVOICE_NOT_FOREIGN_CURRENCY: الفاتورة بعملة المؤسسة، فلا فرق صرف لها'
      using errcode = '22023';
  end if;

  if p_settlement_rate <= 0 then
    raise exception 'EXCHANGE_RATE_INVALID: السعر يجب أن يكون أكبر من صفر'
      using errcode = '22023';
  end if;

  select o.default_currency into v_base
  from public.organizations o where o.id = v_inv.organization_id;
  v_scale := public.currency_decimals(coalesce(v_base, 'EGP'));

  v_difference := round(
    (v_inv.exchange_rate - p_settlement_rate) * v_inv.foreign_amount, v_scale);

  select * into v_period from public.fiscal_periods fp
  where fp.organization_id = v_inv.organization_id
    and fp.status = 'OPEN'
    and p_settlement_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  if v_period.id is null then
    raise exception
      'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي تاريخ السداد (%)', p_settlement_date
      using errcode = 'P0001';
  end if;

  return public.post_fx_difference(
    v_inv.organization_id,
    v_inv.property_id,
    v_period.id,
    p_settlement_date,
    v_difference,
    v_inv.payable_account_id,
    'FX settlement — invoice ' || v_inv.invoice_number,
    'fx_settlement:' || p_invoice_id::text || ':' || p_settlement_date::text
  );
end;
$$;


ALTER FUNCTION "public"."settle_supplier_invoice_fx_difference"("p_invoice_id" "uuid", "p_settlement_date" "date", "p_settlement_rate" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_journal_entry_for_review"("p_journal_entry_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_entry public.journal_entries;
begin
  select * into v_entry from public.journal_entries where id = p_journal_entry_id;
  if v_entry.id is null then
    raise exception 'journal entry not found';
  end if;
  if not public.has_permission(auth.uid(), v_entry.organization_id, 'finance.entries.review') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إرسال القيود للمراجعة' using errcode = '42501';
  end if;
  if v_entry.status <> 'DRAFT' then
    raise exception 'only draft entries can be submitted for review';
  end if;

  update public.journal_entries set status = 'UNDER_REVIEW' where id = p_journal_entry_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id)
  values (auth.uid(), v_entry.organization_id, v_entry.property_id, 'journal_entry.submitted_for_review', 'journal_entry', p_journal_entry_id);
end;
$$;


ALTER FUNCTION "public"."submit_journal_entry_for_review"("p_journal_entry_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."supersede_tax_rule"("p_rule_id" "uuid", "p_effective_from" "date", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_e_document_type" "text", "p_issuer_scope" "text", "p_legal_reference" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_old record;
  v_version integer;
  v_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'FORBIDDEN_TAX_RULE_ADMIN: خلافة القواعد الضريبية لمشرف المنصة وحده'
      using errcode = '42501';
  end if;

  select * into v_old from public.tax_rule_versions where id = p_rule_id;
  if v_old.id is null then
    raise exception 'TAX_RULE_NOT_FOUND: القاعدة غير موجودة' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_old.jurisdiction), hashtext(v_old.revenue_nature));

  if v_old.status <> 'APPROVED' then
    raise exception 'TAX_RULE_NOT_APPROVED: تُخلَف القاعدة المعتمدة وحدها (%)', v_old.status
      using errcode = 'P0001';
  end if;
  if p_effective_from <= v_old.effective_from then
    raise exception 'TAX_RULE_WINDOW_INVALID: تاريخ الخلافة يجب أن يلي بداية القاعدة السابقة'
      using errcode = '22023';
  end if;

  update public.tax_rule_versions
  set effective_to = p_effective_from, status = 'SUPERSEDED'
  where id = p_rule_id;

  select coalesce(max(version), 0) + 1 into v_version
  from public.tax_rule_versions
  where jurisdiction = v_old.jurisdiction and revenue_nature = v_old.revenue_nature;

  insert into public.tax_rule_versions (
    jurisdiction, revenue_nature, tax_treatment, vat_rate, effective_from,
    e_document_type, issuer_scope, version, rule_hash, status, legal_reference,
    approved_by, approved_at, created_by
  ) values (
    v_old.jurisdiction, v_old.revenue_nature, p_tax_treatment, p_vat_rate, p_effective_from,
    p_e_document_type, p_issuer_scope, v_version, '', 'APPROVED', p_legal_reference,
    auth.uid(), now(), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."supersede_tax_rule"("p_rule_id" "uuid", "p_effective_from" "date", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_e_document_type" "text", "p_issuer_scope" "text", "p_legal_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_member_primary_phone"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_member_id uuid;
  v_primary_phone text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_member_id := OLD.member_id;
  ELSE
    v_member_id := NEW.member_id;
  END IF;

  SELECT phone_number INTO v_primary_phone
  FROM public.member_phones
  WHERE member_id = v_member_id
  ORDER BY is_primary DESC, created_at DESC
  LIMIT 1;

  UPDATE public.members
  SET phone = v_primary_phone,
      updated_at = now()
  WHERE id = v_member_id;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sync_member_primary_phone"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tax_rule_content_hash"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_effective_from" "date", "p_e_document_type" "text", "p_issuer_scope" "text", "p_version" integer) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select encode(
    digest(
      concat_ws('|',
        p_jurisdiction, p_revenue_nature, p_tax_treatment,
        coalesce(p_vat_rate::text, '~'), p_effective_from::text,
        p_e_document_type, p_issuer_scope, p_version::text
      ),
      'sha256'
    ),
    'hex'
  );
$$;


ALTER FUNCTION "public"."tax_rule_content_hash"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_effective_from" "date", "p_e_document_type" "text", "p_issuer_scope" "text", "p_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_credit_note_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  raise exception 'CREDIT_NOTE_IMMUTABLE: الإشعار الصادر لا يُعدَّل؛ يُصحَّح بإشعار آخر'
    using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."trg_credit_note_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_dues_post_to_ledger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.post_due_to_ledger(NEW.id);
  return null;
end;
$$;


ALTER FUNCTION "public"."trg_dues_post_to_ledger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_dues_tax_decision"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_enforced boolean;
begin
  select tax_enforcement_enabled into v_enforced
  from public.organizations where id = NEW.organization_id;

  if not coalesce(v_enforced, false) then
    return NEW;
  end if;

  if NEW.status = 'VOID' then
    return NEW;
  end if;

  perform public.record_tax_decision_for_due_internal(NEW.id);
  return NEW;
end;
$$;


ALTER FUNCTION "public"."trg_dues_tax_decision"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_input_tax_decision_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  raise exception 'INPUT_TAX_DECISION_IMMUTABLE: قرار ضريبة المدخلات المسجَّل لا يُعدَّل'
    using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."trg_input_tax_decision_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_members_tax_identity_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."trg_members_tax_identity_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_organizations_tax_identity_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.einvoice_profiles
  set taxpayer_id = nullif(btrim(NEW.tax_id), ''),
      status = 'DRAFT',
      enabled = false,
      verified_at = null,
      last_verification_error = 'تغيّر الرقم الضريبي للمؤسسة؛ يلزم إعادة التحقق'
  where organization_id = NEW.id;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."trg_organizations_tax_identity_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_tax_decision_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  raise exception 'TAX_DECISION_IMMUTABLE: القرار الضريبي المسجَّل لا يُعدَّل'
    using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."trg_tax_decision_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_tax_rule_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- الحذف: الضمان المقصود هو ألا تُمحى قاعدة يستند إليها قرار مرحَّل — لا أن يكون
  -- كل صف أبديًا. قاعدة لم يُقرَّر تحتها شيء قط لا تحمل تاريخًا يُحمى، وحجب حذفها
  -- يجعل كل صف يُنشأ خطأً باقيًا إلى الأبد بلا مسار تصحيح.
  if TG_OP = 'DELETE' then
    if exists (select 1 from public.tax_decisions where tax_rule_version_id = OLD.id) then
      raise exception
        'TAX_RULE_IMMUTABLE: قرارات ضريبية مرحَّلة تستند إلى هذه القاعدة؛ لا تُحذف'
        using errcode = '42501';
    end if;
    return OLD;
  end if;

  if OLD.status = 'DRAFT' then
    return NEW;
  end if;

  if OLD.status = 'SUPERSEDED' then
    raise exception 'TAX_RULE_IMMUTABLE: القاعدة المُخلَفة نهائية ولا تُعدَّل'
      using errcode = '42501';
  end if;

  if (NEW.jurisdiction, NEW.revenue_nature, NEW.tax_treatment, NEW.vat_rate,
      NEW.effective_from, NEW.e_document_type, NEW.issuer_scope, NEW.version,
      NEW.rule_hash, NEW.legal_reference, NEW.approved_by, NEW.approved_at,
      NEW.created_by, NEW.created_at)
     is distinct from
     (OLD.jurisdiction, OLD.revenue_nature, OLD.tax_treatment, OLD.vat_rate,
      OLD.effective_from, OLD.e_document_type, OLD.issuer_scope, OLD.version,
      OLD.rule_hash, OLD.legal_reference, OLD.approved_by, OLD.approved_at,
      OLD.created_by, OLD.created_at)
  then
    raise exception
      'TAX_RULE_IMMUTABLE: لا يُعدَّل مضمون قاعدة معتمدة؛ أنشئ إصدارًا جديدًا'
      using errcode = '42501';
  end if;

  if NEW.status not in ('APPROVED', 'SUPERSEDED') then
    raise exception 'TAX_RULE_IMMUTABLE: انتقال حالة غير مسموح (% ← %)', OLD.status, NEW.status
      using errcode = '42501';
  end if;

  if OLD.effective_to is not null and NEW.effective_to is distinct from OLD.effective_to then
    raise exception 'TAX_RULE_IMMUTABLE: نافذة السريان مغلقة بالفعل ولا تُعدَّل'
      using errcode = '42501';
  end if;

  return NEW;
end;
$$;


ALTER FUNCTION "public"."trg_tax_rule_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_tax_rule_set_hash"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  NEW.rule_hash := public.tax_rule_content_hash(
    NEW.jurisdiction, NEW.revenue_nature, NEW.tax_treatment, NEW.vat_rate,
    NEW.effective_from, NEW.e_document_type, NEW.issuer_scope, NEW.version
  );
  return NEW;
end;
$$;


ALTER FUNCTION "public"."trg_tax_rule_set_hash"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_resort"("p_resort_id" "uuid", "p_name" "text", "p_code" "text", "p_timezone" "text", "p_address" "text" DEFAULT NULL::"text", "p_governorate" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id from public.resorts where id = p_resort_id;
  if v_organization_id is null then
    raise exception 'resort not found';
  end if;

  if not public.has_permission(auth.uid(), v_organization_id, 'tenant.settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.resorts
  set name = p_name,
      code = p_code,
      timezone = coalesce(p_timezone, 'Africa/Cairo'),
      address = p_address,
      governorate = p_governorate,
      phone = p_phone,
      email = p_email,
      updated_by = auth.uid()
  where id = p_resort_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_organization_id, p_resort_id, 'resort.updated', 'resort', p_resort_id,
    jsonb_build_object('name', p_name, 'code', p_code));
end;
$$;


ALTER FUNCTION "public"."update_resort"("p_resort_id" "uuid", "p_name" "text", "p_code" "text", "p_timezone" "text", "p_address" "text", "p_governorate" "text", "p_phone" "text", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_unit"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_code" "text", "p_unit_type" "text", "p_custom_type_label" "text" DEFAULT NULL::"text", "p_building_id" "uuid" DEFAULT NULL::"uuid", "p_zone_id" "uuid" DEFAULT NULL::"uuid", "p_floor_number" integer DEFAULT NULL::integer, "p_area" numeric DEFAULT NULL::numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بتعديل بيانات الوحدة' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط';
  end if;

  -- resort_id is deliberately not a parameter: a unit never moves resorts
  -- from an edit form, only building/zone within its own resort.
  select property_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if p_building_id is not null and not exists (
    select 1 from public.buildings where id = p_building_id and property_id = v_resort_id
  ) then
    raise exception 'INVALID_BUILDING: المبنى المحدد لا ينتمي لموقع هذه الوحدة' using errcode = '22023';
  end if;

  if p_zone_id is not null and not exists (
    select 1 from public.zones where id = p_zone_id and property_id = v_resort_id
  ) then
    raise exception 'INVALID_ZONE: المنطقة المحددة لا تنتمي لموقع هذه الوحدة' using errcode = '22023';
  end if;

  update public.units
  set code = p_code,
      unit_type = p_unit_type,
      custom_type_label = case when p_unit_type = 'OTHER' then p_custom_type_label else null end,
      building_id = p_building_id,
      zone_id = p_zone_id,
      floor_number = p_floor_number,
      area = p_area
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.updated', 'unit', p_unit_id,
    jsonb_build_object('code', p_code, 'unit_type', p_unit_type));
exception
  when unique_violation then
    raise exception 'DUPLICATE_CODE: رمز الوحدة ده مستخدم بالفعل في نفس الموقع' using errcode = '23505';
end;
$$;


ALTER FUNCTION "public"."update_unit"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_code" "text", "p_unit_type" "text", "p_custom_type_label" "text", "p_building_id" "uuid", "p_zone_id" "uuid", "p_floor_number" integer, "p_area" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_catalogue_item"("p_organization_id" "uuid", "p_code" "text", "p_name_ar" "text", "p_name_en" "text", "p_unit_code" "text" DEFAULT 'EA'::"text", "p_item_code_type" "text" DEFAULT NULL::"text", "p_item_code" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_before record;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة كتالوج الأصناف'
      using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_code, '')), '') is null then
    raise exception 'CATALOGUE_ITEM_CODE_REQUIRED: كود الصنف الداخلي مطلوب' using errcode = '22023';
  end if;

  if (p_item_code is not null) <> (p_item_code_type is not null) then
    raise exception
      'ITEM_CODE_TYPE_MISMATCH: كود السلطة ونوعه يأتيان معًا أو لا يأتيان'
      using errcode = '22023';
  end if;

  select id, item_code, item_code_type into v_before
  from public.catalogue_items
  where organization_id = p_organization_id and code = btrim(p_code);

  insert into public.catalogue_items (
    organization_id, code, name_ar, name_en, unit_code, item_code_type, item_code, created_by
  ) values (
    p_organization_id, btrim(p_code), p_name_ar, p_name_en, coalesce(p_unit_code, 'EA'),
    p_item_code_type, nullif(btrim(coalesce(p_item_code, '')), ''), auth.uid()
  )
  on conflict (organization_id, code) do update
  set name_ar = excluded.name_ar,
      name_en = excluded.name_en,
      unit_code = excluded.unit_code,
      item_code_type = excluded.item_code_type,
      item_code = excluded.item_code,
      updated_at = now()
  returning id into v_id;

  insert into public.platform_audit_logs
    (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(), p_organization_id, 'catalogue_item.upserted', 'catalogue_item', v_id,
    jsonb_build_object(
      'code', btrim(p_code),
      'item_code_from', v_before.item_code, 'item_code_to', p_item_code,
      'item_code_type_from', v_before.item_code_type, 'item_code_type_to', p_item_code_type
    )
  );

  return v_id;
end;
$$;


ALTER FUNCTION "public"."upsert_catalogue_item"("p_organization_id" "uuid", "p_code" "text", "p_name_ar" "text", "p_name_en" "text", "p_unit_code" "text", "p_item_code_type" "text", "p_item_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_einvoice_profile"("p_organization_id" "uuid", "p_jurisdiction" "text", "p_environment" "text", "p_taxpayer_id" "text" DEFAULT NULL::"text", "p_branch_code" "text" DEFAULT NULL::"text", "p_activity_code" "text" DEFAULT NULL::"text", "p_property_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_existing record;
  v_id uuid;
  v_org_tax_id text;
  v_effective_tax_id text;
  v_identity_changed boolean := false;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة إعدادات الفوترة الإلكترونية'
      using errcode = '42501';
  end if;

  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_NOT_ACTIVE: المؤسسة غير نشطة' using errcode = 'P0001';
  end if;

  if p_jurisdiction not in ('EG_ETA', 'SA_ZATCA') then
    raise exception
      'EINVOICE_JURISDICTION_UNSUPPORTED: لا يوجد محوّل لهذه الولاية الضريبية بعد (%)', p_jurisdiction
      using errcode = '22023';
  end if;

  if p_environment not in ('SANDBOX', 'PRODUCTION') then
    raise exception 'EINVOICE_ENVIRONMENT_INVALID: بيئة غير صحيحة' using errcode = '22023';
  end if;

  select nullif(btrim(tax_id), '') into v_org_tax_id
  from public.organizations where id = p_organization_id;

  if v_org_tax_id is null then
    raise exception
      'EINVOICE_LEGAL_IDENTITY_MISSING: لم يُسجَّل الرقم الضريبي للمؤسسة؛ سجّله أولًا قبل إعداد الفوترة الإلكترونية'
      using errcode = 'P0001';
  end if;

  v_effective_tax_id := coalesce(nullif(btrim(p_taxpayer_id), ''), v_org_tax_id);

  if v_effective_tax_id <> v_org_tax_id then
    raise exception
      'EINVOICE_IDENTITY_CONFLICT: الرقم الضريبي للملف (%) يخالف الرقم المسجّل للمؤسسة (%)',
      v_effective_tax_id, v_org_tax_id
      using errcode = '22023';
  end if;

  select * into v_existing
  from public.einvoice_profiles
  where organization_id = p_organization_id
    and jurisdiction = p_jurisdiction
    and environment = p_environment;

  if v_existing.id is null then
    insert into public.einvoice_profiles (
      organization_id, property_id, jurisdiction, environment,
      taxpayer_id, branch_code, activity_code, status, enabled, created_by, updated_by
    ) values (
      p_organization_id, p_property_id, p_jurisdiction, p_environment,
      v_effective_tax_id, p_branch_code, p_activity_code, 'DRAFT', false, auth.uid(), auth.uid()
    )
    returning id into v_id;
    return v_id;
  end if;

  v_identity_changed := coalesce(v_existing.taxpayer_id, '') <> v_effective_tax_id;

  update public.einvoice_profiles
  set taxpayer_id = v_effective_tax_id,
      branch_code = p_branch_code,
      activity_code = p_activity_code,
      property_id = coalesce(p_property_id, property_id),
      updated_by = auth.uid(),
      status = case when v_identity_changed then 'DRAFT' else status end,
      enabled = case when v_identity_changed then false else enabled end,
      verified_at = case when v_identity_changed then null else verified_at end,
      last_verification_error = case
        when v_identity_changed
        then 'تغيّرت الهوية الضريبية؛ يلزم إعادة التحقق'
        else last_verification_error end
  where id = v_existing.id
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."upsert_einvoice_profile"("p_organization_id" "uuid", "p_jurisdiction" "text", "p_environment" "text", "p_taxpayer_id" "text", "p_branch_code" "text", "p_activity_code" "text", "p_property_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_payment_provider_settings"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_provider" "text", "p_environment" "text", "p_merchant_identifier" "text", "p_public_key" "text", "p_api_key" "text", "p_hmac_secret" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'vault'
    AS $$
declare
  v_settings_id uuid;
  v_existing public.payment_provider_settings;
  v_api_key_secret_id uuid;
  v_hmac_secret_id uuid;
  v_needs_reverify boolean := false;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.online_payments.manage') then
    raise exception 'FORBIDDEN: لا تملك صلاحية إدارة مزودي الدفع' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if p_provider not in ('FAWRY', 'PAYMOB') then
    raise exception 'INVALID_PROVIDER' using errcode = '22023';
  end if;
  if p_environment not in ('SANDBOX', 'PRODUCTION') then
    raise exception 'INVALID_ENVIRONMENT' using errcode = '22023';
  end if;

  select * into v_existing from public.payment_provider_settings
  where organization_id = p_organization_id
    and coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_resort_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and provider = p_provider and environment = p_environment;

  if v_existing.id is not null then
    v_settings_id := v_existing.id;
    if p_api_key is not null and p_api_key <> '' then
      perform vault.update_secret(v_existing.api_key_secret_id, p_api_key);
      v_needs_reverify := true;
    end if;
    if p_hmac_secret is not null and p_hmac_secret <> '' then
      perform vault.update_secret(v_existing.hmac_secret_id, p_hmac_secret);
      v_needs_reverify := true;
    end if;
    if p_merchant_identifier is distinct from v_existing.merchant_identifier then
      v_needs_reverify := true;
    end if;
    if p_public_key is distinct from v_existing.public_key then
      v_needs_reverify := true;
    end if;

    update public.payment_provider_settings
    set merchant_identifier = p_merchant_identifier,
        public_key = p_public_key,
        updated_by = auth.uid(),
        status = case when v_needs_reverify then 'DRAFT' else status end,
        enabled = case when v_needs_reverify then false else enabled end,
        verified_at = case when v_needs_reverify then null else verified_at end
    where id = v_settings_id;
  else
    v_api_key_secret_id := vault.create_secret(coalesce(p_api_key, ''), p_organization_id::text || ':' || coalesce(p_resort_id::text, '00000000-0000-0000-0000-000000000000') || ':' || p_provider || ':' || p_environment || ':api_key');
    v_hmac_secret_id := vault.create_secret(coalesce(p_hmac_secret, ''), p_organization_id::text || ':' || coalesce(p_resort_id::text, '00000000-0000-0000-0000-000000000000') || ':' || p_provider || ':' || p_environment || ':hmac_secret');

    insert into public.payment_provider_settings (
      organization_id, property_id, provider, environment, merchant_identifier, public_key,
      api_key_secret_id, hmac_secret_id, status, enabled, created_by, updated_by
    ) values (
      p_organization_id, p_resort_id, p_provider, p_environment, p_merchant_identifier, p_public_key,
      v_api_key_secret_id, v_hmac_secret_id, 'DRAFT', false, auth.uid(), auth.uid()
    )
    returning id into v_settings_id;
  end if;

  return v_settings_id;
end;
$$;


ALTER FUNCTION "public"."upsert_payment_provider_settings"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_provider" "text", "p_environment" "text", "p_merchant_identifier" "text", "p_public_key" "text", "p_api_key" "text", "p_hmac_secret" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_online_payments_clearing_account"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  v_account public.chart_of_accounts;
begin
  if not exists (
    select 1 from public.resorts where id = new.property_id and organization_id = new.organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  if new.online_payments_clearing_account_id is not null then
    select * into v_account from public.chart_of_accounts
    where id = new.online_payments_clearing_account_id;

    if v_account.id is null or v_account.organization_id <> new.organization_id then
      raise exception 'CLEARING_ACCOUNT_NOT_IN_ORGANIZATION: الحساب المحدد لا يتبع هذا الكيان' using errcode = '22023';
    end if;
    if v_account.category <> 'ASSET' then
      raise exception 'CLEARING_ACCOUNT_NOT_ASSET: حساب المقاصة يجب أن يكون من نوع أصول' using errcode = '22023';
    end if;
    if v_account.is_group then
      raise exception 'CLEARING_ACCOUNT_IS_GROUP: لا يمكن استخدام حساب تجميعي كحساب مقاصة' using errcode = '22023';
    end if;
    if not v_account.is_active then
      raise exception 'CLEARING_ACCOUNT_INACTIVE: حساب المقاصة غير نشط' using errcode = '22023';
    end if;
    if v_account.property_id is not null and v_account.property_id <> new.property_id then
      raise exception 'CLEARING_ACCOUNT_RESORT_MISMATCH: حساب المقاصة يتبع موقعًا مختلفًا' using errcode = '22023';
    end if;
  end if;

  if new.security_deposit_liability_account_id is not null then
    select * into v_account from public.chart_of_accounts
    where id = new.security_deposit_liability_account_id;

    if v_account.id is null or v_account.organization_id <> new.organization_id then
      raise exception 'DEPOSIT_ACCOUNT_NOT_IN_ORGANIZATION: حساب الودائع لا يتبع هذا الكيان' using errcode = '22023';
    end if;
    if v_account.category <> 'LIABILITY' then
      raise exception 'DEPOSIT_ACCOUNT_NOT_LIABILITY: حساب ودائع التأمين يجب أن يكون من نوع خصوم' using errcode = '22023';
    end if;
    if v_account.is_group then
      raise exception 'DEPOSIT_ACCOUNT_IS_GROUP: لا يمكن استخدام حساب تجميعي لودائع التأمين' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_online_payments_clearing_account"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_payment_provider_settings_scope"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.property_id is not null and not exists (
    select 1 from public.resorts where id = new.property_id and organization_id = new.organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_payment_provider_settings_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_financial_audit_chain"("p_organization_id" "uuid") RETURNS TABLE("log_id" "uuid", "action" "text", "occurred_at" timestamp with time zone, "stored_hash" "text", "calculated_hash" "text", "is_valid" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_rec record;
  v_prev_hash text := NULL;
  v_calc_hash text;
  v_payload text;
BEGIN
  FOR v_rec IN
    SELECT * FROM public.financial_audit_logs
    WHERE organization_id = p_organization_id
    ORDER BY occurred_at ASC, id ASC
  LOOP
    v_payload := concat_ws(
      '|',
      v_rec.organization_id::text,
      COALESCE(v_rec.property_id::text, ''),
      COALESCE(v_rec.actor_user_id::text, 'SYSTEM'),
      v_rec.action,
      v_rec.entity_type,
      COALESCE(v_rec.entity_id::text, ''),
      COALESCE(v_rec.request_id, ''),
      COALESCE(v_rec.ip_address::text, ''),
      COALESCE(v_rec.user_agent, ''),
      to_char(v_rec.occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
      v_rec.metadata::text,
      COALESCE(v_prev_hash, 'GENESIS_BLOCK')
    );

    v_calc_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');

    log_id := v_rec.id;
    action := v_rec.action;
    occurred_at := v_rec.occurred_at;
    stored_hash := v_rec.event_hash;
    calculated_hash := v_calc_hash;
    is_valid := (v_rec.event_hash = v_calc_hash) AND (COALESCE(v_rec.previous_hash, 'GENESIS_BLOCK') = COALESCE(v_prev_hash, 'GENESIS_BLOCK'));

    RETURN NEXT;

    v_prev_hash := v_rec.event_hash;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."verify_financial_audit_chain"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."void_payment"("p_organization_id" "uuid", "p_payment_id" "uuid", "p_reason" "text", "p_ip_address" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_user_id uuid;
  v_payment record;
  v_reason text;
  v_affected_due_ids uuid[];
  v_allocation_snapshot jsonb;
  v_due_id uuid;
  v_due record;
  v_total_paid numeric(19, 4);
  v_new_status text;
  v_today date := current_date;
begin
  -- 1. Identity + input shape (permission is re-checked in step 4 once the
  -- payment's own resort_id is known, for resort-scoped roles).
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' using errcode = '42501';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'REASON_REQUIRED: سبب الإلغاء مطلوب' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'REASON_TOO_LONG: سبب الإلغاء طويل جدًا (الحد 1000 حرف)' using errcode = '22023';
  end if;

  -- 2. Organization-scoped advisory lock -- the SAME key record_payment
  -- takes, so the two RPCs serialize against each other for this
  -- organization instead of racing on the same due's computed status.
  perform pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  -- 3. Fetch + row-lock the payment. FOR UPDATE so a second concurrent
  -- void_payment call on the same payment blocks here (not just on the
  -- advisory lock, which is organization-wide and coarser) until the
  -- first transaction commits or rolls back.
  select * into v_payment
  from public.payments
  where id = p_payment_id and organization_id = p_organization_id
  for update;

  if v_payment.id is null then
    raise exception 'PAYMENT_NOT_FOUND: الدفعة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  -- 4. Permission, now that the payment's real resort_id is known (never
  -- trust a client-supplied resort_id for a permission check).
  if not public.has_financial_permission(p_organization_id, 'finance.payments.void', v_payment.property_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء الدفعات' using errcode = '42501';
  end if;

  -- 5. (reason already validated in step 1)

  -- 6. Status guard -- idempotent-safe: a second click gets a clear
  -- rejection, never a silent no-op or a duplicate reversal.
  if v_payment.status = 'REVERSED' then
    raise exception 'ALREADY_REVERSED: هذه الدفعة ملغاة بالفعل بتاريخ %', v_payment.reversed_at using errcode = '22023';
  end if;
  if v_payment.status <> 'POSTED' then
    raise exception 'NOT_VOIDABLE: لا يمكن إلغاء دفعة بحالة %', v_payment.status using errcode = '22023';
  end if;

  -- 7. Snapshot the still-active allocations for this payment (due_id +
  -- amount) before anything is mutated -- feeds both the due-recompute
  -- loop below and the audit event's "what exactly was reversed" record.
  select array_agg(distinct due_id), jsonb_agg(jsonb_build_object('due_id', due_id, 'amount', amount, 'allocation_id', id))
  into v_affected_due_ids, v_allocation_snapshot
  from public.payment_allocations
  where payment_id = p_payment_id and reversed_at is null;

  -- 8. Lock the affected dues in a fixed order (by id) before touching
  -- any of them, so a hypothetical future concurrent path that locks the
  -- same dues (without going through the record_payment/void_payment
  -- advisory lock) can never deadlock against this transaction.
  if v_affected_due_ids is not null then
    perform 1 from public.dues where id = any(v_affected_due_ids) order by id for update;
  end if;

  -- 9. Reverse the allocations (mark, never delete).
  update public.payment_allocations
  set reversed_at = now(), reversed_by = v_user_id
  where payment_id = p_payment_id and reversed_at is null;

  -- 10. Recompute each affected due's status from its remaining active
  -- allocations on POSTED payments only -- same rule record_payment uses
  -- to mark PAID/PARTIALLY_PAID, extended with the OVERDUE/ISSUED split
  -- per the approved design (no independent job reclassifies a due once
  -- its payment disappears).
  if v_affected_due_ids is not null then
    foreach v_due_id in array v_affected_due_ids loop
      select d.id, d.amount, d.due_date, d.status into v_due
      from public.dues d
      where d.id = v_due_id;

      if v_due.id is not null and v_due.status <> 'VOID' then
        select coalesce(sum(pa.amount) filter (where pa.reversed_at is null and p2.status = 'POSTED'), 0)
        into v_total_paid
        from public.payment_allocations pa
        join public.payments p2 on p2.id = pa.payment_id
        where pa.due_id = v_due_id;

        if v_total_paid >= v_due.amount then
          v_new_status := 'PAID';
        elsif v_total_paid > 0 then
          v_new_status := 'PARTIALLY_PAID';
        elsif v_due.due_date < v_today then
          v_new_status := 'OVERDUE';
        else
          v_new_status := 'ISSUED';
        end if;

        update public.dues set status = v_new_status where id = v_due_id;
      end if;
    end loop;
  end if;

  -- 11. Reverse the payment itself. unallocated_amount is zeroed: a
  -- reversed payment no longer represents spendable credit.
  update public.payments
  set status = 'REVERSED',
      reversed_at = now(),
      reversed_by = v_user_id,
      reversal_reason = v_reason,
      unallocated_amount = 0
  where id = p_payment_id;

  -- 12. Audit event -- includes the pre-reversal snapshot (original
  -- amount, unallocated amount, and exactly which allocations were
  -- reversed) so the hash-chained record is self-contained even if
  -- someone later reads only the audit log.
  perform public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := 'PAYMENT_REVERSED',
    p_entity_type := 'PAYMENT',
    p_resort_id := v_payment.property_id,
    p_entity_id := p_payment_id,
    p_request_id := null,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object(
      'reason', v_reason,
      'original_amount', v_payment.amount,
      'previous_unallocated_amount', v_payment.unallocated_amount,
      'receipt_no', coalesce(v_payment.receipt_no, v_payment.receipt_number::text),
      'affected_due_ids', to_jsonb(coalesce(v_affected_due_ids, array[]::uuid[])),
      'reversed_allocations', coalesce(v_allocation_snapshot, '[]'::jsonb)
    )
  );

  -- 13/14. Result; commit happens implicitly when the calling transaction
  -- ends (this whole function body already runs inside one).
  return jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'affected_due_count', coalesce(array_length(v_affected_due_ids, 1), 0),
    'affected_due_ids', to_jsonb(coalesce(v_affected_due_ids, array[]::uuid[]))
  );
end;
$$;


ALTER FUNCTION "public"."void_payment"("p_organization_id" "uuid", "p_payment_id" "uuid", "p_reason" "text", "p_ip_address" "inet", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."void_supplier_payment"("p_organization_id" "uuid", "p_payment_id" "uuid", "p_fiscal_period_id" "uuid", "p_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_payment public.supplier_payments;
  v_reason text;
  v_affected_invoice_ids uuid[];
  v_debit_lines jsonb := '[]'::jsonb;
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_invoice_id uuid;
  v_invoice public.supplier_invoices;
  v_paid_so_far numeric(19, 4);
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' using errcode = '42501';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'REASON_REQUIRED: سبب الإلغاء مطلوب' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'REASON_TOO_LONG: سبب الإلغاء طويل جدًا (الحد 1000 حرف)' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('record_supplier_payment_' || p_organization_id::text));

  select * into v_payment from public.supplier_payments where id = p_payment_id and organization_id = p_organization_id for update;
  if v_payment.id is null then
    raise exception 'PAYMENT_NOT_FOUND: الدفعة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_payment.property_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء دفعات الموردين' using errcode = '42501';
  end if;
  -- Explicit and separate from finance.suppliers.void on purpose (see
  -- migration header) -- reversing a posted entry is a posting action.
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.entries.post') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: عكس دفعة مرحّلة يتطلب أيضًا صلاحية ترحيل القيود' using errcode = '42501';
  end if;

  if v_payment.reversed_at is not null then
    raise exception 'ALREADY_REVERSED: هذه الدفعة معكوسة بالفعل بتاريخ %', v_payment.reversed_at using errcode = '22023';
  end if;

  select array_agg(distinct invoice_id) into v_affected_invoice_ids
  from public.supplier_payment_allocations
  where payment_id = p_payment_id and reversed_at is null;

  if v_affected_invoice_ids is not null then
    perform 1 from public.supplier_invoices where id = any(v_affected_invoice_ids) order by id for update;
  end if;

  for v_grouped in
    select si.payable_account_id as account_id, sum(spa.amount) as total
    from public.supplier_payment_allocations spa
    join public.supplier_invoices si on si.id = spa.invoice_id
    where spa.payment_id = p_payment_id and spa.reversed_at is null
    group by si.payable_account_id
  loop
    v_credit_lines := v_credit_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_grouped.account_id, 'debit', 0, 'credit', v_grouped.total)
    );
  end loop;

  v_debit_lines := jsonb_build_array(jsonb_build_object('account_id', v_payment.payment_account_id, 'debit', v_payment.amount, 'credit', 0));

  if v_payment.wht_amount > 0 then
    for v_grouped in
      select si.wht_account_id as account_id,
        sum(round(spa.amount * si.wht_amount / nullif(si.amount, 0), 4)) as total
      from public.supplier_payment_allocations spa
      join public.supplier_invoices si on si.id = spa.invoice_id
      where spa.payment_id = p_payment_id and spa.reversed_at is null and si.wht_amount > 0
      group by si.wht_account_id
    loop
      v_debit_lines := v_debit_lines || jsonb_build_array(
        jsonb_build_object('account_id', v_grouped.account_id, 'debit', v_grouped.total, 'credit', 0)
      );
    end loop;
  end if;

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, v_payment.property_id, p_fiscal_period_id, current_date,
    'Reversal of supplier payment voucher #' || v_payment.voucher_number, 'PAYMENT_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.supplier_payment_allocations
  set reversed_at = now(), reversed_by = auth.uid()
  where payment_id = p_payment_id and reversed_at is null;

  update public.supplier_payments
  set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = v_reason
  where id = p_payment_id;

  if v_affected_invoice_ids is not null then
    foreach v_invoice_id in array v_affected_invoice_ids loop
      select coalesce(sum(spa.amount), 0) into v_paid_so_far
      from public.supplier_payment_allocations spa
      where spa.invoice_id = v_invoice_id and spa.reversed_at is null;

      select * into v_invoice from public.supplier_invoices where id = v_invoice_id;
      if v_invoice.status <> 'CANCELLED' then
        v_new_status := case
          when v_paid_so_far >= v_invoice.amount then 'PAID'
          when v_paid_so_far > 0 then 'PARTIALLY_PAID'
          else 'POSTED'
        end;
        update public.supplier_invoices set status = v_new_status where id = v_invoice_id;
      end if;
    end loop;
  end if;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_payment.property_id, 'supplier_payment.reversed', 'supplier_payment', p_payment_id, v_reason,
    jsonb_build_object('reversal_entry_id', v_entry_id, 'original_amount', v_payment.amount, 'affected_invoice_ids', to_jsonb(coalesce(v_affected_invoice_ids, array[]::uuid[]))));

  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."void_supplier_payment"("p_organization_id" "uuid", "p_payment_id" "uuid", "p_fiscal_period_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "bank_id" "uuid" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_number" "text" NOT NULL,
    "gl_account_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bank_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_statement_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "statement_id" "uuid" NOT NULL,
    "line_date" "date" NOT NULL,
    "description" "text",
    "reference" "text",
    "amount" numeric(19,4) NOT NULL,
    "matched_journal_entry_line_id" "uuid",
    "match_type" "text",
    "matched_at" timestamp with time zone,
    "matched_by" "uuid",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bank_statement_lines_amount_check" CHECK (("amount" <> (0)::numeric)),
    CONSTRAINT "bank_statement_lines_match_coherent" CHECK (((("matched_journal_entry_line_id" IS NULL) AND ("match_type" IS NULL) AND ("matched_at" IS NULL)) OR (("matched_journal_entry_line_id" IS NOT NULL) AND ("match_type" IS NOT NULL) AND ("matched_at" IS NOT NULL)))),
    CONSTRAINT "bank_statement_lines_match_type_check" CHECK (("match_type" = ANY (ARRAY['AUTO'::"text", 'MANUAL'::"text"])))
);


ALTER TABLE "public"."bank_statement_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_statements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "bank_account_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "opening_balance" numeric(19,4) NOT NULL,
    "closing_balance" numeric(19,4) NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "reconciled_at" timestamp with time zone,
    "reconciled_by" "uuid",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bank_statements_period_order" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "bank_statements_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'RECONCILED'::"text"])))
);


ALTER TABLE "public"."bank_statements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."banks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."banks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brokers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "broker_type" "text" DEFAULT 'EXTERNAL'::"text" NOT NULL,
    "tax_id" "text",
    "phone" "text",
    "email" "text",
    "default_wht_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "brokers_broker_type_check" CHECK (("broker_type" = ANY (ARRAY['INTERNAL'::"text", 'EXTERNAL'::"text"]))),
    CONSTRAINT "brokers_default_wht_rate_check" CHECK ((("default_wht_rate" >= (0)::numeric) AND ("default_wht_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."brokers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "fiscal_period_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "amount" numeric(19,4) DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "budgets_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."buildings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "zone_id" "uuid",
    "code" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."buildings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "payment_id" "uuid",
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cash_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "cash_transactions_type_check" CHECK (("type" = ANY (ARRAY['RECEIPT'::"text", 'PAYMENT'::"text"])))
);


ALTER TABLE "public"."cash_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cashboxes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "gl_account_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cashboxes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cashier_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "cashbox_id" "uuid" NOT NULL,
    "opened_by" "uuid" NOT NULL,
    "opening_balance" numeric(19,4) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "expected_closing_balance" numeric(19,4),
    "actual_closing_balance" numeric(19,4),
    "variance" numeric(19,4),
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_by" "uuid",
    "closed_at" timestamp with time zone,
    CONSTRAINT "cashier_sessions_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'CLOSED'::"text", 'RECONCILED'::"text"])))
);


ALTER TABLE "public"."cashier_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalogue_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "unit_code" "text" DEFAULT 'EA'::"text" NOT NULL,
    "item_code_type" "text",
    "item_code" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "catalogue_items_code_pairs_with_type" CHECK (((("item_code" IS NULL) AND ("item_code_type" IS NULL)) OR ((NULLIF("btrim"("item_code"), ''::"text") IS NOT NULL) AND ("item_code_type" IS NOT NULL)))),
    CONSTRAINT "catalogue_items_gs1_shape" CHECK ((("item_code_type" IS DISTINCT FROM 'GS1'::"text") OR ("item_code" ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$'::"text"))),
    CONSTRAINT "catalogue_items_item_code_type_check" CHECK ((("item_code_type" IS NULL) OR ("item_code_type" = ANY (ARRAY['EGS'::"text", 'GS1'::"text"]))))
);


ALTER TABLE "public"."catalogue_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."catalogue_items" IS 'كتالوج الأصناف وأكواد السلطة (EGS/GS1). ETA لا تقبل نصًا حرًا، فالمستند بلا كود صنف غير قابل للإرسال.';



COMMENT ON COLUMN "public"."catalogue_items"."item_code" IS 'كود السلطة. GS1 مفحوص بالطول والأرقام؛ EGS يُقبل غير فارغ دون ادعاء تحقق من بنيته.';



CREATE TABLE IF NOT EXISTS "public"."chart_of_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "code" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "parent_id" "uuid",
    "category" "text" NOT NULL,
    "normal_balance" "text" NOT NULL,
    "is_group" boolean DEFAULT false NOT NULL,
    "requires_cost_center" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_used" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_cash_equivalent" boolean DEFAULT false NOT NULL,
    "cash_flow_section" "text",
    CONSTRAINT "chart_of_accounts_cash_flow_section_check" CHECK (("cash_flow_section" = ANY (ARRAY['OPERATING'::"text", 'INVESTING'::"text", 'FINANCING'::"text"]))),
    CONSTRAINT "chart_of_accounts_category_check" CHECK (("category" = ANY (ARRAY['ASSET'::"text", 'LIABILITY'::"text", 'EQUITY'::"text", 'REVENUE'::"text", 'EXPENSE'::"text"]))),
    CONSTRAINT "chart_of_accounts_normal_balance_check" CHECK (("normal_balance" = ANY (ARRAY['DEBIT'::"text", 'CREDIT'::"text"])))
);


ALTER TABLE "public"."chart_of_accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."chart_of_accounts"."is_cash_equivalent" IS 'Account is cash or a cash equivalent (till, bank, short-term deposit). Defines the "cash" whose movement the cash flow statement explains.';



COMMENT ON COLUMN "public"."chart_of_accounts"."cash_flow_section" IS 'Cash flow activity section this account''s cash effect belongs to. NULL = not yet classified; the statement falls back to OPERATING and flags the row.';



CREATE TABLE IF NOT EXISTS "public"."cheque_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cheque_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text"
);


ALTER TABLE "public"."cheque_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cheques" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "bank_account_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "cheque_number" "text" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "member_id" "uuid",
    "cheque_date" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "status" "text" DEFAULT 'RECEIVED'::"text" NOT NULL,
    "payment_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cheques_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "cheques_direction_check" CHECK (("direction" = ANY (ARRAY['INCOMING'::"text", 'OUTGOING'::"text"]))),
    CONSTRAINT "cheques_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'ISSUED'::"text", 'RECEIVED'::"text", 'DEPOSITED'::"text", 'CLEARED'::"text", 'RETURNED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."cheques" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coa_template_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_key" "text" NOT NULL,
    "sort_order" integer NOT NULL,
    "code" "text" NOT NULL,
    "parent_code" "text",
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "category" "text" NOT NULL,
    "normal_balance" "text" NOT NULL,
    "is_group" boolean DEFAULT false NOT NULL,
    "is_cash_equivalent" boolean DEFAULT false NOT NULL,
    "cash_flow_section" "text",
    CONSTRAINT "coa_template_accounts_cash_flow_section_check" CHECK (("cash_flow_section" = ANY (ARRAY['OPERATING'::"text", 'INVESTING'::"text", 'FINANCING'::"text"]))),
    CONSTRAINT "coa_template_accounts_category_check" CHECK (("category" = ANY (ARRAY['ASSET'::"text", 'LIABILITY'::"text", 'EQUITY'::"text", 'REVENUE'::"text", 'EXPENSE'::"text"]))),
    CONSTRAINT "coa_template_accounts_normal_balance_check" CHECK (("normal_balance" = ANY (ARRAY['DEBIT'::"text", 'CREDIT'::"text"])))
);


ALTER TABLE "public"."coa_template_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coa_templates" (
    "key" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL
);


ALTER TABLE "public"."coa_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "broker_id" "uuid" NOT NULL,
    "unit_id" "uuid",
    "source_type" "text" NOT NULL,
    "lease_id" "uuid",
    "installment_plan_id" "uuid",
    "basis_amount" numeric(19,4) NOT NULL,
    "rate_percent" numeric(6,3),
    "gross_amount" numeric(19,4) NOT NULL,
    "wht_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "wht_amount" numeric(19,4) DEFAULT 0 NOT NULL,
    "net_amount" numeric(19,4) NOT NULL,
    "earned_date" "date" NOT NULL,
    "status" "text" DEFAULT 'ACCRUED'::"text" NOT NULL,
    "accrual_journal_entry_id" "uuid",
    "payment_journal_entry_id" "uuid",
    "paid_date" "date",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "commissions_basis_amount_check" CHECK (("basis_amount" >= (0)::numeric)),
    CONSTRAINT "commissions_gross_amount_check" CHECK (("gross_amount" > (0)::numeric)),
    CONSTRAINT "commissions_net_adds_up" CHECK (("abs"((("gross_amount" - "wht_amount") - "net_amount")) < 0.0005)),
    CONSTRAINT "commissions_net_amount_check" CHECK (("net_amount" >= (0)::numeric)),
    CONSTRAINT "commissions_rate_percent_check" CHECK ((("rate_percent" IS NULL) OR (("rate_percent" >= (0)::numeric) AND ("rate_percent" <= (100)::numeric)))),
    CONSTRAINT "commissions_source_reference" CHECK (((("source_type" = 'LEASE'::"text") AND ("lease_id" IS NOT NULL) AND ("installment_plan_id" IS NULL)) OR (("source_type" = 'INSTALLMENT_PLAN'::"text") AND ("installment_plan_id" IS NOT NULL) AND ("lease_id" IS NULL)) OR (("source_type" = 'MANUAL'::"text") AND ("lease_id" IS NULL) AND ("installment_plan_id" IS NULL)))),
    CONSTRAINT "commissions_source_type_check" CHECK (("source_type" = ANY (ARRAY['LEASE'::"text", 'INSTALLMENT_PLAN'::"text", 'MANUAL'::"text"]))),
    CONSTRAINT "commissions_status_check" CHECK (("status" = ANY (ARRAY['ACCRUED'::"text", 'PAID'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "commissions_wht_amount_check" CHECK (("wht_amount" >= (0)::numeric)),
    CONSTRAINT "commissions_wht_rate_check" CHECK ((("wht_rate" >= (0)::numeric) AND ("wht_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."commissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'NEW'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_requests_status_check" CHECK (("status" = ANY (ARRAY['NEW'::"text", 'CONTACTED'::"text", 'CLOSED'::"text"])))
);


ALTER TABLE "public"."contact_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cost_centers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "code" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cost_centers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "document_type" "text" DEFAULT 'CREDIT_NOTE'::"text" NOT NULL,
    "document_number" "text" NOT NULL,
    "source_type" "text" DEFAULT 'DUE'::"text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "tax_decision_id" "uuid" NOT NULL,
    "credit_date" "date" NOT NULL,
    "gross_amount" numeric(19,4) NOT NULL,
    "taxable_base" numeric(19,4) NOT NULL,
    "vat_amount" numeric(19,4) NOT NULL,
    "reason" "text" NOT NULL,
    "journal_entry_id" "uuid",
    "decision_snapshot" "jsonb" NOT NULL,
    "issued_by" "uuid",
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credit_note_amounts_add_up" CHECK (("gross_amount" = ("taxable_base" + "vat_amount"))),
    CONSTRAINT "credit_note_reason_present" CHECK ((NULLIF("btrim"("reason"), ''::"text") IS NOT NULL)),
    CONSTRAINT "credit_notes_document_type_check" CHECK (("document_type" = ANY (ARRAY['CREDIT_NOTE'::"text", 'DEBIT_NOTE'::"text"]))),
    CONSTRAINT "credit_notes_gross_amount_check" CHECK (("gross_amount" > (0)::numeric)),
    CONSTRAINT "credit_notes_source_type_check" CHECK (("source_type" = 'DUE'::"text")),
    CONSTRAINT "credit_notes_vat_amount_check" CHECK (("vat_amount" >= (0)::numeric))
);


ALTER TABLE "public"."credit_notes" OWNER TO "postgres";


COMMENT ON TABLE "public"."credit_notes" IS 'إشعار خصم/إضافة يصحّح مستندًا صادرًا. ليس فاتورة سالبة: يشير إلى أصله، ولا يتجاوز إجماليه، ويعكس معالجته الضريبية بقاعدتها الأصلية.';



CREATE TABLE IF NOT EXISTS "public"."demo_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "company" "text",
    "role_title" "text",
    "organization_name" "text",
    "units_count" integer,
    "gates_count" integer,
    "email" "text" NOT NULL,
    "phone" "text",
    "preferred_contact_method" "text",
    "message" "text",
    "status" "text" DEFAULT 'NEW'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "demo_leads_preferred_contact_method_check" CHECK (("preferred_contact_method" = ANY (ARRAY['email'::"text", 'phone'::"text"]))),
    CONSTRAINT "demo_leads_status_check" CHECK (("status" = ANY (ARRAY['NEW'::"text", 'CONTACTED'::"text", 'QUALIFIED'::"text", 'CLOSED'::"text"])))
);


ALTER TABLE "public"."demo_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_number_counters" (
    "organization_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "year" integer NOT NULL,
    "next_number" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "document_number_counters_document_type_check" CHECK (("document_type" = ANY (ARRAY['INVOICE'::"text", 'RECEIPT'::"text", 'CREDIT_NOTE'::"text", 'DEBIT_NOTE'::"text"]))),
    CONSTRAINT "document_number_counters_next_number_check" CHECK (("next_number" >= 1))
);


ALTER TABLE "public"."document_number_counters" OWNER TO "postgres";


COMMENT ON TABLE "public"."document_number_counters" IS 'عدّاد ترقيم المستندات لكل مؤسسة ونوع وسنة. يُقفل الصف داخل المعاملة، فالتراجع يعيد الرقم ولا يترك فجوة.';



CREATE TABLE IF NOT EXISTS "public"."document_numbers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "document_type" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "sequence_number" integer NOT NULL,
    "document_number" "text" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_numbers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_sequences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "sequence_type" "text" NOT NULL,
    "next_value" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."document_sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."due_generation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "period" "text" NOT NULL,
    "generated_units_count" integer DEFAULT 0 NOT NULL,
    "total_amount" numeric(19,4) DEFAULT 0 NOT NULL,
    "generated_by" "uuid",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."due_generation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."due_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description_ar" "text",
    "description_en" "text",
    "due_type_id" "uuid" NOT NULL,
    "receivable_account_id" "uuid" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "amount_by_unit_type" "jsonb",
    "frequency" "text" NOT NULL,
    "day_of_month" integer DEFAULT 1 NOT NULL,
    "month_of_year" integer,
    "scope" "jsonb" DEFAULT '{"all": true}'::"jsonb" NOT NULL,
    "due_offset_days" integer DEFAULT 15 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "due_schedules_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "due_schedules_day_of_month_check" CHECK ((("day_of_month" >= 1) AND ("day_of_month" <= 31))),
    CONSTRAINT "due_schedules_due_offset_days_check" CHECK (("due_offset_days" >= 0)),
    CONSTRAINT "due_schedules_frequency_check" CHECK (("frequency" = ANY (ARRAY['MONTHLY'::"text", 'YEARLY'::"text"]))),
    CONSTRAINT "due_schedules_month_of_year_check" CHECK ((("month_of_year" IS NULL) OR (("month_of_year" >= 1) AND ("month_of_year" <= 12))))
);


ALTER TABLE "public"."due_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."due_type_revenue_natures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "due_type_id" "uuid" NOT NULL,
    "revenue_nature" "text" NOT NULL,
    "status" "text" DEFAULT 'REVIEW_REQUIRED'::"text" NOT NULL,
    "notes" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "amount_basis" "text",
    CONSTRAINT "due_type_nature_approved_has_approver" CHECK (((("status" = 'REVIEW_REQUIRED'::"text") AND ("approved_by" IS NULL) AND ("approved_at" IS NULL)) OR (("status" = 'APPROVED'::"text") AND ("approved_by" IS NOT NULL) AND ("approved_at" IS NOT NULL)))),
    CONSTRAINT "due_type_revenue_natures_amount_basis_check" CHECK ((("amount_basis" IS NULL) OR ("amount_basis" = ANY (ARRAY['NET'::"text", 'GROSS'::"text"])))),
    CONSTRAINT "due_type_revenue_natures_status_check" CHECK (("status" = ANY (ARRAY['REVIEW_REQUIRED'::"text", 'APPROVED'::"text"])))
);


ALTER TABLE "public"."due_type_revenue_natures" OWNER TO "postgres";


COMMENT ON TABLE "public"."due_type_revenue_natures" IS 'ربط صريح لكل مستأجر بين نوع المستحق النصي الحر وطبيعة الإيراد. غياب الصف = REVIEW_REQUIRED. لا يُشتق من الاسم إطلاقًا.';



COMMENT ON COLUMN "public"."due_type_revenue_natures"."amount_basis" IS 'هل مبلغ المستحق صافٍ تُضاف الضريبة فوقه (NET) أم شامل تُستخرج منه (GROSS)؟ إلزامي للمعالجة الخاضعة، ولا يُخمَّن.';



CREATE TABLE IF NOT EXISTS "public"."due_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "default_revenue_account_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "catalogue_item_id" "uuid"
);


ALTER TABLE "public"."due_types" OWNER TO "postgres";


COMMENT ON COLUMN "public"."due_types"."catalogue_item_id" IS 'الصنف الذي يمثله نوع المستحق في المستند الإلكتروني. الربط صريح — لا يُشتق من الاسم كما لا تُشتق طبيعة الإيراد.';



CREATE TABLE IF NOT EXISTS "public"."dues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "due_type_id" "uuid" NOT NULL,
    "receivable_account_id" "uuid" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "issue_date" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'ISSUED'::"text" NOT NULL,
    "journal_entry_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_type" "text",
    "source_id" "uuid",
    CONSTRAINT "dues_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "dues_check" CHECK (("due_date" >= "issue_date")),
    CONSTRAINT "dues_source_type_check" CHECK (("source_type" = ANY (ARRAY['LEASE_RENT'::"text", 'INSTALLMENT_PLAN'::"text"]))),
    CONSTRAINT "dues_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'ISSUED'::"text", 'PARTIALLY_PAID'::"text", 'PAID'::"text", 'OVERDUE'::"text", 'VOID'::"text"])))
);


ALTER TABLE "public"."dues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dunning_notices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "due_id" "uuid" NOT NULL,
    "member_id" "uuid",
    "stage" smallint NOT NULL,
    "raised_on" "date" NOT NULL,
    "days_overdue" integer NOT NULL,
    "outstanding_amount" numeric(19,4) NOT NULL,
    "status" "text" DEFAULT 'RAISED'::"text" NOT NULL,
    "delivered_at" timestamp with time zone,
    "delivery_channel" "text",
    "delivery_reference" "text",
    "raised_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dunning_notices_channel_check" CHECK ((("delivery_channel" IS NULL) OR ("delivery_channel" = ANY (ARRAY['PRINTED'::"text", 'HAND_DELIVERED'::"text", 'PHONE'::"text", 'EMAIL_EXTERNAL'::"text", 'WHATSAPP_EXTERNAL'::"text", 'POST'::"text"])))),
    CONSTRAINT "dunning_notices_delivery_consistent" CHECK (((("status" = 'DELIVERED'::"text") AND ("delivered_at" IS NOT NULL) AND ("delivery_channel" IS NOT NULL)) OR (("status" <> 'DELIVERED'::"text") AND ("delivered_at" IS NULL)))),
    CONSTRAINT "dunning_notices_status_check" CHECK (("status" = ANY (ARRAY['RAISED'::"text", 'DELIVERED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."dunning_notices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dunning_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "stage" smallint NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "days_overdue" integer NOT NULL,
    "minimum_amount" numeric(19,4) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dunning_policies_days_positive" CHECK (("days_overdue" >= 0)),
    CONSTRAINT "dunning_policies_minimum_positive" CHECK (("minimum_amount" >= (0)::numeric)),
    CONSTRAINT "dunning_policies_stage_positive" CHECK (("stage" > 0))
);


ALTER TABLE "public"."dunning_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."einvoice_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "document_type" "text" DEFAULT 'INVOICE'::"text" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "authority_status" "text",
    "authority_uuid" "text",
    "authority_long_id" "text",
    "qr_payload" "text",
    "idempotency_key" "text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_error_code" "text",
    "last_error_detail" "text",
    "submitted_at" timestamp with time zone,
    "settled_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "einvoice_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['INVOICE'::"text", 'CREDIT_NOTE'::"text", 'DEBIT_NOTE'::"text", 'RECEIPT'::"text"]))),
    CONSTRAINT "einvoice_documents_settled_has_time" CHECK ((("status" <> ALL (ARRAY['ACCEPTED'::"text", 'REJECTED'::"text", 'CANCELLED'::"text"])) OR ("settled_at" IS NOT NULL))),
    CONSTRAINT "einvoice_documents_source_type_check" CHECK (("source_type" = ANY (ARRAY['SUPPLIER_INVOICE'::"text", 'PAYMENT_RECEIPT'::"text", 'DUE'::"text", 'CREDIT_NOTE'::"text", 'DEBIT_NOTE'::"text"]))),
    CONSTRAINT "einvoice_documents_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'SIGNED'::"text", 'SUBMITTED'::"text", 'ACCEPTED'::"text", 'REJECTED'::"text", 'CANCELLED'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."einvoice_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."einvoice_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "jurisdiction" "text" NOT NULL,
    "environment" "text" DEFAULT 'SANDBOX'::"text" NOT NULL,
    "taxpayer_id" "text",
    "branch_code" "text",
    "activity_code" "text",
    "client_id_secret_id" "uuid",
    "client_secret_secret_id" "uuid",
    "signing_certificate_secret_id" "uuid",
    "signing_key_secret_id" "uuid",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "verified_at" timestamp with time zone,
    "last_verification_error" "text",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "einvoice_profiles_environment_check" CHECK (("environment" = ANY (ARRAY['SANDBOX'::"text", 'PRODUCTION'::"text"]))),
    CONSTRAINT "einvoice_profiles_jurisdiction_check" CHECK (("jurisdiction" = ANY (ARRAY['EG_ETA'::"text", 'SA_ZATCA'::"text", 'AE_PEPPOL'::"text"]))),
    CONSTRAINT "einvoice_profiles_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'ACTIVE'::"text", 'SUSPENDED'::"text"])))
);


ALTER TABLE "public"."einvoice_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."einvoice_submission_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "attempt_number" integer NOT NULL,
    "operation" "text" NOT NULL,
    "http_status" integer,
    "authority_status" "text",
    "resulting_status" "text",
    "request_summary" "jsonb",
    "response_summary" "jsonb",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "einvoice_submission_attempts_operation_check" CHECK (("operation" = ANY (ARRAY['SUBMIT'::"text", 'POLL'::"text", 'CANCEL'::"text"])))
);


ALTER TABLE "public"."einvoice_submission_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exchange_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "foreign_currency" "text" NOT NULL,
    "base_currency" "text" NOT NULL,
    "rate_date" "date" NOT NULL,
    "base_per_unit" numeric(18,8) NOT NULL,
    "source" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exchange_rates_distinct" CHECK (("foreign_currency" <> "base_currency")),
    CONSTRAINT "exchange_rates_iso" CHECK ((("foreign_currency" ~ '^[A-Z]{3}$'::"text") AND ("base_currency" ~ '^[A-Z]{3}$'::"text"))),
    CONSTRAINT "exchange_rates_positive" CHECK (("base_per_unit" > (0)::numeric))
);


ALTER TABLE "public"."exchange_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_account_input_tax" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "expense_account_id" "uuid" NOT NULL,
    "recoverability" "text" NOT NULL,
    "recoverable_ratio" numeric(7,4),
    "ratio_method" "text",
    "ratio_period" "text",
    "ratio_reference" "text",
    "status" "text" DEFAULT 'REVIEW_REQUIRED'::"text" NOT NULL,
    "notes" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expense_account_input_tax_approved_has_approver" CHECK (((("status" = 'REVIEW_REQUIRED'::"text") AND ("approved_by" IS NULL) AND ("approved_at" IS NULL)) OR (("status" = 'APPROVED'::"text") AND ("approved_by" IS NOT NULL) AND ("approved_at" IS NOT NULL)))),
    CONSTRAINT "expense_account_input_tax_mixed_is_documented" CHECK ((("recoverability" <> 'MIXED'::"text") OR (("recoverable_ratio" IS NOT NULL) AND (NULLIF("btrim"(COALESCE("ratio_method", ''::"text")), ''::"text") IS NOT NULL) AND (NULLIF("btrim"(COALESCE("ratio_period", ''::"text")), ''::"text") IS NOT NULL)))),
    CONSTRAINT "expense_account_input_tax_ratio_scope" CHECK ((("recoverability" = 'MIXED'::"text") OR ("recoverable_ratio" IS NULL))),
    CONSTRAINT "expense_account_input_tax_recoverability_check" CHECK (("recoverability" = ANY (ARRAY['FULLY_RECOVERABLE'::"text", 'NON_RECOVERABLE'::"text", 'MIXED'::"text"]))),
    CONSTRAINT "expense_account_input_tax_recoverable_ratio_check" CHECK ((("recoverable_ratio" IS NULL) OR (("recoverable_ratio" >= (0)::numeric) AND ("recoverable_ratio" <= (1)::numeric)))),
    CONSTRAINT "expense_account_input_tax_status_check" CHECK (("status" = ANY (ARRAY['REVIEW_REQUIRED'::"text", 'APPROVED'::"text"])))
);


ALTER TABLE "public"."expense_account_input_tax" OWNER TO "postgres";


COMMENT ON TABLE "public"."expense_account_input_tax" IS 'إعلان قابلية خصم ضريبة المدخلات لكل حساب مصروف. غياب الصف = غير معلن = لا استرداد. لا نسبة افتراضية صامتة.';



CREATE TABLE IF NOT EXISTS "public"."expense_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "default_expense_account_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."expense_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "expense_category_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "expense_date" "date" NOT NULL,
    "payment_account_id" "uuid" NOT NULL,
    "voucher_number" bigint,
    "journal_entry_id" "uuid",
    "cashier_session_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expenses_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "request_id" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "inet",
    "user_agent" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "previous_hash" "text",
    "event_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_audit_action" CHECK (("action" = ANY (ARRAY['PAYMENT_CREATED'::"text", 'PAYMENT_IDEMPOTENT_REPLAY'::"text", 'PAYMENT_ALLOCATION_CREATED'::"text", 'DUE_ISSUED'::"text", 'DUE_BATCH_ISSUED'::"text", 'RECURRING_DUES_GENERATED'::"text", 'RECURRING_DUES_SKIPPED'::"text", 'OPERATION_REJECTED'::"text", 'LEASE_RENT_DUE_GENERATED'::"text", 'LEASE_RENT_DUE_SKIPPED'::"text"])))
);


ALTER TABLE "public"."financial_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fiscal_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "fiscal_year_id" "uuid" NOT NULL,
    "period_number" integer NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'PLANNED'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fiscal_periods_check" CHECK (("end_date" > "start_date")),
    CONSTRAINT "fiscal_periods_status_check" CHECK (("status" = ANY (ARRAY['PLANNED'::"text", 'OPEN'::"text", 'CLOSED'::"text", 'LOCKED'::"text"])))
);


ALTER TABLE "public"."fiscal_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fiscal_years" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'PLANNED'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fiscal_years_check" CHECK (("end_date" > "start_date")),
    CONSTRAINT "fiscal_years_status_check" CHECK (("status" = ANY (ARRAY['PLANNED'::"text", 'OPEN'::"text", 'CLOSED'::"text", 'LOCKED'::"text"])))
);


ALTER TABLE "public"."fiscal_years" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fixed_asset_depreciation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "fixed_asset_id" "uuid" NOT NULL,
    "fiscal_period_id" "uuid" NOT NULL,
    "entry_date" "date" NOT NULL,
    "amount" numeric(18,4) NOT NULL,
    "journal_entry_id" "uuid",
    "posted_by" "uuid",
    "posted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fad_amount_positive" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."fixed_asset_depreciation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fixed_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "code" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "asset_account_id" "uuid" NOT NULL,
    "accumulated_depreciation_account_id" "uuid" NOT NULL,
    "depreciation_expense_account_id" "uuid" NOT NULL,
    "acquisition_date" "date" NOT NULL,
    "acquisition_cost" numeric(18,4) NOT NULL,
    "salvage_value" numeric(18,4) DEFAULT 0 NOT NULL,
    "useful_life_months" integer NOT NULL,
    "method" "text" DEFAULT 'STRAIGHT_LINE'::"text" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "disposal_date" "date",
    "disposal_proceeds" numeric(18,4),
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fixed_assets_cost_positive" CHECK (("acquisition_cost" > (0)::numeric)),
    CONSTRAINT "fixed_assets_disposal_consistent" CHECK (((("status" = 'DISPOSED'::"text") AND ("disposal_date" IS NOT NULL)) OR (("status" <> 'DISPOSED'::"text") AND ("disposal_date" IS NULL)))),
    CONSTRAINT "fixed_assets_life_positive" CHECK (("useful_life_months" > 0)),
    CONSTRAINT "fixed_assets_method_check" CHECK (("method" = 'STRAIGHT_LINE'::"text")),
    CONSTRAINT "fixed_assets_salvage_below_cost" CHECK ((("salvage_value" >= (0)::numeric) AND ("salvage_value" < "acquisition_cost"))),
    CONSTRAINT "fixed_assets_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'FULLY_DEPRECIATED'::"text", 'DISPOSED'::"text"])))
);


ALTER TABLE "public"."fixed_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."input_tax_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "expense_account_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "invoice_date" "date" NOT NULL,
    "supply_date" "date",
    "gross_amount" numeric(19,4) NOT NULL,
    "taxable_base" numeric(19,4) NOT NULL,
    "tax_amount" numeric(19,4) NOT NULL,
    "recoverability" "text" NOT NULL,
    "recoverable_ratio" numeric(7,4),
    "recoverable_amount" numeric(19,4) NOT NULL,
    "non_recoverable_amount" numeric(19,4) NOT NULL,
    "input_tax_account_id" "uuid",
    "decision_snapshot" "jsonb" NOT NULL,
    "reverses_decision_id" "uuid",
    "replaces_decision_id" "uuid",
    "reason" "text",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "input_tax_account_only_when_recoverable" CHECK (((("recoverable_amount" > (0)::numeric) AND ("input_tax_account_id" IS NOT NULL)) OR (("recoverable_amount" = (0)::numeric) AND ("input_tax_account_id" IS NULL)))),
    CONSTRAINT "input_tax_base_plus_tax" CHECK (("gross_amount" = ("taxable_base" + "tax_amount"))),
    CONSTRAINT "input_tax_decisions_recoverability_check" CHECK (("recoverability" = ANY (ARRAY['FULLY_RECOVERABLE'::"text", 'NON_RECOVERABLE'::"text", 'MIXED'::"text"]))),
    CONSTRAINT "input_tax_decisions_source_type_check" CHECK (("source_type" = 'SUPPLIER_INVOICE'::"text")),
    CONSTRAINT "input_tax_not_both_links" CHECK ((("reverses_decision_id" IS NULL) OR ("replaces_decision_id" IS NULL))),
    CONSTRAINT "input_tax_reversal_has_reason" CHECK ((("reverses_decision_id" IS NULL) OR (NULLIF("btrim"("reason"), ''::"text") IS NOT NULL))),
    CONSTRAINT "input_tax_split_exhausts_tax" CHECK (((("recoverable_amount" + "non_recoverable_amount") = "tax_amount") AND ("recoverable_amount" >= (0)::numeric) AND ("non_recoverable_amount" >= (0)::numeric)))
);


ALTER TABLE "public"."input_tax_decisions" OWNER TO "postgres";


COMMENT ON TABLE "public"."input_tax_decisions" IS 'قرار ضريبة المدخلات لكل فاتورة مورد. غير قابل للتعديل — التصحيح بقيد عكسي كقرارات المخرجات.';



CREATE TABLE IF NOT EXISTS "public"."installment_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "buyer_member_id" "uuid" NOT NULL,
    "due_type_id" "uuid" NOT NULL,
    "receivable_account_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "total_price" numeric(19,4) NOT NULL,
    "down_payment" numeric(19,4) DEFAULT 0 NOT NULL,
    "installment_count" integer NOT NULL,
    "installment_frequency" "text" NOT NULL,
    "starts_on" "date" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cancelled_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancel_reason" "text",
    CONSTRAINT "installment_plans_check" CHECK (("down_payment" <= "total_price")),
    CONSTRAINT "installment_plans_check1" CHECK ((("cancelled_at" IS NULL) = ("cancelled_by" IS NULL))),
    CONSTRAINT "installment_plans_check2" CHECK ((("status" <> 'CANCELLED'::"text") OR (("cancel_reason" IS NOT NULL) AND (TRIM(BOTH FROM "cancel_reason") <> ''::"text")))),
    CONSTRAINT "installment_plans_down_payment_check" CHECK (("down_payment" >= (0)::numeric)),
    CONSTRAINT "installment_plans_installment_count_check" CHECK (("installment_count" > 0)),
    CONSTRAINT "installment_plans_installment_frequency_check" CHECK (("installment_frequency" = ANY (ARRAY['MONTHLY'::"text", 'QUARTERLY'::"text", 'YEARLY'::"text"]))),
    CONSTRAINT "installment_plans_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'COMPLETED'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "installment_plans_total_price_check" CHECK (("total_price" > (0)::numeric))
);


ALTER TABLE "public"."installment_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entry_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "journal_entry_id" "uuid" NOT NULL,
    "line_number" integer NOT NULL,
    "account_id" "uuid" NOT NULL,
    "description" "text",
    "debit" numeric(19,4) DEFAULT 0 NOT NULL,
    "credit" numeric(19,4) DEFAULT 0 NOT NULL,
    "cost_center_id" "uuid",
    "project_id" "uuid",
    CONSTRAINT "journal_entry_lines_check" CHECK ((("debit" >= (0)::numeric) AND ("credit" >= (0)::numeric))),
    CONSTRAINT "journal_entry_lines_check1" CHECK ((NOT (("debit" > (0)::numeric) AND ("credit" > (0)::numeric)))),
    CONSTRAINT "journal_entry_lines_check2" CHECK ((("debit" > (0)::numeric) OR ("credit" > (0)::numeric)))
);


ALTER TABLE "public"."journal_entry_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lease_rent_generation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "lease_id" "uuid" NOT NULL,
    "period" "text" NOT NULL,
    "due_id" "uuid",
    "generated_by" "uuid",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lease_rent_generation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "type" "text" NOT NULL,
    "body" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "member_activity_log_type_check" CHECK (("type" = ANY (ARRAY['note'::"text", 'call'::"text", 'whatsapp_reminder'::"text", 'email_reminder'::"text"])))
);


ALTER TABLE "public"."member_activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" bigint,
    "mime_type" "text",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."member_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_invitation_short_links" (
    "slug" "text" NOT NULL,
    "invitation_id" "uuid" NOT NULL,
    "action_link" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."member_invitation_short_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "accepted_at" timestamp with time zone,
    "accepted_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "member_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."member_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_phones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "phone_number" "text" NOT NULL,
    "normalized_phone" "text" NOT NULL,
    "label" "text" DEFAULT 'PERSONAL'::"text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "can_receive_whatsapp" boolean DEFAULT false NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "member_phones_label_check" CHECK (("label" = ANY (ARRAY['PERSONAL'::"text", 'WORK'::"text", 'WHATSAPP'::"text", 'HOME'::"text", 'OTHER'::"text"])))
);


ALTER TABLE "public"."member_phones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_saved_filters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "name" "text" NOT NULL,
    "query" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."member_saved_filters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_tag_assignments" (
    "member_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."member_tag_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."member_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."member_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "full_name" "text" NOT NULL,
    "is_company" boolean DEFAULT false NOT NULL,
    "email" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "user_id" "uuid",
    "customer_type" "text" DEFAULT 'UNRESOLVED'::"text" NOT NULL,
    "tax_registration_number" "text",
    "identity_document_type" "text",
    "identity_document_number" "text",
    "legal_name" "text",
    "country_code" "text",
    "billing_address" "text",
    "identity_verified_at" timestamp with time zone,
    "identity_verification_source" "text",
    "identity_verification_reference" "text",
    CONSTRAINT "members_customer_type_check" CHECK (("customer_type" = ANY (ARRAY['B2B'::"text", 'B2C'::"text", 'UNRESOLVED'::"text"]))),
    CONSTRAINT "members_identity_document_type_check" CHECK ((("identity_document_type" IS NULL) OR ("identity_document_type" = ANY (ARRAY['NATIONAL_ID'::"text", 'PASSPORT'::"text"]))))
);


ALTER TABLE "public"."members" OWNER TO "postgres";


COMMENT ON COLUMN "public"."members"."customer_type" IS 'تصنيف المشتري صراحةً. لا يُستنتج من is_company ولا من الاسم — والافتراضي UNRESOLVED لأن «لا نعرف» حالة حقيقية لا فراغ.';



COMMENT ON COLUMN "public"."members"."identity_document_number" IS 'رقم قومي أو جواز عند لزومه للحد المالي. لا تُحفظ صور المستندات، ولا يُطلب الرقم لمجرد إمكانية طلبه.';



COMMENT ON COLUMN "public"."members"."identity_verified_at" IS 'نتيجة تحقق مخزَّنة بمصدرها ومرجعها. لا يُشترط تحقق خارجي بعد — لم تُصمَّم بعد سياسة الصلاحية والفشل المؤقت.';



CREATE TABLE IF NOT EXISTS "public"."payment_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "due_id" "uuid" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "reversed_at" timestamp with time zone,
    "reversed_by" "uuid",
    CONSTRAINT "payment_allocations_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "payment_allocations_reversed_at_by_together" CHECK ((("reversed_at" IS NULL) = ("reversed_by" IS NULL)))
);


ALTER TABLE "public"."payment_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "member_id" "uuid",
    "unit_id" "uuid",
    "amount" numeric(19,4) NOT NULL,
    "method" "text" NOT NULL,
    "payment_date" "date" NOT NULL,
    "receipt_number" bigint,
    "deposit_account_id" "uuid",
    "journal_entry_id" "uuid",
    "status" "text" DEFAULT 'POSTED'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idempotency_key" "text",
    "memo" "text",
    "unallocated_amount" numeric(19,4) DEFAULT 0 NOT NULL,
    "receipt_no" "text",
    "reversed_at" timestamp with time zone,
    "reversed_by" "uuid",
    "reversal_reason" "text",
    CONSTRAINT "payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "payments_method_check" CHECK (("method" = ANY (ARRAY['CASH'::"text", 'BANK_TRANSFER'::"text", 'CHEQUE'::"text", 'OTHER'::"text", 'ONLINE'::"text"]))),
    CONSTRAINT "payments_reversal_reason_length" CHECK ((("reversal_reason" IS NULL) OR ("char_length"("reversal_reason") <= 1000))),
    CONSTRAINT "payments_reversal_reason_required" CHECK ((("status" <> 'REVERSED'::"text") OR (("reversal_reason" IS NOT NULL) AND (TRIM(BOTH FROM "reversal_reason") <> ''::"text")))),
    CONSTRAINT "payments_reversed_at_by_together" CHECK ((("reversed_at" IS NULL) = ("reversed_by" IS NULL))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['POSTED'::"text", 'REVERSED'::"text"]))),
    CONSTRAINT "payments_unallocated_amount_check" CHECK (("unallocated_amount" >= (0)::numeric))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unit_ownerships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "share_percentage" numeric(5,2) DEFAULT 100 NOT NULL,
    "is_primary_contact" boolean DEFAULT true NOT NULL,
    "start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "end_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "unit_ownerships_check" CHECK ((("end_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "unit_ownerships_share_percentage_check" CHECK ((("share_percentage" > (0)::numeric) AND ("share_percentage" <= (100)::numeric)))
);


ALTER TABLE "public"."unit_ownerships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "building_id" "uuid",
    "zone_id" "uuid",
    "code" "text" NOT NULL,
    "unit_type" "text" DEFAULT 'VILLA'::"text" NOT NULL,
    "floor_number" integer,
    "area" numeric(10,2),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "custom_type_label" "text",
    "created_by" "uuid",
    "archived_at" timestamp with time zone,
    "archived_by" "uuid",
    "handed_over_at" "date",
    CONSTRAINT "units_unit_type_check" CHECK (("unit_type" = ANY (ARRAY['VILLA'::"text", 'CHALET'::"text", 'APARTMENT'::"text", 'SHOP'::"text", 'OFFICE'::"text", 'SERVICE'::"text", 'OTHER'::"text"])))
);


ALTER TABLE "public"."units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."zones" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."units_with_financials" WITH ("security_invoker"='true') AS
 WITH "due_totals" AS (
         SELECT "d"."unit_id",
            "sum"("d"."amount") AS "total_due"
           FROM "public"."dues" "d"
          WHERE ("d"."status" <> 'VOID'::"text")
          GROUP BY "d"."unit_id"
        ), "paid_totals" AS (
         SELECT "d"."unit_id",
            "sum"("pa"."amount") AS "total_paid"
           FROM (("public"."payment_allocations" "pa"
             JOIN "public"."payments" "p" ON (("p"."id" = "pa"."payment_id")))
             JOIN "public"."dues" "d" ON (("d"."id" = "pa"."due_id")))
          WHERE ("p"."status" = 'POSTED'::"text")
          GROUP BY "d"."unit_id"
        ), "current_owner" AS (
         SELECT DISTINCT ON ("uo"."unit_id") "uo"."unit_id",
            "uo"."member_id" AS "owner_id",
            "m"."full_name" AS "owner_name",
            "m"."phone" AS "owner_phone"
           FROM ("public"."unit_ownerships" "uo"
             JOIN "public"."members" "m" ON (("m"."id" = "uo"."member_id")))
          WHERE (("uo"."end_date" IS NULL) OR ("uo"."end_date" >= CURRENT_DATE))
          ORDER BY "uo"."unit_id", "uo"."is_primary_contact" DESC, "uo"."share_percentage" DESC, "uo"."start_date" DESC
        )
 SELECT "u"."id",
    "u"."organization_id",
    "u"."property_id",
    "u"."building_id",
    "u"."zone_id",
    "u"."code",
    "u"."unit_type",
    "u"."floor_number",
    "u"."area",
    "u"."is_active",
    "b"."name_ar" AS "building_name_ar",
    "b"."name_en" AS "building_name_en",
    "z"."name_ar" AS "zone_name_ar",
    "z"."name_en" AS "zone_name_en",
    "co"."owner_id",
    "co"."owner_name",
        CASE
            WHEN ("co"."owner_id" IS NOT NULL) THEN 'OCCUPIED'::"text"
            ELSE 'VACANT'::"text"
        END AS "occupancy_status",
    (COALESCE("dt"."total_due", (0)::numeric))::numeric(19,4) AS "total_due",
    (COALESCE("pt"."total_paid", (0)::numeric))::numeric(19,4) AS "total_paid",
    ((COALESCE("dt"."total_due", (0)::numeric) - COALESCE("pt"."total_paid", (0)::numeric)))::numeric(19,4) AS "balance",
    ((COALESCE("dt"."total_due", (0)::numeric) - COALESCE("pt"."total_paid", (0)::numeric)) > (0)::numeric) AS "has_arrears",
    "u"."custom_type_label",
    "co"."owner_phone",
    "u"."archived_at"
   FROM ((((("public"."units" "u"
     LEFT JOIN "public"."buildings" "b" ON (("b"."id" = "u"."building_id")))
     LEFT JOIN "public"."zones" "z" ON (("z"."id" = "u"."zone_id")))
     LEFT JOIN "due_totals" "dt" ON (("dt"."unit_id" = "u"."id")))
     LEFT JOIN "paid_totals" "pt" ON (("pt"."unit_id" = "u"."id")))
     LEFT JOIN "current_owner" "co" ON (("co"."unit_id" = "u"."id")));


ALTER VIEW "public"."units_with_financials" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."members_with_financials" WITH ("security_invoker"='true') AS
 WITH "active_ownerships" AS (
         SELECT "uo"."member_id",
            "uo"."unit_id"
           FROM "public"."unit_ownerships" "uo"
          WHERE (("uo"."end_date" IS NULL) OR ("uo"."end_date" >= CURRENT_DATE))
        ), "member_aggregates" AS (
         SELECT "ao"."member_id",
            "count"(*) AS "units_count",
            "sum"("uwf"."balance") AS "total_balance"
           FROM ("active_ownerships" "ao"
             JOIN "public"."units_with_financials" "uwf" ON (("uwf"."id" = "ao"."unit_id")))
          GROUP BY "ao"."member_id"
        ), "last_payment" AS (
         SELECT DISTINCT ON ("p"."member_id") "p"."member_id",
            "p"."amount" AS "last_payment_amount",
            "p"."payment_date" AS "last_payment_date"
           FROM "public"."payments" "p"
          WHERE (("p"."status" = 'POSTED'::"text") AND ("p"."member_id" IS NOT NULL))
          ORDER BY "p"."member_id", "p"."payment_date" DESC, "p"."created_at" DESC
        )
 SELECT "m"."id",
    "m"."organization_id",
    "m"."full_name",
    "m"."is_company",
    "m"."email",
    "m"."phone",
    COALESCE("ma"."units_count", (0)::bigint) AS "units_count",
    (COALESCE("ma"."total_balance", (0)::numeric))::numeric(19,4) AS "total_balance",
    (COALESCE("ma"."total_balance", (0)::numeric) > (0)::numeric) AS "has_arrears",
    "lp"."last_payment_amount",
    "lp"."last_payment_date"
   FROM (("public"."members" "m"
     LEFT JOIN "member_aggregates" "ma" ON (("ma"."member_id" = "m"."id")))
     LEFT JOIN "last_payment" "lp" ON (("lp"."member_id" = "m"."id")));


ALTER VIEW "public"."members_with_financials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."online_payment_transaction_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_id" "uuid" NOT NULL,
    "due_id" "uuid" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "online_payment_transaction_allocations_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."online_payment_transaction_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."online_payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "client_request_id" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_reference" "text",
    "provider_payload" "jsonb",
    "amount" numeric(19,4) NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "failure_code" "text",
    "failure_message" "text",
    "payment_id" "uuid",
    "webhook_event_id" "text",
    "webhook_received_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "online_payment_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "online_payment_transactions_provider_check" CHECK (("provider" = ANY (ARRAY['PAYMOB'::"text", 'FAWRY'::"text"]))),
    CONSTRAINT "online_payment_transactions_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'PAID'::"text", 'FAILED'::"text", 'EXPIRED'::"text"])))
);


ALTER TABLE "public"."online_payment_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_finance_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "online_payments_clearing_account_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "security_deposit_liability_account_id" "uuid",
    "commission_expense_account_id" "uuid",
    "commission_payable_account_id" "uuid"
);


ALTER TABLE "public"."organization_finance_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organization_finance_settings"."security_deposit_liability_account_id" IS 'LIABILITY account holding tenant security deposits. Credited on receipt, debited on refund or deduction.';



CREATE TABLE IF NOT EXISTS "public"."organization_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_memberships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'invited'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."organization_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "status" "text" DEFAULT 'TRIAL'::"text" NOT NULL,
    "default_currency" "text" DEFAULT 'EGP'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "entity_type" "text",
    "entity_type_custom_label" "text",
    "address" "text",
    "governorate" "text",
    "city" "text",
    "phone" "text",
    "email" "text",
    "tax_id" "text",
    "tax_jurisdiction" "text",
    "tax_enforcement_enabled" boolean DEFAULT false NOT NULL,
    "tax_enforcement_enabled_at" timestamp with time zone,
    "tax_enforcement_enabled_by" "uuid",
    "tax_enforcement_disabled_at" timestamp with time zone,
    "tax_enforcement_disabled_by" "uuid",
    "tax_enforcement_disabled_reason" "text",
    "output_tax_account_id" "uuid",
    "input_tax_account_id" "uuid",
    "brand_color" "text" DEFAULT '#1E1B4B'::"text",
    "logo_url" "text",
    "commercial_registry" "text",
    "tagline" "text",
    "fx_gain_account_id" "uuid",
    "fx_loss_account_id" "uuid",
    "asset_disposal_gain_account_id" "uuid",
    "asset_disposal_loss_account_id" "uuid",
    CONSTRAINT "org_tax_enforcement_has_actor" CHECK ((("tax_enforcement_enabled" = false) OR ("tax_enforcement_enabled_at" IS NOT NULL))),
    CONSTRAINT "organizations_entity_type_check" CHECK ((("entity_type" IS NULL) OR ("entity_type" = ANY (ARRAY['DEVELOPER'::"text", 'FACILITY_MANAGEMENT'::"text", 'OWNERS_ASSOCIATION'::"text", 'INDIVIDUAL_OWNER'::"text", 'TOURIST_RESORT'::"text", 'TOURIST_VILLAGE'::"text", 'RESIDENTIAL_COMPOUND'::"text", 'OTHER'::"text"])))),
    CONSTRAINT "organizations_governorate_check" CHECK ((("governorate" IS NULL) OR ("governorate" = ANY (ARRAY['القاهرة'::"text", 'الجيزة'::"text", 'الإسكندرية'::"text", 'الدقهلية'::"text", 'البحر الأحمر'::"text", 'البحيرة'::"text", 'الفيوم'::"text", 'الغربية'::"text", 'الإسماعيلية'::"text", 'المنوفية'::"text", 'المنيا'::"text", 'القليوبية'::"text", 'الوادي الجديد'::"text", 'السويس'::"text", 'أسوان'::"text", 'أسيوط'::"text", 'بني سويف'::"text", 'بورسعيد'::"text", 'دمياط'::"text", 'الشرقية'::"text", 'جنوب سيناء'::"text", 'كفر الشيخ'::"text", 'مطروح'::"text", 'الأقصر'::"text", 'قنا'::"text", 'شمال سيناء'::"text", 'سوهاج'::"text"])))),
    CONSTRAINT "organizations_status_check" CHECK (("status" = ANY (ARRAY['TRIAL'::"text", 'ACTIVE'::"text", 'SUSPENDED'::"text", 'ARCHIVED'::"text"]))),
    CONSTRAINT "organizations_tax_jurisdiction_check" CHECK ((("tax_jurisdiction" IS NULL) OR ("tax_jurisdiction" = ANY (ARRAY['EG'::"text", 'SA'::"text"]))))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."tax_jurisdiction" IS 'الاختصاص الضريبي للكيان — صفة قانونية كـtax_id، لا إعداد تكامل. يبقى null حتى يُسجَّل، والقرار الضريبي يُرفض عندئذٍ ولا يُخمَّن.';



COMMENT ON COLUMN "public"."organizations"."tax_enforcement_enabled" IS 'تفعيل إداري صريح للنطاق الضريبي. غياب الاختصاص ليس مفتاحًا صامتًا — الإنفاذ لا يسري إلا بهذا العلم.';



COMMENT ON COLUMN "public"."organizations"."tax_enforcement_disabled_at" IS 'يبقى بعد الإيقاف. بدونه يمحو الإيقاف كل أثر على الصف بأن الإنفاذ كان مفعَّلًا، فتعمى المراقبة عن الفجوة.';



COMMENT ON COLUMN "public"."organizations"."output_tax_account_id" IS 'تجاوز اختياري لحساب ضريبة المخرجات. الافتراضي حساب الدليل القياسي 2300.';



COMMENT ON COLUMN "public"."organizations"."input_tax_account_id" IS 'تجاوز اختياري لحساب ضريبة المدخلات. الافتراضي 1140، ولا يجوز أن يساوي حساب المخرجات.';



CREATE TABLE IF NOT EXISTS "public"."payment_provider_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "provider" "text" NOT NULL,
    "environment" "text" NOT NULL,
    "merchant_identifier" "text",
    "public_key" "text",
    "api_key_secret_id" "uuid",
    "hmac_secret_id" "uuid",
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "verified_at" timestamp with time zone,
    "last_verification_error" "text",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_provider_settings_environment_check" CHECK (("environment" = ANY (ARRAY['SANDBOX'::"text", 'PRODUCTION'::"text"]))),
    CONSTRAINT "payment_provider_settings_provider_check" CHECK (("provider" = ANY (ARRAY['FAWRY'::"text", 'PAYMOB'::"text"]))),
    CONSTRAINT "payment_provider_settings_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'VALIDATING'::"text", 'VERIFIED'::"text", 'ENABLED'::"text", 'DISABLED'::"text"])))
);


ALTER TABLE "public"."payment_provider_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_entitlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL
);


ALTER TABLE "public"."plan_entitlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_installments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "due_id" "uuid" NOT NULL,
    "sequence_no" integer NOT NULL,
    "principal_amount" numeric(19,4) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plan_installments_principal_amount_check" CHECK (("principal_amount" > (0)::numeric)),
    CONSTRAINT "plan_installments_sequence_no_check" CHECK (("sequence_no" >= 0))
);


ALTER TABLE "public"."plan_installments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plans_key_check" CHECK (("key" = ANY (ARRAY['STARTER'::"text", 'PROFESSIONAL'::"text", 'ENTERPRISE'::"text"])))
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "organization_id" "uuid",
    "property_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "reason" "text",
    "safe_change_summary" "jsonb",
    "correlation_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "locale" "text" DEFAULT 'ar'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_locale_check" CHECK (("locale" = ANY (ARRAY['ar'::"text", 'en'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "code" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "wip_account_id" "uuid",
    "cost_of_sales_account_id" "uuid",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "start_date" "date",
    "expected_completion_date" "date",
    "budget_amount" numeric(19,4),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "projects_budget_positive" CHECK ((("budget_amount" IS NULL) OR ("budget_amount" > (0)::numeric))),
    CONSTRAINT "projects_status_check" CHECK (("status" = ANY (ARRAY['PLANNING'::"text", 'ACTIVE'::"text", 'COMPLETED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."properties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "timezone" "text" DEFAULT 'Africa/Cairo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "address" "text",
    "governorate" "text",
    "phone" "text",
    "email" "text",
    "property_type" "text" DEFAULT 'resort'::"text" NOT NULL,
    CONSTRAINT "resorts_governorate_check" CHECK ((("governorate" IS NULL) OR ("governorate" = ANY (ARRAY['القاهرة'::"text", 'الجيزة'::"text", 'الإسكندرية'::"text", 'الدقهلية'::"text", 'البحر الأحمر'::"text", 'البحيرة'::"text", 'الفيوم'::"text", 'الغربية'::"text", 'الإسماعيلية'::"text", 'المنوفية'::"text", 'المنيا'::"text", 'القليوبية'::"text", 'الوادي الجديد'::"text", 'السويس'::"text", 'أسوان'::"text", 'أسيوط'::"text", 'بني سويف'::"text", 'بورسعيد'::"text", 'دمياط'::"text", 'الشرقية'::"text", 'جنوب سيناء'::"text", 'كفر الشيخ'::"text", 'مطروح'::"text", 'الأقصر'::"text", 'قنا'::"text", 'شمال سيناء'::"text", 'سوهاج'::"text"])))),
    CONSTRAINT "resorts_property_type_check" CHECK (("property_type" = ANY (ARRAY['resort'::"text", 'building'::"text", 'residential_unit'::"text", 'commercial_unit'::"text"])))
);


ALTER TABLE "public"."properties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."property_import_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid",
    "import_kind" "text" NOT NULL,
    "imported_rows" integer NOT NULL,
    "skipped_rows" integer NOT NULL,
    "allow_partial" boolean NOT NULL,
    "failures" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "property_import_logs_import_kind_check" CHECK (("import_kind" = ANY (ARRAY['units'::"text", 'members'::"text"])))
);


ALTER TABLE "public"."property_import_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "purchase_request_id" "uuid",
    "order_number" bigint,
    "description" "text" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "order_date" "date" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "created_by" "uuid",
    "approved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchase_orders_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "purchase_orders_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'APPROVED'::"text", 'RECEIVED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "estimated_amount" numeric(19,4) NOT NULL,
    "status" "text" DEFAULT 'SUBMITTED'::"text" NOT NULL,
    "requested_by" "uuid",
    "approved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchase_requests_estimated_amount_check" CHECK (("estimated_amount" > (0)::numeric)),
    CONSTRAINT "purchase_requests_status_check" CHECK (("status" = ANY (ARRAY['SUBMITTED'::"text", 'APPROVED'::"text", 'REJECTED'::"text"])))
);


ALTER TABLE "public"."purchase_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resort_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."resort_memberships" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."resorts" WITH ("security_invoker"='true') AS
 SELECT "id",
    "organization_id",
    "name",
    "code",
    "timezone",
    "property_type",
    "address",
    "governorate",
    "phone",
    "email",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by"
   FROM "public"."properties";


ALTER VIEW "public"."resorts" OWNER TO "postgres";


COMMENT ON VIEW "public"."resorts" IS 'Compatibility shim (2026-08-16): resorts was renamed to properties. This auto-updatable view exists so unmigrated functions/app code that still say "resorts" keep working. Do not add new callers of this view -- use public.properties directly. Tracked for removal once all resort_id columns and their dependent functions/TS code are migrated (see docs/superpowers/plans/2026-08-16-resort-to-property-rename-phase2a.md).';



CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_template_permissions" (
    "role_template_key" "text" NOT NULL,
    "permission_key" "text" NOT NULL
);


ALTER TABLE "public"."role_template_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_templates" (
    "key" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."role_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "key" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "name_en" "text" NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_charge_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "levy_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "basis_value" numeric(14,4) NOT NULL,
    "share_amount" numeric(19,4) DEFAULT 0 NOT NULL,
    "due_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_charge_allocations_basis_value_check" CHECK (("basis_value" >= (0)::numeric)),
    CONSTRAINT "service_charge_allocations_share_amount_check" CHECK (("share_amount" >= (0)::numeric))
);


ALTER TABLE "public"."service_charge_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_charge_levies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "total_amount" numeric(19,4) NOT NULL,
    "allocation_basis" "text" NOT NULL,
    "due_type_id" "uuid" NOT NULL,
    "receivable_account_id" "uuid" NOT NULL,
    "issue_date" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "issued_at" timestamp with time zone,
    "issued_by" "uuid",
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "handed_over_only" boolean DEFAULT false NOT NULL,
    CONSTRAINT "service_charge_levies_allocation_basis_check" CHECK (("allocation_basis" = ANY (ARRAY['AREA'::"text", 'EQUAL'::"text", 'CUSTOM'::"text"]))),
    CONSTRAINT "service_charge_levies_due_order" CHECK (("due_date" >= "issue_date")),
    CONSTRAINT "service_charge_levies_period_order" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "service_charge_levies_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'ISSUED'::"text", 'CANCELLED'::"text"]))),
    CONSTRAINT "service_charge_levies_total_amount_check" CHECK (("total_amount" > (0)::numeric))
);


ALTER TABLE "public"."service_charge_levies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "current_period_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'CANCELED'::"text", 'PAST_DUE'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "purchase_order_id" "uuid",
    "invoice_number" "text" NOT NULL,
    "expense_account_id" "uuid" NOT NULL,
    "payable_account_id" "uuid" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "invoice_date" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "status" "text" DEFAULT 'POSTED'::"text" NOT NULL,
    "journal_entry_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "net_amount" numeric(19,4) NOT NULL,
    "discount_amount" numeric(19,4) DEFAULT 0 NOT NULL,
    "vat_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "vat_amount" numeric(19,4) DEFAULT 0 NOT NULL,
    "vat_account_id" "uuid",
    "wht_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "wht_amount" numeric(19,4) DEFAULT 0 NOT NULL,
    "wht_account_id" "uuid",
    "reversed_at" timestamp with time zone,
    "reversed_by" "uuid",
    "reversal_reason" "text",
    "currency" "text",
    "exchange_rate" numeric(18,8),
    "foreign_net_amount" numeric(19,4),
    "foreign_discount_amount" numeric(19,4),
    "foreign_amount" numeric(19,4),
    CONSTRAINT "supplier_invoices_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "supplier_invoices_reversal_reason_length" CHECK ((("reversal_reason" IS NULL) OR ("char_length"("reversal_reason") <= 1000))),
    CONSTRAINT "supplier_invoices_reversal_reason_required" CHECK ((("status" <> 'CANCELLED'::"text") OR (("reversal_reason" IS NOT NULL) AND (TRIM(BOTH FROM "reversal_reason") <> ''::"text")))),
    CONSTRAINT "supplier_invoices_reversed_at_by_together" CHECK ((("reversed_at" IS NULL) = ("reversed_by" IS NULL))),
    CONSTRAINT "supplier_invoices_status_check" CHECK (("status" = ANY (ARRAY['POSTED'::"text", 'PARTIALLY_PAID'::"text", 'PAID'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."supplier_invoices" OWNER TO "postgres";


COMMENT ON COLUMN "public"."supplier_invoices"."currency" IS 'عملة المستند الأصلية. NULL = عملة المؤسسة، وهو ما عليه كل صف قائم.';



COMMENT ON COLUMN "public"."supplier_invoices"."exchange_rate" IS 'كم وحدة من عملة المؤسسة تساوي وحدة واحدة من عملة الفاتورة، وقت التسجيل.';



CREATE TABLE IF NOT EXISTS "public"."supplier_payment_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "reversed_at" timestamp with time zone,
    "reversed_by" "uuid",
    CONSTRAINT "supplier_payment_allocations_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "supplier_payment_allocations_reversed_at_by_together" CHECK ((("reversed_at" IS NULL) = ("reversed_by" IS NULL)))
);


ALTER TABLE "public"."supplier_payment_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "method" "text" NOT NULL,
    "payment_date" "date" NOT NULL,
    "voucher_number" bigint,
    "payment_account_id" "uuid" NOT NULL,
    "journal_entry_id" "uuid",
    "cashier_session_id" "uuid",
    "idempotency_key" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "wht_amount" numeric(19,4) DEFAULT 0 NOT NULL,
    "wht_account_id" "uuid",
    "reversed_at" timestamp with time zone,
    "reversed_by" "uuid",
    "reversal_reason" "text",
    CONSTRAINT "supplier_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "supplier_payments_method_check" CHECK (("method" = ANY (ARRAY['CASH'::"text", 'BANK_TRANSFER'::"text", 'CHEQUE'::"text", 'OTHER'::"text"]))),
    CONSTRAINT "supplier_payments_reversal_reason_length" CHECK ((("reversal_reason" IS NULL) OR ("char_length"("reversal_reason") <= 1000))),
    CONSTRAINT "supplier_payments_reversal_reason_required" CHECK ((("reversed_at" IS NULL) OR (("reversal_reason" IS NOT NULL) AND (TRIM(BOTH FROM "reversal_reason") <> ''::"text")))),
    CONSTRAINT "supplier_payments_reversed_at_by_together" CHECK ((("reversed_at" IS NULL) = ("reversed_by" IS NULL)))
);


ALTER TABLE "public"."supplier_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "contact_email" "text",
    "contact_phone" "text",
    "payable_account_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tax_number" "text",
    "commercial_registry" "text",
    "contact_person" "text",
    "address" "text",
    "secondary_phone" "text",
    "bank_account_details" "text",
    "bank_name" "text",
    "bank_iban" "text",
    "payment_terms_days" integer DEFAULT 30,
    "credit_limit" numeric(19,4) DEFAULT 0,
    "category" "text"
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tax_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "revenue_nature" "text" NOT NULL,
    "jurisdiction" "text" NOT NULL,
    "transaction_date" "date" NOT NULL,
    "tax_rule_version_id" "uuid" NOT NULL,
    "tax_rule_hash" "text" NOT NULL,
    "tax_decision_snapshot" "jsonb" NOT NULL,
    "decided_by" "uuid",
    "decided_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reverses_decision_id" "uuid",
    "replaces_decision_id" "uuid",
    "reason" "text",
    "amount_basis" "text",
    "taxable_base" numeric(19,4),
    "vat_amount" numeric(19,4),
    "gross_amount" numeric(19,4),
    "output_tax_account_id" "uuid",
    "buyer_member_id" "uuid",
    CONSTRAINT "tax_decision_amounts_consistent" CHECK (((("taxable_base" IS NULL) AND ("vat_amount" IS NULL) AND ("gross_amount" IS NULL)) OR (("taxable_base" IS NOT NULL) AND ("vat_amount" IS NOT NULL) AND ("gross_amount" IS NOT NULL) AND ("vat_amount" >= (0)::numeric) AND ("gross_amount" = ("taxable_base" + "vat_amount"))))),
    CONSTRAINT "tax_decision_not_both_links" CHECK ((("reverses_decision_id" IS NULL) OR ("replaces_decision_id" IS NULL))),
    CONSTRAINT "tax_decision_reversal_has_reason" CHECK ((("reverses_decision_id" IS NULL) OR (NULLIF("btrim"("reason"), ''::"text") IS NOT NULL))),
    CONSTRAINT "tax_decisions_amount_basis_check" CHECK ((("amount_basis" IS NULL) OR ("amount_basis" = ANY (ARRAY['NET'::"text", 'GROSS'::"text"])))),
    CONSTRAINT "tax_decisions_jurisdiction_check" CHECK (("jurisdiction" = ANY (ARRAY['EG'::"text", 'SA'::"text"]))),
    CONSTRAINT "tax_decisions_source_type_check" CHECK (("source_type" = 'DUE'::"text"))
);


ALTER TABLE "public"."tax_decisions" OWNER TO "postgres";


COMMENT ON TABLE "public"."tax_decisions" IS 'بصمة القرار الضريبي لكل معاملة. لا تُعدَّل — القرار التاريخي لا يتحرك بتعديل قاعدة.';



CREATE TABLE IF NOT EXISTS "public"."tenant_branding" (
    "organization_id" "uuid" NOT NULL,
    "logo_url" "text",
    "primary_color" "text",
    "secondary_color" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_branding" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_feature_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "flag_key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_feature_flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unit_handover_snags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "handover_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "severity" "text" DEFAULT 'MINOR'::"text" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "unit_handover_snags_description_check" CHECK (("btrim"("description") <> ''::"text")),
    CONSTRAINT "unit_handover_snags_severity_check" CHECK (("severity" = ANY (ARRAY['BLOCKING'::"text", 'MINOR'::"text"]))),
    CONSTRAINT "unit_handover_snags_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'RESOLVED'::"text"])))
);


ALTER TABLE "public"."unit_handover_snags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unit_handovers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "handed_to_member_id" "uuid",
    "status" "text" DEFAULT 'SCHEDULED'::"text" NOT NULL,
    "scheduled_date" "date",
    "completed_date" "date",
    "electricity_reading" numeric(14,3),
    "water_reading" numeric(14,3),
    "gas_reading" numeric(14,3),
    "note" "text",
    "completed_by" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "unit_handovers_completed_has_date" CHECK ((("status" <> 'COMPLETED'::"text") OR ("completed_date" IS NOT NULL))),
    CONSTRAINT "unit_handovers_status_check" CHECK (("status" = ANY (ARRAY['SCHEDULED'::"text", 'COMPLETED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."unit_handovers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unit_lease_deposit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lease_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "amount" numeric(19,4) NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "journal_entry_id" "uuid",
    "settlement_account_id" "uuid",
    CONSTRAINT "unit_lease_deposit_events_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "unit_lease_deposit_events_check" CHECK ((("event_type" = 'RECEIVED'::"text") OR (("reason" IS NOT NULL) AND (TRIM(BOTH FROM "reason") <> ''::"text")))),
    CONSTRAINT "unit_lease_deposit_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['RECEIVED'::"text", 'REFUNDED'::"text", 'DEDUCTED'::"text"])))
);


ALTER TABLE "public"."unit_lease_deposit_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."unit_lease_deposit_events"."settlement_account_id" IS 'Counter-account to the deposit liability: the cash/bank account for RECEIVED and REFUNDED, or the account recognising the deduction for DEDUCTED.';



CREATE TABLE IF NOT EXISTS "public"."unit_leases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "tenant_member_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "starts_on" "date" NOT NULL,
    "ends_on" "date",
    "rent_amount" numeric(19,4) NOT NULL,
    "rent_frequency" "text" NOT NULL,
    "security_deposit_amount" numeric(19,4) DEFAULT 0 NOT NULL,
    "billing_recipient" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_by" "uuid",
    "ended_at" timestamp with time zone,
    "end_reason" "text",
    "due_type_id" "uuid" NOT NULL,
    "receivable_account_id" "uuid" NOT NULL,
    CONSTRAINT "unit_leases_billing_recipient_check" CHECK (("billing_recipient" = ANY (ARRAY['OWNER'::"text", 'TENANT'::"text"]))),
    CONSTRAINT "unit_leases_check" CHECK ((("ends_on" IS NULL) OR ("ends_on" >= "starts_on"))),
    CONSTRAINT "unit_leases_check1" CHECK ((("ended_at" IS NULL) = ("ended_by" IS NULL))),
    CONSTRAINT "unit_leases_check2" CHECK ((("status" <> 'ENDED'::"text") OR (("end_reason" IS NOT NULL) AND (TRIM(BOTH FROM "end_reason") <> ''::"text")))),
    CONSTRAINT "unit_leases_rent_amount_check" CHECK (("rent_amount" > (0)::numeric)),
    CONSTRAINT "unit_leases_rent_frequency_check" CHECK (("rent_frequency" = ANY (ARRAY['MONTHLY'::"text", 'QUARTERLY'::"text", 'YEARLY'::"text"]))),
    CONSTRAINT "unit_leases_security_deposit_amount_check" CHECK (("security_deposit_amount" >= (0)::numeric)),
    CONSTRAINT "unit_leases_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'ACTIVE'::"text", 'ENDED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."unit_leases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_role_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "property_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."user_role_assignments" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_bank_id_account_number_key" UNIQUE ("bank_id", "account_number");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_statement_lines"
    ADD CONSTRAINT "bank_statement_lines_matched_journal_entry_line_id_key" UNIQUE ("matched_journal_entry_line_id");



ALTER TABLE ONLY "public"."bank_statement_lines"
    ADD CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_statements"
    ADD CONSTRAINT "bank_statements_bank_account_id_period_end_key" UNIQUE ("bank_account_id", "period_end");



ALTER TABLE ONLY "public"."bank_statements"
    ADD CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banks"
    ADD CONSTRAINT "banks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brokers"
    ADD CONSTRAINT "brokers_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."brokers"
    ADD CONSTRAINT "brokers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_organization_id_fiscal_period_id_account_id_key" UNIQUE ("organization_id", "fiscal_period_id", "account_id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_resort_id_code_key" UNIQUE ("property_id", "code");



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cashboxes"
    ADD CONSTRAINT "cashboxes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cashier_sessions"
    ADD CONSTRAINT "cashier_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalogue_items"
    ADD CONSTRAINT "catalogue_items_code_unique" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."catalogue_items"
    ADD CONSTRAINT "catalogue_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_organization_id_code_key" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cheque_status_history"
    ADD CONSTRAINT "cheque_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cheques"
    ADD CONSTRAINT "cheques_bank_account_id_cheque_number_key" UNIQUE ("bank_account_id", "cheque_number");



ALTER TABLE ONLY "public"."cheques"
    ADD CONSTRAINT "cheques_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coa_template_accounts"
    ADD CONSTRAINT "coa_template_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coa_template_accounts"
    ADD CONSTRAINT "coa_template_accounts_template_key_code_key" UNIQUE ("template_key", "code");



ALTER TABLE ONLY "public"."coa_templates"
    ADD CONSTRAINT "coa_templates_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_broker_id_installment_plan_id_key" UNIQUE ("broker_id", "installment_plan_id");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_broker_id_lease_id_key" UNIQUE ("broker_id", "lease_id");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_requests"
    ADD CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_organization_id_code_key" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_note_number_unique" UNIQUE ("organization_id", "document_number");



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."demo_leads"
    ADD CONSTRAINT "demo_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_number_counters"
    ADD CONSTRAINT "document_number_counters_pkey" PRIMARY KEY ("organization_id", "document_type", "year");



ALTER TABLE ONLY "public"."document_numbers"
    ADD CONSTRAINT "document_numbers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_numbers"
    ADD CONSTRAINT "document_numbers_unique_number" UNIQUE ("organization_id", "document_type", "year", "sequence_number");



ALTER TABLE ONLY "public"."document_numbers"
    ADD CONSTRAINT "document_numbers_unique_source" UNIQUE ("organization_id", "source_type", "source_id");



ALTER TABLE ONLY "public"."document_sequences"
    ADD CONSTRAINT "document_sequences_organization_id_resort_id_sequence_type_key" UNIQUE NULLS NOT DISTINCT ("organization_id", "property_id", "sequence_type");



ALTER TABLE ONLY "public"."document_sequences"
    ADD CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."due_generation_runs"
    ADD CONSTRAINT "due_generation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."due_schedules"
    ADD CONSTRAINT "due_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."due_type_revenue_natures"
    ADD CONSTRAINT "due_type_nature_unique" UNIQUE ("organization_id", "due_type_id");



ALTER TABLE ONLY "public"."due_type_revenue_natures"
    ADD CONSTRAINT "due_type_revenue_natures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."due_types"
    ADD CONSTRAINT "due_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dues"
    ADD CONSTRAINT "dues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dunning_notices"
    ADD CONSTRAINT "dunning_notices_once" UNIQUE ("due_id", "stage");



ALTER TABLE ONLY "public"."dunning_notices"
    ADD CONSTRAINT "dunning_notices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dunning_policies"
    ADD CONSTRAINT "dunning_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dunning_policies"
    ADD CONSTRAINT "dunning_policies_stage_unique" UNIQUE ("organization_id", "stage");



ALTER TABLE ONLY "public"."einvoice_documents"
    ADD CONSTRAINT "einvoice_documents_organization_id_idempotency_key_key" UNIQUE ("organization_id", "idempotency_key");



ALTER TABLE ONLY "public"."einvoice_documents"
    ADD CONSTRAINT "einvoice_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."einvoice_documents"
    ADD CONSTRAINT "einvoice_documents_profile_id_source_type_source_id_key" UNIQUE ("profile_id", "source_type", "source_id");



ALTER TABLE ONLY "public"."einvoice_profiles"
    ADD CONSTRAINT "einvoice_profiles_organization_id_jurisdiction_environment_key" UNIQUE ("organization_id", "jurisdiction", "environment");



ALTER TABLE ONLY "public"."einvoice_profiles"
    ADD CONSTRAINT "einvoice_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."einvoice_submission_attempts"
    ADD CONSTRAINT "einvoice_submission_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exchange_rates"
    ADD CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exchange_rates"
    ADD CONSTRAINT "exchange_rates_unique" UNIQUE ("organization_id", "foreign_currency", "base_currency", "rate_date");



ALTER TABLE ONLY "public"."expense_account_input_tax"
    ADD CONSTRAINT "expense_account_input_tax_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_account_input_tax"
    ADD CONSTRAINT "expense_account_input_tax_unique" UNIQUE ("organization_id", "expense_account_id");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fixed_asset_depreciation"
    ADD CONSTRAINT "fad_once_per_period" UNIQUE ("fixed_asset_id", "fiscal_period_id");



ALTER TABLE ONLY "public"."financial_audit_logs"
    ADD CONSTRAINT "financial_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fiscal_periods"
    ADD CONSTRAINT "fiscal_periods_fiscal_year_id_period_number_key" UNIQUE ("fiscal_year_id", "period_number");



ALTER TABLE ONLY "public"."fiscal_periods"
    ADD CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fiscal_years"
    ADD CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fixed_asset_depreciation"
    ADD CONSTRAINT "fixed_asset_depreciation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_code_unique" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."input_tax_decisions"
    ADD CONSTRAINT "input_tax_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."input_tax_decisions"
    ADD CONSTRAINT "input_tax_replaced_once" UNIQUE ("replaces_decision_id");



ALTER TABLE ONLY "public"."input_tax_decisions"
    ADD CONSTRAINT "input_tax_reversed_once" UNIQUE ("reverses_decision_id");



ALTER TABLE ONLY "public"."installment_plans"
    ADD CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_organization_id_idempotency_key_key" UNIQUE ("organization_id", "idempotency_key");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_journal_entry_id_line_number_key" UNIQUE ("journal_entry_id", "line_number");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lease_rent_generation_runs"
    ADD CONSTRAINT "lease_rent_generation_runs_lease_id_period_key" UNIQUE ("lease_id", "period");



ALTER TABLE ONLY "public"."lease_rent_generation_runs"
    ADD CONSTRAINT "lease_rent_generation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_activity_log"
    ADD CONSTRAINT "member_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_documents"
    ADD CONSTRAINT "member_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_invitation_short_links"
    ADD CONSTRAINT "member_invitation_short_links_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."member_invitations"
    ADD CONSTRAINT "member_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_phones"
    ADD CONSTRAINT "member_phones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_saved_filters"
    ADD CONSTRAINT "member_saved_filters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."member_tag_assignments"
    ADD CONSTRAINT "member_tag_assignments_pkey" PRIMARY KEY ("member_id", "tag_id");



ALTER TABLE ONLY "public"."member_tags"
    ADD CONSTRAINT "member_tags_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."member_tags"
    ADD CONSTRAINT "member_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."online_payment_transaction_allocations"
    ADD CONSTRAINT "online_payment_transaction_allocation_transaction_id_due_id_key" UNIQUE ("transaction_id", "due_id");



ALTER TABLE ONLY "public"."online_payment_transaction_allocations"
    ADD CONSTRAINT "online_payment_transaction_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."online_payment_transactions"
    ADD CONSTRAINT "online_payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_finance_settings"
    ADD CONSTRAINT "organization_finance_settings_organization_id_resort_id_key" UNIQUE ("organization_id", "property_id");



ALTER TABLE ONLY "public"."organization_finance_settings"
    ADD CONSTRAINT "organization_finance_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_provider_settings"
    ADD CONSTRAINT "payment_provider_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_entitlements"
    ADD CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_entitlements"
    ADD CONSTRAINT "plan_entitlements_plan_id_key_key" UNIQUE ("plan_id", "key");



ALTER TABLE ONLY "public"."plan_installments"
    ADD CONSTRAINT "plan_installments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_installments"
    ADD CONSTRAINT "plan_installments_plan_id_sequence_no_key" UNIQUE ("plan_id", "sequence_no");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_organization_id_code_key" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."property_import_logs"
    ADD CONSTRAINT "property_import_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_requests"
    ADD CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resort_memberships"
    ADD CONSTRAINT "resort_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resort_memberships"
    ADD CONSTRAINT "resort_memberships_resort_id_user_id_key" UNIQUE ("property_id", "user_id");



ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "resorts_organization_id_code_key" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "resorts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."revenue_natures"
    ADD CONSTRAINT "revenue_natures_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."role_template_permissions"
    ADD CONSTRAINT "role_template_permissions_pkey" PRIMARY KEY ("role_template_key", "permission_key");



ALTER TABLE ONLY "public"."role_templates"
    ADD CONSTRAINT "role_templates_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_charge_allocations"
    ADD CONSTRAINT "service_charge_allocations_due_id_key" UNIQUE ("due_id");



ALTER TABLE ONLY "public"."service_charge_allocations"
    ADD CONSTRAINT "service_charge_allocations_levy_id_unit_id_key" UNIQUE ("levy_id", "unit_id");



ALTER TABLE ONLY "public"."service_charge_allocations"
    ADD CONSTRAINT "service_charge_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_charge_levies"
    ADD CONSTRAINT "service_charge_levies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_organization_id_supplier_id_invoice_numbe_key" UNIQUE ("organization_id", "supplier_id", "invoice_number");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_payment_allocations"
    ADD CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_decisions"
    ADD CONSTRAINT "tax_decision_replaced_once" UNIQUE ("replaces_decision_id");



ALTER TABLE ONLY "public"."tax_decisions"
    ADD CONSTRAINT "tax_decision_reversed_once" UNIQUE ("reverses_decision_id");



ALTER TABLE ONLY "public"."tax_decisions"
    ADD CONSTRAINT "tax_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_rule_versions"
    ADD CONSTRAINT "tax_rule_no_overlap" EXCLUDE USING "gist" ("jurisdiction" WITH =, "revenue_nature" WITH =, "daterange"("effective_from", "effective_to", '[)'::"text") WITH &&) WHERE (("status" = 'APPROVED'::"text"));



ALTER TABLE ONLY "public"."tax_rule_versions"
    ADD CONSTRAINT "tax_rule_unique_version" UNIQUE ("jurisdiction", "revenue_nature", "version");



ALTER TABLE ONLY "public"."tax_rule_versions"
    ADD CONSTRAINT "tax_rule_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_branding"
    ADD CONSTRAINT "tenant_branding_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."tenant_feature_flags"
    ADD CONSTRAINT "tenant_feature_flags_organization_id_flag_key_key" UNIQUE ("organization_id", "flag_key");



ALTER TABLE ONLY "public"."tenant_feature_flags"
    ADD CONSTRAINT "tenant_feature_flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."due_generation_runs"
    ADD CONSTRAINT "unique_schedule_period" UNIQUE ("schedule_id", "period");



ALTER TABLE ONLY "public"."unit_handover_snags"
    ADD CONSTRAINT "unit_handover_snags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_handovers"
    ADD CONSTRAINT "unit_handovers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_handovers"
    ADD CONSTRAINT "unit_handovers_unit_id_key" UNIQUE ("unit_id");



ALTER TABLE ONLY "public"."unit_lease_deposit_events"
    ADD CONSTRAINT "unit_lease_deposit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_leases"
    ADD CONSTRAINT "unit_leases_no_overlapping_active" EXCLUDE USING "gist" ("unit_id" WITH =, "daterange"("starts_on", COALESCE("ends_on", 'infinity'::"date"), '[]'::"text") WITH &&) WHERE (("status" = 'ACTIVE'::"text"));



ALTER TABLE ONLY "public"."unit_leases"
    ADD CONSTRAINT "unit_leases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_ownerships"
    ADD CONSTRAINT "unit_ownerships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_resort_id_code_key" UNIQUE ("property_id", "code");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_user_id_role_id_organization_id_resor_key" UNIQUE ("user_id", "role_id", "organization_id", "property_id");



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_pkey" PRIMARY KEY ("id");



CREATE INDEX "chart_of_accounts_cash_equivalent_idx" ON "public"."chart_of_accounts" USING "btree" ("organization_id") WHERE "is_cash_equivalent";



CREATE INDEX "idx_bank_accounts_organization" ON "public"."bank_accounts" USING "btree" ("organization_id");



CREATE INDEX "idx_bank_statement_lines_statement" ON "public"."bank_statement_lines" USING "btree" ("statement_id", "line_date");



CREATE INDEX "idx_bank_statement_lines_unmatched" ON "public"."bank_statement_lines" USING "btree" ("statement_id") WHERE ("matched_journal_entry_line_id" IS NULL);



CREATE INDEX "idx_bank_statements_org" ON "public"."bank_statements" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_brokers_org" ON "public"."brokers" USING "btree" ("organization_id") WHERE "is_active";



CREATE INDEX "idx_budgets_org_period" ON "public"."budgets" USING "btree" ("organization_id", "fiscal_period_id");



CREATE INDEX "idx_buildings_resort" ON "public"."buildings" USING "btree" ("property_id");



CREATE INDEX "idx_cash_transactions_session" ON "public"."cash_transactions" USING "btree" ("session_id");



CREATE INDEX "idx_cashboxes_resort" ON "public"."cashboxes" USING "btree" ("property_id");



CREATE UNIQUE INDEX "idx_cashier_sessions_one_open_per_cashbox" ON "public"."cashier_sessions" USING "btree" ("cashbox_id") WHERE ("status" = 'OPEN'::"text");



CREATE INDEX "idx_cashier_sessions_organization" ON "public"."cashier_sessions" USING "btree" ("organization_id");



CREATE INDEX "idx_catalogue_items_org" ON "public"."catalogue_items" USING "btree" ("organization_id");



CREATE INDEX "idx_chart_of_accounts_org" ON "public"."chart_of_accounts" USING "btree" ("organization_id");



CREATE INDEX "idx_chart_of_accounts_parent" ON "public"."chart_of_accounts" USING "btree" ("parent_id");



CREATE INDEX "idx_cheque_status_history_cheque" ON "public"."cheque_status_history" USING "btree" ("cheque_id");



CREATE INDEX "idx_cheques_organization" ON "public"."cheques" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_commissions_broker" ON "public"."commissions" USING "btree" ("broker_id");



CREATE INDEX "idx_commissions_org_status" ON "public"."commissions" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_credit_notes_org" ON "public"."credit_notes" USING "btree" ("organization_id");



CREATE INDEX "idx_credit_notes_source" ON "public"."credit_notes" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_due_generation_runs_schedule" ON "public"."due_generation_runs" USING "btree" ("schedule_id");



CREATE INDEX "idx_due_schedules_org" ON "public"."due_schedules" USING "btree" ("organization_id");



CREATE INDEX "idx_due_schedules_resort" ON "public"."due_schedules" USING "btree" ("property_id");



CREATE INDEX "idx_due_types_organization" ON "public"."due_types" USING "btree" ("organization_id");



CREATE INDEX "idx_dues_organization" ON "public"."dues" USING "btree" ("organization_id");



CREATE INDEX "idx_dues_source" ON "public"."dues" USING "btree" ("source_type", "source_id") WHERE ("source_type" IS NOT NULL);



CREATE INDEX "idx_dues_status" ON "public"."dues" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_dues_unit" ON "public"."dues" USING "btree" ("unit_id");



CREATE INDEX "idx_dunning_notices_due" ON "public"."dunning_notices" USING "btree" ("due_id");



CREATE INDEX "idx_dunning_notices_org" ON "public"."dunning_notices" USING "btree" ("organization_id");



CREATE INDEX "idx_einvoice_attempts_document" ON "public"."einvoice_submission_attempts" USING "btree" ("document_id", "occurred_at");



CREATE INDEX "idx_einvoice_documents_org_status" ON "public"."einvoice_documents" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_einvoice_documents_pending" ON "public"."einvoice_documents" USING "btree" ("profile_id", "submitted_at") WHERE ("status" = 'SUBMITTED'::"text");



CREATE INDEX "idx_einvoice_profiles_org" ON "public"."einvoice_profiles" USING "btree" ("organization_id", "jurisdiction");



CREATE INDEX "idx_exchange_rates_lookup" ON "public"."exchange_rates" USING "btree" ("organization_id", "foreign_currency", "base_currency", "rate_date" DESC);



CREATE INDEX "idx_expense_categories_organization" ON "public"."expense_categories" USING "btree" ("organization_id");



CREATE INDEX "idx_expenses_organization" ON "public"."expenses" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "idx_expenses_voucher_number" ON "public"."expenses" USING "btree" ("organization_id", "voucher_number") WHERE ("voucher_number" IS NOT NULL);



CREATE INDEX "idx_fad_asset" ON "public"."fixed_asset_depreciation" USING "btree" ("fixed_asset_id");



CREATE INDEX "idx_fad_org" ON "public"."fixed_asset_depreciation" USING "btree" ("organization_id");



CREATE INDEX "idx_fin_audit_action_occurred" ON "public"."financial_audit_logs" USING "btree" ("action", "occurred_at" DESC);



CREATE INDEX "idx_fin_audit_actor_occurred" ON "public"."financial_audit_logs" USING "btree" ("actor_user_id", "occurred_at" DESC);



CREATE INDEX "idx_fin_audit_org_entity" ON "public"."financial_audit_logs" USING "btree" ("organization_id", "entity_type", "entity_id");



CREATE INDEX "idx_fin_audit_org_occurred" ON "public"."financial_audit_logs" USING "btree" ("organization_id", "occurred_at" DESC);



CREATE INDEX "idx_fiscal_periods_org" ON "public"."fiscal_periods" USING "btree" ("organization_id");



CREATE INDEX "idx_fiscal_periods_year" ON "public"."fiscal_periods" USING "btree" ("fiscal_year_id");



CREATE INDEX "idx_fiscal_years_org" ON "public"."fiscal_years" USING "btree" ("organization_id");



CREATE INDEX "idx_fixed_assets_org" ON "public"."fixed_assets" USING "btree" ("organization_id");



CREATE INDEX "idx_fixed_assets_status" ON "public"."fixed_assets" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_input_tax_decisions_org" ON "public"."input_tax_decisions" USING "btree" ("organization_id");



CREATE INDEX "idx_input_tax_decisions_source" ON "public"."input_tax_decisions" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_installment_plans_buyer_member" ON "public"."installment_plans" USING "btree" ("buyer_member_id");



CREATE UNIQUE INDEX "idx_installment_plans_one_active_per_unit" ON "public"."installment_plans" USING "btree" ("unit_id") WHERE ("status" = 'ACTIVE'::"text");



CREATE INDEX "idx_installment_plans_organization" ON "public"."installment_plans" USING "btree" ("organization_id");



CREATE INDEX "idx_installment_plans_property" ON "public"."installment_plans" USING "btree" ("property_id");



CREATE INDEX "idx_installment_plans_unit" ON "public"."installment_plans" USING "btree" ("unit_id");



CREATE INDEX "idx_jel_project" ON "public"."journal_entry_lines" USING "btree" ("project_id") WHERE ("project_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_journal_entries_number" ON "public"."journal_entries" USING "btree" ("organization_id", "entry_number") WHERE ("entry_number" IS NOT NULL);



CREATE INDEX "idx_journal_entries_org" ON "public"."journal_entries" USING "btree" ("organization_id");



CREATE INDEX "idx_journal_entries_period" ON "public"."journal_entries" USING "btree" ("fiscal_period_id");



CREATE INDEX "idx_journal_entries_status" ON "public"."journal_entries" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_journal_entry_lines_account" ON "public"."journal_entry_lines" USING "btree" ("account_id");



CREATE INDEX "idx_journal_entry_lines_entry" ON "public"."journal_entry_lines" USING "btree" ("journal_entry_id");



CREATE INDEX "idx_lease_rent_generation_runs_lease" ON "public"."lease_rent_generation_runs" USING "btree" ("lease_id");



CREATE INDEX "idx_member_activity_log_member" ON "public"."member_activity_log" USING "btree" ("member_id", "created_at" DESC);



CREATE INDEX "idx_member_activity_log_organization" ON "public"."member_activity_log" USING "btree" ("organization_id");



CREATE INDEX "idx_member_documents_member" ON "public"."member_documents" USING "btree" ("member_id", "created_at" DESC);



CREATE INDEX "idx_member_documents_organization" ON "public"."member_documents" USING "btree" ("organization_id");



CREATE INDEX "idx_member_invitation_short_links_invitation" ON "public"."member_invitation_short_links" USING "btree" ("invitation_id");



CREATE INDEX "idx_member_invitations_organization" ON "public"."member_invitations" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "idx_member_invitations_pending_per_member" ON "public"."member_invitations" USING "btree" ("member_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_member_phones_member" ON "public"."member_phones" USING "btree" ("member_id");



CREATE INDEX "idx_member_phones_normalized" ON "public"."member_phones" USING "btree" ("organization_id", "normalized_phone");



CREATE UNIQUE INDEX "idx_member_phones_one_primary" ON "public"."member_phones" USING "btree" ("member_id") WHERE ("is_primary" = true);



CREATE UNIQUE INDEX "idx_member_phones_unique_num" ON "public"."member_phones" USING "btree" ("member_id", "normalized_phone");



CREATE INDEX "idx_member_saved_filters_organization" ON "public"."member_saved_filters" USING "btree" ("organization_id");



CREATE INDEX "idx_member_tag_assignments_organization" ON "public"."member_tag_assignments" USING "btree" ("organization_id");



CREATE INDEX "idx_member_tag_assignments_tag" ON "public"."member_tag_assignments" USING "btree" ("tag_id");



CREATE INDEX "idx_member_tags_organization" ON "public"."member_tags" USING "btree" ("organization_id");



CREATE INDEX "idx_members_customer_type" ON "public"."members" USING "btree" ("organization_id", "customer_type");



CREATE INDEX "idx_members_organization" ON "public"."members" USING "btree" ("organization_id");



CREATE INDEX "idx_online_txn_alloc_due" ON "public"."online_payment_transaction_allocations" USING "btree" ("due_id");



CREATE INDEX "idx_online_txn_alloc_transaction" ON "public"."online_payment_transaction_allocations" USING "btree" ("transaction_id");



CREATE UNIQUE INDEX "idx_online_txn_client_request" ON "public"."online_payment_transactions" USING "btree" ("organization_id", "client_request_id");



CREATE INDEX "idx_online_txn_expires_at" ON "public"."online_payment_transactions" USING "btree" ("expires_at") WHERE ("status" = 'PENDING'::"text");



CREATE INDEX "idx_online_txn_member" ON "public"."online_payment_transactions" USING "btree" ("member_id");



CREATE UNIQUE INDEX "idx_online_txn_provider_ref" ON "public"."online_payment_transactions" USING "btree" ("provider", "provider_reference") WHERE ("provider_reference" IS NOT NULL);



CREATE UNIQUE INDEX "idx_online_txn_webhook_event" ON "public"."online_payment_transactions" USING "btree" ("provider", "webhook_event_id") WHERE ("webhook_event_id" IS NOT NULL);



CREATE INDEX "idx_organization_memberships_user" ON "public"."organization_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_payment_allocations_due" ON "public"."payment_allocations" USING "btree" ("due_id");



CREATE INDEX "idx_payment_allocations_due_reversed" ON "public"."payment_allocations" USING "btree" ("due_id", "reversed_at");



CREATE INDEX "idx_payment_allocations_payment" ON "public"."payment_allocations" USING "btree" ("payment_id");



CREATE INDEX "idx_payment_allocations_payment_reversed" ON "public"."payment_allocations" USING "btree" ("payment_id", "reversed_at");



CREATE UNIQUE INDEX "idx_payments_idempotency" ON "public"."payments" USING "btree" ("organization_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_payments_organization" ON "public"."payments" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "idx_payments_receipt_no" ON "public"."payments" USING "btree" ("organization_id", "receipt_no") WHERE ("receipt_no" IS NOT NULL);



CREATE UNIQUE INDEX "idx_payments_receipt_number" ON "public"."payments" USING "btree" ("organization_id", "receipt_number") WHERE ("receipt_number" IS NOT NULL);



CREATE INDEX "idx_plan_installments_due" ON "public"."plan_installments" USING "btree" ("due_id");



CREATE INDEX "idx_plan_installments_plan" ON "public"."plan_installments" USING "btree" ("plan_id");



CREATE INDEX "idx_platform_audit_logs_actor" ON "public"."platform_audit_logs" USING "btree" ("actor_id");



CREATE INDEX "idx_platform_audit_logs_org" ON "public"."platform_audit_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_property_import_logs_organization" ON "public"."property_import_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_property_import_logs_resort" ON "public"."property_import_logs" USING "btree" ("property_id");



CREATE UNIQUE INDEX "idx_purchase_orders_number" ON "public"."purchase_orders" USING "btree" ("organization_id", "order_number") WHERE ("order_number" IS NOT NULL);



CREATE INDEX "idx_purchase_orders_organization" ON "public"."purchase_orders" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_purchase_requests_organization" ON "public"."purchase_requests" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_resort_memberships_organization" ON "public"."resort_memberships" USING "btree" ("organization_id");



CREATE INDEX "idx_resort_memberships_user" ON "public"."resort_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_resorts_organization" ON "public"."properties" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "idx_roles_org_key" ON "public"."roles" USING "btree" ("organization_id", "key") WHERE ("organization_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_roles_system_key" ON "public"."roles" USING "btree" ("key") WHERE ("organization_id" IS NULL);



CREATE INDEX "idx_service_charge_allocations_levy" ON "public"."service_charge_allocations" USING "btree" ("levy_id");



CREATE INDEX "idx_service_charge_levies_org" ON "public"."service_charge_levies" USING "btree" ("organization_id", "status");



CREATE UNIQUE INDEX "idx_subscriptions_one_active_per_org" ON "public"."subscriptions" USING "btree" ("organization_id") WHERE ("status" = 'ACTIVE'::"text");



CREATE INDEX "idx_supplier_invoices_organization" ON "public"."supplier_invoices" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_supplier_payment_allocations_invoice" ON "public"."supplier_payment_allocations" USING "btree" ("invoice_id");



CREATE INDEX "idx_supplier_payment_allocations_invoice_reversed" ON "public"."supplier_payment_allocations" USING "btree" ("invoice_id", "reversed_at");



CREATE INDEX "idx_supplier_payment_allocations_payment" ON "public"."supplier_payment_allocations" USING "btree" ("payment_id");



CREATE INDEX "idx_supplier_payment_allocations_payment_reversed" ON "public"."supplier_payment_allocations" USING "btree" ("payment_id", "reversed_at");



CREATE UNIQUE INDEX "idx_supplier_payments_idempotency" ON "public"."supplier_payments" USING "btree" ("organization_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "idx_supplier_payments_voucher_number" ON "public"."supplier_payments" USING "btree" ("organization_id", "voucher_number") WHERE ("voucher_number" IS NOT NULL);



CREATE INDEX "idx_suppliers_organization" ON "public"."suppliers" USING "btree" ("organization_id");



CREATE INDEX "idx_tax_decisions_org" ON "public"."tax_decisions" USING "btree" ("organization_id");



CREATE INDEX "idx_tax_decisions_rule" ON "public"."tax_decisions" USING "btree" ("tax_rule_version_id");



CREATE INDEX "idx_tax_decisions_source" ON "public"."tax_decisions" USING "btree" ("source_type", "source_id");



CREATE INDEX "idx_tax_rule_lookup" ON "public"."tax_rule_versions" USING "btree" ("jurisdiction", "revenue_nature", "effective_from" DESC) WHERE ("status" = 'APPROVED'::"text");



CREATE INDEX "idx_unit_handover_snags_handover" ON "public"."unit_handover_snags" USING "btree" ("handover_id", "status");



CREATE INDEX "idx_unit_handovers_org_status" ON "public"."unit_handovers" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_unit_lease_deposit_events_lease" ON "public"."unit_lease_deposit_events" USING "btree" ("lease_id");



CREATE INDEX "idx_unit_leases_active_unit" ON "public"."unit_leases" USING "btree" ("unit_id") WHERE ("status" = 'ACTIVE'::"text");



CREATE INDEX "idx_unit_leases_organization" ON "public"."unit_leases" USING "btree" ("organization_id");



CREATE INDEX "idx_unit_leases_property" ON "public"."unit_leases" USING "btree" ("property_id");



CREATE INDEX "idx_unit_leases_tenant_member" ON "public"."unit_leases" USING "btree" ("tenant_member_id");



CREATE INDEX "idx_unit_leases_unit" ON "public"."unit_leases" USING "btree" ("unit_id");



CREATE INDEX "idx_unit_ownerships_member" ON "public"."unit_ownerships" USING "btree" ("member_id");



CREATE INDEX "idx_unit_ownerships_unit" ON "public"."unit_ownerships" USING "btree" ("unit_id");



CREATE INDEX "idx_units_building" ON "public"."units" USING "btree" ("building_id");



CREATE INDEX "idx_units_resort" ON "public"."units" USING "btree" ("property_id");



CREATE INDEX "idx_user_role_assignments_org" ON "public"."user_role_assignments" USING "btree" ("organization_id");



CREATE INDEX "idx_user_role_assignments_user" ON "public"."user_role_assignments" USING "btree" ("user_id");



CREATE INDEX "idx_zones_resort" ON "public"."zones" USING "btree" ("property_id");



CREATE UNIQUE INDEX "payment_provider_settings_unique_scope" ON "public"."payment_provider_settings" USING "btree" ("organization_id", COALESCE("property_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "provider", "environment");



CREATE OR REPLACE TRIGGER "trg_bank_statements_updated_at" BEFORE UPDATE ON "public"."bank_statements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_brokers_updated_at" BEFORE UPDATE ON "public"."brokers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_budgets_updated_at" BEFORE UPDATE ON "public"."budgets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_chart_of_accounts_updated_at" BEFORE UPDATE ON "public"."chart_of_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_check_installment_plan_completion" AFTER UPDATE ON "public"."dues" FOR EACH ROW WHEN ((("new"."source_type" = 'INSTALLMENT_PLAN'::"text") AND ("new"."status" = 'PAID'::"text") AND ("old"."status" IS DISTINCT FROM 'PAID'::"text"))) EXECUTE FUNCTION "public"."check_installment_plan_completion"();



CREATE OR REPLACE TRIGGER "trg_coa_audit_log" AFTER INSERT OR UPDATE ON "public"."chart_of_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."log_coa_change"();



CREATE OR REPLACE TRIGGER "trg_coa_lock_after_use" BEFORE UPDATE ON "public"."chart_of_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."lock_coa_after_use"();



CREATE OR REPLACE TRIGGER "trg_coa_no_loop" BEFORE INSERT OR UPDATE OF "parent_id" ON "public"."chart_of_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."check_coa_no_loop"();



CREATE OR REPLACE TRIGGER "trg_coa_prevent_delete_used" BEFORE DELETE ON "public"."chart_of_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_delete_used_coa"();



CREATE OR REPLACE TRIGGER "trg_commissions_updated_at" BEFORE UPDATE ON "public"."commissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_credit_note_immutable" BEFORE UPDATE ON "public"."credit_notes" FOR EACH ROW EXECUTE FUNCTION "public"."trg_credit_note_immutable"();



CREATE OR REPLACE TRIGGER "trg_dues_01_tax_decision" AFTER INSERT ON "public"."dues" FOR EACH ROW EXECUTE FUNCTION "public"."trg_dues_tax_decision"();



CREATE OR REPLACE TRIGGER "trg_dues_post_to_ledger" AFTER INSERT ON "public"."dues" FOR EACH ROW EXECUTE FUNCTION "public"."trg_dues_post_to_ledger"();



CREATE OR REPLACE TRIGGER "trg_dunning_policies_updated_at" BEFORE UPDATE ON "public"."dunning_policies" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_einvoice_documents_updated_at" BEFORE UPDATE ON "public"."einvoice_documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_einvoice_profiles_updated_at" BEFORE UPDATE ON "public"."einvoice_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_fixed_assets_updated_at" BEFORE UPDATE ON "public"."fixed_assets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_input_tax_decision_immutable" BEFORE UPDATE ON "public"."input_tax_decisions" FOR EACH ROW EXECUTE FUNCTION "public"."trg_input_tax_decision_immutable"();



CREATE OR REPLACE TRIGGER "trg_installment_plans_updated_at" BEFORE UPDATE ON "public"."installment_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_member_phones_updated_at" BEFORE UPDATE ON "public"."member_phones" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_members_tax_identity_changed" AFTER UPDATE ON "public"."members" FOR EACH ROW WHEN ((("old"."customer_type" IS DISTINCT FROM "new"."customer_type") OR ("old"."tax_registration_number" IS DISTINCT FROM "new"."tax_registration_number") OR ("old"."identity_document_type" IS DISTINCT FROM "new"."identity_document_type") OR ("old"."identity_document_number" IS DISTINCT FROM "new"."identity_document_number") OR ("old"."identity_verified_at" IS DISTINCT FROM "new"."identity_verified_at"))) EXECUTE FUNCTION "public"."trg_members_tax_identity_changed"();



CREATE OR REPLACE TRIGGER "trg_members_updated_at" BEFORE UPDATE ON "public"."members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_online_txn_immutable" BEFORE UPDATE ON "public"."online_payment_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."forbid_online_txn_mutation_after_pending"();



CREATE OR REPLACE TRIGGER "trg_online_txn_updated_at" BEFORE UPDATE ON "public"."online_payment_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_organization_finance_settings_updated_at" BEFORE UPDATE ON "public"."organization_finance_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_organizations_tax_identity_changed" AFTER UPDATE ON "public"."organizations" FOR EACH ROW WHEN (("old"."tax_id" IS DISTINCT FROM "new"."tax_id")) EXECUTE FUNCTION "public"."trg_organizations_tax_identity_changed"();



CREATE OR REPLACE TRIGGER "trg_organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_payment_provider_settings_updated_at" BEFORE UPDATE ON "public"."payment_provider_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prevent_uncancel_supplier_invoice" BEFORE UPDATE ON "public"."supplier_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_uncancel_supplier_invoice"();



CREATE OR REPLACE TRIGGER "trg_prevent_unreverse_allocation" BEFORE UPDATE ON "public"."payment_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_unreverse_payment_allocation"();



CREATE OR REPLACE TRIGGER "trg_prevent_unreverse_payment" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_unreverse_payment"();



CREATE OR REPLACE TRIGGER "trg_prevent_unreverse_supplier_payment" BEFORE UPDATE ON "public"."supplier_payments" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_unreverse_supplier_payment"();



CREATE OR REPLACE TRIGGER "trg_prevent_unreverse_supplier_payment_allocation" BEFORE UPDATE ON "public"."supplier_payment_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_unreverse_supplier_payment_allocation"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_resorts_updated_at" BEFORE UPDATE ON "public"."properties" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_service_charge_levies_updated_at" BEFORE UPDATE ON "public"."service_charge_levies" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_member_primary_phone" AFTER INSERT OR DELETE OR UPDATE ON "public"."member_phones" FOR EACH ROW EXECUTE FUNCTION "public"."sync_member_primary_phone"();



CREATE OR REPLACE TRIGGER "trg_tax_decision_immutable" BEFORE UPDATE ON "public"."tax_decisions" FOR EACH ROW EXECUTE FUNCTION "public"."trg_tax_decision_immutable"();



CREATE OR REPLACE TRIGGER "trg_tax_rule_immutable" BEFORE DELETE OR UPDATE ON "public"."tax_rule_versions" FOR EACH ROW EXECUTE FUNCTION "public"."trg_tax_rule_immutable"();



CREATE OR REPLACE TRIGGER "trg_tax_rule_set_hash" BEFORE INSERT OR UPDATE ON "public"."tax_rule_versions" FOR EACH ROW EXECUTE FUNCTION "public"."trg_tax_rule_set_hash"();



CREATE OR REPLACE TRIGGER "trg_tenant_branding_updated_at" BEFORE UPDATE ON "public"."tenant_branding" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_unit_handovers_updated_at" BEFORE UPDATE ON "public"."unit_handovers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_unit_leases_updated_at" BEFORE UPDATE ON "public"."unit_leases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_units_updated_at" BEFORE UPDATE ON "public"."units" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_validate_online_payments_clearing_account" BEFORE INSERT OR UPDATE ON "public"."organization_finance_settings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_online_payments_clearing_account"();



CREATE OR REPLACE TRIGGER "trg_validate_payment_provider_settings_scope" BEFORE INSERT OR UPDATE ON "public"."payment_provider_settings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_payment_provider_settings_scope"();



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "public"."banks"("id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_statement_lines"
    ADD CONSTRAINT "bank_statement_lines_matched_by_fkey" FOREIGN KEY ("matched_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bank_statement_lines"
    ADD CONSTRAINT "bank_statement_lines_matched_journal_entry_line_id_fkey" FOREIGN KEY ("matched_journal_entry_line_id") REFERENCES "public"."journal_entry_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bank_statement_lines"
    ADD CONSTRAINT "bank_statement_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_statement_lines"
    ADD CONSTRAINT "bank_statement_lines_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "public"."bank_statements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_statements"
    ADD CONSTRAINT "bank_statements_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_statements"
    ADD CONSTRAINT "bank_statements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."bank_statements"
    ADD CONSTRAINT "bank_statements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bank_statements"
    ADD CONSTRAINT "bank_statements_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."banks"
    ADD CONSTRAINT "banks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."brokers"
    ADD CONSTRAINT "brokers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."brokers"
    ADD CONSTRAINT "brokers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "public"."fiscal_periods"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id");



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."cashier_sessions"("id");



ALTER TABLE ONLY "public"."cashboxes"
    ADD CONSTRAINT "cashboxes_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."cashboxes"
    ADD CONSTRAINT "cashboxes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cashboxes"
    ADD CONSTRAINT "cashboxes_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cashier_sessions"
    ADD CONSTRAINT "cashier_sessions_cashbox_id_fkey" FOREIGN KEY ("cashbox_id") REFERENCES "public"."cashboxes"("id");



ALTER TABLE ONLY "public"."cashier_sessions"
    ADD CONSTRAINT "cashier_sessions_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cashier_sessions"
    ADD CONSTRAINT "cashier_sessions_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cashier_sessions"
    ADD CONSTRAINT "cashier_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cashier_sessions"
    ADD CONSTRAINT "cashier_sessions_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalogue_items"
    ADD CONSTRAINT "catalogue_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."chart_of_accounts"
    ADD CONSTRAINT "chart_of_accounts_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cheque_status_history"
    ADD CONSTRAINT "cheque_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cheque_status_history"
    ADD CONSTRAINT "cheque_status_history_cheque_id_fkey" FOREIGN KEY ("cheque_id") REFERENCES "public"."cheques"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cheques"
    ADD CONSTRAINT "cheques_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id");



ALTER TABLE ONLY "public"."cheques"
    ADD CONSTRAINT "cheques_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cheques"
    ADD CONSTRAINT "cheques_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."cheques"
    ADD CONSTRAINT "cheques_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cheques"
    ADD CONSTRAINT "cheques_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id");



ALTER TABLE ONLY "public"."cheques"
    ADD CONSTRAINT "cheques_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coa_template_accounts"
    ADD CONSTRAINT "coa_template_accounts_template_key_fkey" FOREIGN KEY ("template_key") REFERENCES "public"."coa_templates"("key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_accrual_journal_entry_id_fkey" FOREIGN KEY ("accrual_journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_installment_plan_id_fkey" FOREIGN KEY ("installment_plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "public"."unit_leases"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_payment_journal_entry_id_fkey" FOREIGN KEY ("payment_journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commissions"
    ADD CONSTRAINT "commissions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_tax_decision_id_fkey" FOREIGN KEY ("tax_decision_id") REFERENCES "public"."tax_decisions"("id");



ALTER TABLE ONLY "public"."document_number_counters"
    ADD CONSTRAINT "document_number_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_numbers"
    ADD CONSTRAINT "document_numbers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_sequences"
    ADD CONSTRAINT "document_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_sequences"
    ADD CONSTRAINT "document_sequences_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."due_generation_runs"
    ADD CONSTRAINT "due_generation_runs_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."due_generation_runs"
    ADD CONSTRAINT "due_generation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."due_generation_runs"
    ADD CONSTRAINT "due_generation_runs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."due_schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."due_schedules"
    ADD CONSTRAINT "due_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."due_schedules"
    ADD CONSTRAINT "due_schedules_due_type_id_fkey" FOREIGN KEY ("due_type_id") REFERENCES "public"."due_types"("id");



ALTER TABLE ONLY "public"."due_schedules"
    ADD CONSTRAINT "due_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."due_schedules"
    ADD CONSTRAINT "due_schedules_receivable_account_id_fkey" FOREIGN KEY ("receivable_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."due_schedules"
    ADD CONSTRAINT "due_schedules_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."due_type_revenue_natures"
    ADD CONSTRAINT "due_type_revenue_natures_due_type_id_fkey" FOREIGN KEY ("due_type_id") REFERENCES "public"."due_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."due_type_revenue_natures"
    ADD CONSTRAINT "due_type_revenue_natures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."due_type_revenue_natures"
    ADD CONSTRAINT "due_type_revenue_natures_revenue_nature_fkey" FOREIGN KEY ("revenue_nature") REFERENCES "public"."revenue_natures"("code");



ALTER TABLE ONLY "public"."due_types"
    ADD CONSTRAINT "due_types_catalogue_item_id_fkey" FOREIGN KEY ("catalogue_item_id") REFERENCES "public"."catalogue_items"("id");



ALTER TABLE ONLY "public"."due_types"
    ADD CONSTRAINT "due_types_default_revenue_account_id_fkey" FOREIGN KEY ("default_revenue_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."due_types"
    ADD CONSTRAINT "due_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dues"
    ADD CONSTRAINT "dues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."dues"
    ADD CONSTRAINT "dues_due_type_id_fkey" FOREIGN KEY ("due_type_id") REFERENCES "public"."due_types"("id");



ALTER TABLE ONLY "public"."dues"
    ADD CONSTRAINT "dues_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."dues"
    ADD CONSTRAINT "dues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dues"
    ADD CONSTRAINT "dues_receivable_account_id_fkey" FOREIGN KEY ("receivable_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."dues"
    ADD CONSTRAINT "dues_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dues"
    ADD CONSTRAINT "dues_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id");



ALTER TABLE ONLY "public"."dunning_notices"
    ADD CONSTRAINT "dunning_notices_due_id_fkey" FOREIGN KEY ("due_id") REFERENCES "public"."dues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dunning_notices"
    ADD CONSTRAINT "dunning_notices_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dunning_notices"
    ADD CONSTRAINT "dunning_notices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dunning_notices"
    ADD CONSTRAINT "dunning_notices_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."dunning_policies"
    ADD CONSTRAINT "dunning_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."einvoice_documents"
    ADD CONSTRAINT "einvoice_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."einvoice_documents"
    ADD CONSTRAINT "einvoice_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."einvoice_documents"
    ADD CONSTRAINT "einvoice_documents_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."einvoice_profiles"("id");



ALTER TABLE ONLY "public"."einvoice_profiles"
    ADD CONSTRAINT "einvoice_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."einvoice_profiles"
    ADD CONSTRAINT "einvoice_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."einvoice_profiles"
    ADD CONSTRAINT "einvoice_profiles_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."einvoice_profiles"
    ADD CONSTRAINT "einvoice_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."einvoice_submission_attempts"
    ADD CONSTRAINT "einvoice_submission_attempts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."einvoice_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."einvoice_submission_attempts"
    ADD CONSTRAINT "einvoice_submission_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exchange_rates"
    ADD CONSTRAINT "exchange_rates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."exchange_rates"
    ADD CONSTRAINT "exchange_rates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_account_input_tax"
    ADD CONSTRAINT "expense_account_input_tax_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_account_input_tax"
    ADD CONSTRAINT "expense_account_input_tax_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_default_expense_account_id_fkey" FOREIGN KEY ("default_expense_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_cashier_session_id_fkey" FOREIGN KEY ("cashier_session_id") REFERENCES "public"."cashier_sessions"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_expense_category_id_fkey" FOREIGN KEY ("expense_category_id") REFERENCES "public"."expense_categories"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_audit_logs"
    ADD CONSTRAINT "financial_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."financial_audit_logs"
    ADD CONSTRAINT "financial_audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_audit_logs"
    ADD CONSTRAINT "financial_audit_logs_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fiscal_periods"
    ADD CONSTRAINT "fiscal_periods_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "public"."fiscal_years"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fiscal_periods"
    ADD CONSTRAINT "fiscal_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fiscal_years"
    ADD CONSTRAINT "fiscal_years_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fixed_asset_depreciation"
    ADD CONSTRAINT "fixed_asset_depreciation_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "public"."fiscal_periods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."fixed_asset_depreciation"
    ADD CONSTRAINT "fixed_asset_depreciation_fixed_asset_id_fkey" FOREIGN KEY ("fixed_asset_id") REFERENCES "public"."fixed_assets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fixed_asset_depreciation"
    ADD CONSTRAINT "fixed_asset_depreciation_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."fixed_asset_depreciation"
    ADD CONSTRAINT "fixed_asset_depreciation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fixed_asset_depreciation"
    ADD CONSTRAINT "fixed_asset_depreciation_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_accumulated_depreciation_account_id_fkey" FOREIGN KEY ("accumulated_depreciation_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_asset_account_id_fkey" FOREIGN KEY ("asset_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_depreciation_expense_account_id_fkey" FOREIGN KEY ("depreciation_expense_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."input_tax_decisions"
    ADD CONSTRAINT "input_tax_decisions_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."input_tax_decisions"
    ADD CONSTRAINT "input_tax_decisions_input_tax_account_id_fkey" FOREIGN KEY ("input_tax_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."input_tax_decisions"
    ADD CONSTRAINT "input_tax_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."input_tax_decisions"
    ADD CONSTRAINT "input_tax_decisions_replaces_decision_id_fkey" FOREIGN KEY ("replaces_decision_id") REFERENCES "public"."input_tax_decisions"("id");



ALTER TABLE ONLY "public"."input_tax_decisions"
    ADD CONSTRAINT "input_tax_decisions_reverses_decision_id_fkey" FOREIGN KEY ("reverses_decision_id") REFERENCES "public"."input_tax_decisions"("id");



ALTER TABLE ONLY "public"."input_tax_decisions"
    ADD CONSTRAINT "input_tax_decisions_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."installment_plans"
    ADD CONSTRAINT "installment_plans_buyer_member_id_fkey" FOREIGN KEY ("buyer_member_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."installment_plans"
    ADD CONSTRAINT "installment_plans_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."installment_plans"
    ADD CONSTRAINT "installment_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."installment_plans"
    ADD CONSTRAINT "installment_plans_due_type_id_fkey" FOREIGN KEY ("due_type_id") REFERENCES "public"."due_types"("id");



ALTER TABLE ONLY "public"."installment_plans"
    ADD CONSTRAINT "installment_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."installment_plans"
    ADD CONSTRAINT "installment_plans_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."installment_plans"
    ADD CONSTRAINT "installment_plans_receivable_account_id_fkey" FOREIGN KEY ("receivable_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."installment_plans"
    ADD CONSTRAINT "installment_plans_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "public"."fiscal_periods"("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_reversed_entry_id_fkey" FOREIGN KEY ("reversed_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id");



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."journal_entry_lines"
    ADD CONSTRAINT "journal_entry_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lease_rent_generation_runs"
    ADD CONSTRAINT "lease_rent_generation_runs_due_id_fkey" FOREIGN KEY ("due_id") REFERENCES "public"."dues"("id");



ALTER TABLE ONLY "public"."lease_rent_generation_runs"
    ADD CONSTRAINT "lease_rent_generation_runs_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."lease_rent_generation_runs"
    ADD CONSTRAINT "lease_rent_generation_runs_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "public"."unit_leases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lease_rent_generation_runs"
    ADD CONSTRAINT "lease_rent_generation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_activity_log"
    ADD CONSTRAINT "member_activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."member_activity_log"
    ADD CONSTRAINT "member_activity_log_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_activity_log"
    ADD CONSTRAINT "member_activity_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_documents"
    ADD CONSTRAINT "member_documents_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_documents"
    ADD CONSTRAINT "member_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_documents"
    ADD CONSTRAINT "member_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."member_invitation_short_links"
    ADD CONSTRAINT "member_invitation_short_links_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."member_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_invitations"
    ADD CONSTRAINT "member_invitations_accepted_user_id_fkey" FOREIGN KEY ("accepted_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."member_invitations"
    ADD CONSTRAINT "member_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."member_invitations"
    ADD CONSTRAINT "member_invitations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_invitations"
    ADD CONSTRAINT "member_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_phones"
    ADD CONSTRAINT "member_phones_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_phones"
    ADD CONSTRAINT "member_phones_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_saved_filters"
    ADD CONSTRAINT "member_saved_filters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."member_saved_filters"
    ADD CONSTRAINT "member_saved_filters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_tag_assignments"
    ADD CONSTRAINT "member_tag_assignments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_tag_assignments"
    ADD CONSTRAINT "member_tag_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_tag_assignments"
    ADD CONSTRAINT "member_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."member_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."member_tags"
    ADD CONSTRAINT "member_tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."members"
    ADD CONSTRAINT "members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."online_payment_transaction_allocations"
    ADD CONSTRAINT "online_payment_transaction_allocations_due_id_fkey" FOREIGN KEY ("due_id") REFERENCES "public"."dues"("id");



ALTER TABLE ONLY "public"."online_payment_transaction_allocations"
    ADD CONSTRAINT "online_payment_transaction_allocations_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."online_payment_transactions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."online_payment_transactions"
    ADD CONSTRAINT "online_payment_transactions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."online_payment_transactions"
    ADD CONSTRAINT "online_payment_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."online_payment_transactions"
    ADD CONSTRAINT "online_payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id");



ALTER TABLE ONLY "public"."online_payment_transactions"
    ADD CONSTRAINT "online_payment_transactions_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_finance_settings"
    ADD CONSTRAINT "organization_finance_settings_commission_expense_account_i_fkey" FOREIGN KEY ("commission_expense_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."organization_finance_settings"
    ADD CONSTRAINT "organization_finance_settings_commission_payable_account_i_fkey" FOREIGN KEY ("commission_payable_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."organization_finance_settings"
    ADD CONSTRAINT "organization_finance_settings_online_payments_clearing_acc_fkey" FOREIGN KEY ("online_payments_clearing_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."organization_finance_settings"
    ADD CONSTRAINT "organization_finance_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_finance_settings"
    ADD CONSTRAINT "organization_finance_settings_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_finance_settings"
    ADD CONSTRAINT "organization_finance_settings_security_deposit_liability_a_fkey" FOREIGN KEY ("security_deposit_liability_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_asset_disposal_gain_account_id_fkey" FOREIGN KEY ("asset_disposal_gain_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_asset_disposal_loss_account_id_fkey" FOREIGN KEY ("asset_disposal_loss_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_fx_gain_account_id_fkey" FOREIGN KEY ("fx_gain_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_fx_loss_account_id_fkey" FOREIGN KEY ("fx_loss_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_input_tax_account_id_fkey" FOREIGN KEY ("input_tax_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_output_tax_account_id_fkey" FOREIGN KEY ("output_tax_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_due_id_fkey" FOREIGN KEY ("due_id") REFERENCES "public"."dues"("id");



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_allocations"
    ADD CONSTRAINT "payment_allocations_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payment_provider_settings"
    ADD CONSTRAINT "payment_provider_settings_api_key_secret_id_fkey" FOREIGN KEY ("api_key_secret_id") REFERENCES "vault"."secrets"("id");



ALTER TABLE ONLY "public"."payment_provider_settings"
    ADD CONSTRAINT "payment_provider_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payment_provider_settings"
    ADD CONSTRAINT "payment_provider_settings_hmac_secret_id_fkey" FOREIGN KEY ("hmac_secret_id") REFERENCES "vault"."secrets"("id");



ALTER TABLE ONLY "public"."payment_provider_settings"
    ADD CONSTRAINT "payment_provider_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_provider_settings"
    ADD CONSTRAINT "payment_provider_settings_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_provider_settings"
    ADD CONSTRAINT "payment_provider_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_deposit_account_id_fkey" FOREIGN KEY ("deposit_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id");



ALTER TABLE ONLY "public"."plan_entitlements"
    ADD CONSTRAINT "plan_entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_installments"
    ADD CONSTRAINT "plan_installments_due_id_fkey" FOREIGN KEY ("due_id") REFERENCES "public"."dues"("id");



ALTER TABLE ONLY "public"."plan_installments"
    ADD CONSTRAINT "plan_installments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."platform_audit_logs"
    ADD CONSTRAINT "platform_audit_logs_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_cost_of_sales_account_id_fkey" FOREIGN KEY ("cost_of_sales_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_wip_account_id_fkey" FOREIGN KEY ("wip_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."property_import_logs"
    ADD CONSTRAINT "property_import_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."property_import_logs"
    ADD CONSTRAINT "property_import_logs_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."purchase_requests"
    ADD CONSTRAINT "purchase_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."purchase_requests"
    ADD CONSTRAINT "purchase_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_requests"
    ADD CONSTRAINT "purchase_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."purchase_requests"
    ADD CONSTRAINT "purchase_requests_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resort_memberships"
    ADD CONSTRAINT "resort_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resort_memberships"
    ADD CONSTRAINT "resort_memberships_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resort_memberships"
    ADD CONSTRAINT "resort_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "resorts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "resorts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."properties"
    ADD CONSTRAINT "resorts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_template_permissions"
    ADD CONSTRAINT "role_template_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_template_permissions"
    ADD CONSTRAINT "role_template_permissions_role_template_key_fkey" FOREIGN KEY ("role_template_key") REFERENCES "public"."role_templates"("key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_charge_allocations"
    ADD CONSTRAINT "service_charge_allocations_due_id_fkey" FOREIGN KEY ("due_id") REFERENCES "public"."dues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_charge_allocations"
    ADD CONSTRAINT "service_charge_allocations_levy_id_fkey" FOREIGN KEY ("levy_id") REFERENCES "public"."service_charge_levies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_charge_allocations"
    ADD CONSTRAINT "service_charge_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_charge_allocations"
    ADD CONSTRAINT "service_charge_allocations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_charge_levies"
    ADD CONSTRAINT "service_charge_levies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."service_charge_levies"
    ADD CONSTRAINT "service_charge_levies_due_type_id_fkey" FOREIGN KEY ("due_type_id") REFERENCES "public"."due_types"("id");



ALTER TABLE ONLY "public"."service_charge_levies"
    ADD CONSTRAINT "service_charge_levies_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."service_charge_levies"
    ADD CONSTRAINT "service_charge_levies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_charge_levies"
    ADD CONSTRAINT "service_charge_levies_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_charge_levies"
    ADD CONSTRAINT "service_charge_levies_receivable_account_id_fkey" FOREIGN KEY ("receivable_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_payable_account_id_fkey" FOREIGN KEY ("payable_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_vat_account_id_fkey" FOREIGN KEY ("vat_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."supplier_invoices"
    ADD CONSTRAINT "supplier_invoices_wht_account_id_fkey" FOREIGN KEY ("wht_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."supplier_payment_allocations"
    ADD CONSTRAINT "supplier_payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."supplier_invoices"("id");



ALTER TABLE ONLY "public"."supplier_payment_allocations"
    ADD CONSTRAINT "supplier_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."supplier_payments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_payment_allocations"
    ADD CONSTRAINT "supplier_payment_allocations_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_cashier_session_id_fkey" FOREIGN KEY ("cashier_session_id") REFERENCES "public"."cashier_sessions"("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."supplier_payments"
    ADD CONSTRAINT "supplier_payments_wht_account_id_fkey" FOREIGN KEY ("wht_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_payable_account_id_fkey" FOREIGN KEY ("payable_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."tax_decisions"
    ADD CONSTRAINT "tax_decisions_buyer_member_id_fkey" FOREIGN KEY ("buyer_member_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."tax_decisions"
    ADD CONSTRAINT "tax_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tax_decisions"
    ADD CONSTRAINT "tax_decisions_output_tax_account_id_fkey" FOREIGN KEY ("output_tax_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."tax_decisions"
    ADD CONSTRAINT "tax_decisions_replaces_decision_id_fkey" FOREIGN KEY ("replaces_decision_id") REFERENCES "public"."tax_decisions"("id");



ALTER TABLE ONLY "public"."tax_decisions"
    ADD CONSTRAINT "tax_decisions_revenue_nature_fkey" FOREIGN KEY ("revenue_nature") REFERENCES "public"."revenue_natures"("code");



ALTER TABLE ONLY "public"."tax_decisions"
    ADD CONSTRAINT "tax_decisions_reverses_decision_id_fkey" FOREIGN KEY ("reverses_decision_id") REFERENCES "public"."tax_decisions"("id");



ALTER TABLE ONLY "public"."tax_decisions"
    ADD CONSTRAINT "tax_decisions_tax_rule_version_id_fkey" FOREIGN KEY ("tax_rule_version_id") REFERENCES "public"."tax_rule_versions"("id");



ALTER TABLE ONLY "public"."tax_rule_versions"
    ADD CONSTRAINT "tax_rule_versions_revenue_nature_fkey" FOREIGN KEY ("revenue_nature") REFERENCES "public"."revenue_natures"("code");



ALTER TABLE ONLY "public"."tenant_branding"
    ADD CONSTRAINT "tenant_branding_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_feature_flags"
    ADD CONSTRAINT "tenant_feature_flags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_handover_snags"
    ADD CONSTRAINT "unit_handover_snags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."unit_handover_snags"
    ADD CONSTRAINT "unit_handover_snags_handover_id_fkey" FOREIGN KEY ("handover_id") REFERENCES "public"."unit_handovers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_handover_snags"
    ADD CONSTRAINT "unit_handover_snags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_handover_snags"
    ADD CONSTRAINT "unit_handover_snags_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."unit_handovers"
    ADD CONSTRAINT "unit_handovers_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."unit_handovers"
    ADD CONSTRAINT "unit_handovers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."unit_handovers"
    ADD CONSTRAINT "unit_handovers_handed_to_member_id_fkey" FOREIGN KEY ("handed_to_member_id") REFERENCES "public"."members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."unit_handovers"
    ADD CONSTRAINT "unit_handovers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_handovers"
    ADD CONSTRAINT "unit_handovers_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_handovers"
    ADD CONSTRAINT "unit_handovers_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_lease_deposit_events"
    ADD CONSTRAINT "unit_lease_deposit_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."unit_lease_deposit_events"
    ADD CONSTRAINT "unit_lease_deposit_events_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id");



ALTER TABLE ONLY "public"."unit_lease_deposit_events"
    ADD CONSTRAINT "unit_lease_deposit_events_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "public"."unit_leases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_lease_deposit_events"
    ADD CONSTRAINT "unit_lease_deposit_events_settlement_account_id_fkey" FOREIGN KEY ("settlement_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."unit_leases"
    ADD CONSTRAINT "unit_leases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."unit_leases"
    ADD CONSTRAINT "unit_leases_due_type_id_fkey" FOREIGN KEY ("due_type_id") REFERENCES "public"."due_types"("id");



ALTER TABLE ONLY "public"."unit_leases"
    ADD CONSTRAINT "unit_leases_ended_by_fkey" FOREIGN KEY ("ended_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."unit_leases"
    ADD CONSTRAINT "unit_leases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_leases"
    ADD CONSTRAINT "unit_leases_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_leases"
    ADD CONSTRAINT "unit_leases_receivable_account_id_fkey" FOREIGN KEY ("receivable_account_id") REFERENCES "public"."chart_of_accounts"("id");



ALTER TABLE ONLY "public"."unit_leases"
    ADD CONSTRAINT "unit_leases_tenant_member_id_fkey" FOREIGN KEY ("tenant_member_id") REFERENCES "public"."members"("id");



ALTER TABLE ONLY "public"."unit_leases"
    ADD CONSTRAINT "unit_leases_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_ownerships"
    ADD CONSTRAINT "unit_ownerships_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."unit_ownerships"
    ADD CONSTRAINT "unit_ownerships_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_ownerships"
    ADD CONSTRAINT "unit_ownerships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."unit_ownerships"
    ADD CONSTRAINT "unit_ownerships_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."zones"
    ADD CONSTRAINT "zones_resort_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE CASCADE;



CREATE POLICY "Admins and managers can read financial audit logs" ON "public"."financial_audit_logs" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_memberships" "om"
  WHERE (("om"."organization_id" = "financial_audit_logs"."organization_id") AND ("om"."user_id" = "auth"."uid"()) AND ("om"."status" = 'active'::"text")))));



ALTER TABLE "public"."bank_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_accounts_manage" ON "public"."bank_accounts" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "bank_accounts_select_member" ON "public"."bank_accounts" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."bank_statement_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_statement_lines_manage" ON "public"."bank_statement_lines" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.bank_reconciliation.manage'::"text") AND "public"."organization_is_active"("organization_id") AND (EXISTS ( SELECT 1
   FROM "public"."bank_statements" "s"
  WHERE (("s"."id" = "bank_statement_lines"."statement_id") AND ("s"."status" = 'DRAFT'::"text")))))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.bank_reconciliation.manage'::"text") AND "public"."organization_is_active"("organization_id") AND (EXISTS ( SELECT 1
   FROM "public"."bank_statements" "s"
  WHERE (("s"."id" = "bank_statement_lines"."statement_id") AND ("s"."status" = 'DRAFT'::"text"))))));



CREATE POLICY "bank_statement_lines_select" ON "public"."bank_statement_lines" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.bank_reconciliation.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.bank_reconciliation.manage'::"text")));



ALTER TABLE "public"."bank_statements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bank_statements_manage" ON "public"."bank_statements" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.bank_reconciliation.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.bank_reconciliation.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "bank_statements_select" ON "public"."bank_statements" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.bank_reconciliation.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.bank_reconciliation.manage'::"text")));



ALTER TABLE "public"."banks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "banks_manage" ON "public"."banks" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "banks_select_member" ON "public"."banks" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."brokers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "brokers_manage" ON "public"."brokers" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.commissions.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.commissions.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "brokers_select" ON "public"."brokers" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.commissions.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.commissions.manage'::"text")));



ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budgets_manage" ON "public"."budgets" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.budgets.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.budgets.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "budgets_select_member" ON "public"."budgets" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."buildings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "buildings_manage" ON "public"."buildings" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.units.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.units.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "buildings_select_member" ON "public"."buildings" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."cash_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cash_transactions_select_member" ON "public"."cash_transactions" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."cashboxes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cashboxes_manage" ON "public"."cashboxes" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "cashboxes_select_member" ON "public"."cashboxes" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."cashier_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cashier_sessions_select_member" ON "public"."cashier_sessions" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."catalogue_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "catalogue_items_select" ON "public"."catalogue_items" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.manage'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.tax_mapping.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.tax_mapping.manage'::"text")));



ALTER TABLE "public"."chart_of_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chart_of_accounts_manage" ON "public"."chart_of_accounts" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "chart_of_accounts_select_member" ON "public"."chart_of_accounts" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."cheque_status_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cheque_status_history_select_member" ON "public"."cheque_status_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."cheques" "c"
  WHERE (("c"."id" = "cheque_status_history"."cheque_id") AND "public"."is_org_member"("auth"."uid"(), "c"."organization_id")))));



ALTER TABLE "public"."cheques" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cheques_select_member" ON "public"."cheques" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."coa_template_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coa_template_accounts_select_authenticated" ON "public"."coa_template_accounts" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."coa_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "coa_templates_select_authenticated" ON "public"."coa_templates" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."commissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "commissions_select" ON "public"."commissions" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.commissions.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.commissions.manage'::"text")));



ALTER TABLE "public"."contact_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contact_requests_select_platform_admin" ON "public"."contact_requests" FOR SELECT USING ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "contact_requests_update_platform_admin" ON "public"."contact_requests" FOR UPDATE USING ("public"."is_platform_admin"("auth"."uid"())) WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



ALTER TABLE "public"."cost_centers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cost_centers_manage" ON "public"."cost_centers" USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text")) WITH CHECK ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text"));



CREATE POLICY "cost_centers_select_member" ON "public"."cost_centers" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."credit_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_notes_select" ON "public"."credit_notes" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.dues.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.manage'::"text")));



ALTER TABLE "public"."demo_leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "demo_leads_select_platform_admin" ON "public"."demo_leads" FOR SELECT USING ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "demo_leads_update_platform_admin" ON "public"."demo_leads" FOR UPDATE USING ("public"."is_platform_admin"("auth"."uid"())) WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



ALTER TABLE "public"."document_number_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_numbers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_numbers_select" ON "public"."document_numbers" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.manage'::"text")));



ALTER TABLE "public"."document_sequences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."due_generation_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "due_generation_runs_select_permission" ON "public"."due_generation_runs" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.schedules.read'::"text"));



ALTER TABLE "public"."due_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "due_schedules_manage" ON "public"."due_schedules" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.schedules.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.schedules.manage'::"text") AND "public"."organization_is_active"("organization_id") AND (EXISTS ( SELECT 1
   FROM "public"."properties" "r"
  WHERE (("r"."id" = "due_schedules"."property_id") AND ("r"."organization_id" = "due_schedules"."organization_id"))))));



CREATE POLICY "due_schedules_select_permission" ON "public"."due_schedules" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.schedules.read'::"text"));



ALTER TABLE "public"."due_type_revenue_natures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "due_type_revenue_natures_select" ON "public"."due_type_revenue_natures" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.tax_mapping.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.tax_mapping.manage'::"text")));



ALTER TABLE "public"."due_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "due_types_manage" ON "public"."due_types" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "due_types_select_member" ON "public"."due_types" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."dues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dues_select_own" ON "public"."dues" FOR SELECT USING (("public"."organization_is_active"("organization_id") AND ("unit_id" IN ( SELECT "unit_ownerships"."unit_id"
   FROM "public"."unit_ownerships"
  WHERE (("unit_ownerships"."member_id" = "public"."current_member_id"()) AND (("unit_ownerships"."end_date" IS NULL) OR ("unit_ownerships"."end_date" >= CURRENT_DATE)))))));



CREATE POLICY "dues_select_own_via_installment_plan" ON "public"."dues" FOR SELECT USING ((("source_type" = 'INSTALLMENT_PLAN'::"text") AND ("source_id" IN ( SELECT "pi"."id"
   FROM ("public"."plan_installments" "pi"
     JOIN "public"."installment_plans" "p" ON (("p"."id" = "pi"."plan_id")))
  WHERE ("p"."buyer_member_id" = "public"."current_member_id"())))));



CREATE POLICY "dues_select_own_via_lease" ON "public"."dues" FOR SELECT USING ((("source_type" = 'LEASE_RENT'::"text") AND ("source_id" IN ( SELECT "unit_leases"."id"
   FROM "public"."unit_leases"
  WHERE ("unit_leases"."tenant_member_id" = "public"."current_member_id"())))));



CREATE POLICY "dues_select_permission" ON "public"."dues" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.dues.read'::"text"));



ALTER TABLE "public"."dunning_notices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dunning_notices_select" ON "public"."dunning_notices" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.dunning.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.dunning.manage'::"text")));



ALTER TABLE "public"."dunning_policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dunning_policies_manage" ON "public"."dunning_policies" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.dunning.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.dunning.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "dunning_policies_select" ON "public"."dunning_policies" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.dunning.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.dunning.manage'::"text")));



CREATE POLICY "einvoice_attempts_select" ON "public"."einvoice_submission_attempts" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.manage'::"text")));



ALTER TABLE "public"."einvoice_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "einvoice_documents_select" ON "public"."einvoice_documents" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.manage'::"text")));



ALTER TABLE "public"."einvoice_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "einvoice_profiles_select" ON "public"."einvoice_profiles" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.einvoice.manage'::"text")));



ALTER TABLE "public"."einvoice_submission_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exchange_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exchange_rates_manage" ON "public"."exchange_rates" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.fx.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.fx.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "exchange_rates_select" ON "public"."exchange_rates" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.fx.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.fx.manage'::"text")));



ALTER TABLE "public"."expense_account_input_tax" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_account_input_tax_select" ON "public"."expense_account_input_tax" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.view'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text")));



ALTER TABLE "public"."expense_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_categories_manage" ON "public"."expense_categories" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "expense_categories_select_member" ON "public"."expense_categories" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_select_permission" ON "public"."expenses" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.expenses.read'::"text"));



CREATE POLICY "fad_select" ON "public"."fixed_asset_depreciation" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.assets.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.assets.manage'::"text")));



ALTER TABLE "public"."financial_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fiscal_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fiscal_periods_manage" ON "public"."fiscal_periods" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.periods.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.periods.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "fiscal_periods_select_member" ON "public"."fiscal_periods" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."fiscal_years" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fiscal_years_manage" ON "public"."fiscal_years" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.periods.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.periods.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "fiscal_years_select_member" ON "public"."fiscal_years" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."fixed_asset_depreciation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fixed_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fixed_assets_manage" ON "public"."fixed_assets" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.assets.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.assets.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "fixed_assets_select" ON "public"."fixed_assets" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.assets.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.assets.manage'::"text")));



ALTER TABLE "public"."input_tax_decisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "input_tax_decisions_select" ON "public"."input_tax_decisions" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.view'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text")));



ALTER TABLE "public"."installment_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "installment_plans_select_own" ON "public"."installment_plans" FOR SELECT USING ((("buyer_member_id" = "public"."current_member_id"()) AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "installment_plans_select_staff" ON "public"."installment_plans" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.installments.view'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'property.installments.manage'::"text")));



ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "journal_entries_select_permission" ON "public"."journal_entries" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.reports.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.entries.create'::"text")));



ALTER TABLE "public"."journal_entry_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "journal_entry_lines_select_member" ON "public"."journal_entry_lines" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."journal_entries" "je"
  WHERE (("je"."id" = "journal_entry_lines"."journal_entry_id") AND "public"."is_org_member"("auth"."uid"(), "je"."organization_id")))));



ALTER TABLE "public"."lease_rent_generation_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lease_rent_generation_runs_select_permission" ON "public"."lease_rent_generation_runs" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.schedules.read'::"text"));



ALTER TABLE "public"."member_activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_activity_log_manage" ON "public"."member_activity_log" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "member_activity_log_select_member" ON "public"."member_activity_log" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."member_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_documents_manage" ON "public"."member_documents" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "member_documents_select_member" ON "public"."member_documents" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."member_invitation_short_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."member_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."member_phones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_phones_delete" ON "public"."member_phones" FOR DELETE USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text"));



CREATE POLICY "member_phones_insert" ON "public"."member_phones" FOR INSERT WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."is_org_member"("auth"."uid"(), "organization_id")));



CREATE POLICY "member_phones_select" ON "public"."member_phones" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.view'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text")));



CREATE POLICY "member_phones_update" ON "public"."member_phones" FOR UPDATE USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text")) WITH CHECK ("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text"));



ALTER TABLE "public"."member_saved_filters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_saved_filters_manage" ON "public"."member_saved_filters" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "member_saved_filters_select_member" ON "public"."member_saved_filters" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."member_tag_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_tag_assignments_manage" ON "public"."member_tag_assignments" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "member_tag_assignments_select_member" ON "public"."member_tag_assignments" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."member_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_tags_manage" ON "public"."member_tags" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "member_tags_select_member" ON "public"."member_tags" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members_manage" ON "public"."members" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "members_select_member" ON "public"."members" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



CREATE POLICY "members_select_self" ON "public"."members" FOR SELECT USING ((("id" = "public"."current_member_id"()) AND "public"."organization_is_active"("organization_id")));



ALTER TABLE "public"."online_payment_transaction_allocations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "online_payment_transaction_allocations_insert_own" ON "public"."online_payment_transaction_allocations" FOR INSERT WITH CHECK (("transaction_id" IN ( SELECT "online_payment_transactions"."id"
   FROM "public"."online_payment_transactions"
  WHERE (("online_payment_transactions"."member_id" = "public"."current_member_id"()) AND "public"."organization_is_active"("online_payment_transactions"."organization_id")))));



CREATE POLICY "online_payment_transaction_allocations_select_own" ON "public"."online_payment_transaction_allocations" FOR SELECT USING (("transaction_id" IN ( SELECT "online_payment_transactions"."id"
   FROM "public"."online_payment_transactions"
  WHERE (("online_payment_transactions"."member_id" = "public"."current_member_id"()) AND "public"."organization_is_active"("online_payment_transactions"."organization_id")))));



ALTER TABLE "public"."online_payment_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "online_payment_transactions_insert_own" ON "public"."online_payment_transactions" FOR INSERT WITH CHECK ((("member_id" = "public"."current_member_id"()) AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "online_payment_transactions_select_own" ON "public"."online_payment_transactions" FOR SELECT USING ((("member_id" = "public"."current_member_id"()) AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "org_memberships_manage" ON "public"."organization_memberships" USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.users.manage'::"text")) WITH CHECK ("public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.users.manage'::"text"));



CREATE POLICY "org_memberships_select_member" ON "public"."organization_memberships" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."organization_finance_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_finance_settings_manage" ON "public"."organization_finance_settings" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id")));



ALTER TABLE "public"."organization_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_insert_platform_admin" ON "public"."organizations" FOR INSERT WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "organizations_select_member" ON "public"."organizations" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "id"));



CREATE POLICY "organizations_update_authorized" ON "public"."organizations" FOR UPDATE USING (("public"."is_platform_admin"("auth"."uid"()) OR "public"."has_permission"("auth"."uid"(), "id", 'tenant.settings.manage'::"text"))) WITH CHECK (("public"."is_platform_admin"("auth"."uid"()) OR "public"."has_permission"("auth"."uid"(), "id", 'tenant.settings.manage'::"text")));



ALTER TABLE "public"."payment_allocations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_allocations_select_own" ON "public"."payment_allocations" FOR SELECT USING (("payment_id" IN ( SELECT "payments"."id"
   FROM "public"."payments"
  WHERE (("payments"."member_id" = "public"."current_member_id"()) AND ("payments"."status" = 'POSTED'::"text") AND "public"."organization_is_active"("payments"."organization_id")))));



CREATE POLICY "payment_allocations_select_permission" ON "public"."payment_allocations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."payments" "p"
  WHERE (("p"."id" = "payment_allocations"."payment_id") AND "public"."has_permission"("auth"."uid"(), "p"."organization_id", 'finance.payments.read'::"text")))));



ALTER TABLE "public"."payment_provider_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_provider_settings_manage" ON "public"."payment_provider_settings" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.online_payments.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.online_payments.manage'::"text") AND "public"."organization_is_active"("organization_id")));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_select_own" ON "public"."payments" FOR SELECT USING ((("member_id" = "public"."current_member_id"()) AND ("status" = 'POSTED'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "payments_select_permission" ON "public"."payments" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.payments.read'::"text"));



ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_select_authenticated" ON "public"."permissions" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."plan_entitlements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_entitlements_manage_platform_admin" ON "public"."plan_entitlements" USING ("public"."is_platform_admin"("auth"."uid"())) WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "plan_entitlements_select_authenticated" ON "public"."plan_entitlements" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."plan_installments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_installments_select_own" ON "public"."plan_installments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."installment_plans" "p"
  WHERE (("p"."id" = "plan_installments"."plan_id") AND ("p"."buyer_member_id" = "public"."current_member_id"()) AND "public"."organization_is_active"("p"."organization_id")))));



CREATE POLICY "plan_installments_select_staff" ON "public"."plan_installments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."installment_plans" "p"
  WHERE (("p"."id" = "plan_installments"."plan_id") AND ("public"."has_permission"("auth"."uid"(), "p"."organization_id", 'property.installments.view'::"text") OR "public"."has_permission"("auth"."uid"(), "p"."organization_id", 'property.installments.manage'::"text"))))));



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plans_manage_platform_admin" ON "public"."plans" USING ("public"."is_platform_admin"("auth"."uid"())) WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "plans_select_authenticated" ON "public"."plans" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."platform_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_audit_logs_insert_admin" ON "public"."platform_audit_logs" FOR INSERT WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "platform_audit_logs_select_admin" ON "public"."platform_audit_logs" FOR SELECT USING ("public"."is_platform_admin"("auth"."uid"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_own_or_platform_admin" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_platform_admin"("auth"."uid"())));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_manage" ON "public"."projects" USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text")) WITH CHECK ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text"));



CREATE POLICY "projects_select_member" ON "public"."projects" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."properties" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."property_import_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "property_import_logs_insert_member" ON "public"."property_import_logs" FOR INSERT WITH CHECK ("public"."is_org_member"("auth"."uid"(), "organization_id"));



CREATE POLICY "property_import_logs_select_member" ON "public"."property_import_logs" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_orders_select_permission" ON "public"."purchase_orders" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.suppliers.read'::"text"));



ALTER TABLE "public"."purchase_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_requests_select_permission" ON "public"."purchase_requests" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.suppliers.read'::"text"));



ALTER TABLE "public"."resort_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "resort_memberships_manage" ON "public"."resort_memberships" USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.users.manage'::"text")) WITH CHECK ("public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.users.manage'::"text"));



CREATE POLICY "resort_memberships_select_member" ON "public"."resort_memberships" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



CREATE POLICY "resorts_manage" ON "public"."properties" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.settings.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.settings.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "resorts_select_member" ON "public"."properties" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."revenue_natures" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "revenue_natures_select" ON "public"."revenue_natures" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_permissions_manage" ON "public"."role_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."roles" "r"
  WHERE (("r"."id" = "role_permissions"."role_id") AND ((("r"."organization_id" IS NULL) AND "public"."is_platform_admin"("auth"."uid"())) OR (("r"."organization_id" IS NOT NULL) AND "public"."has_permission"("auth"."uid"(), "r"."organization_id", 'tenant.roles.manage'::"text"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."roles" "r"
  WHERE (("r"."id" = "role_permissions"."role_id") AND ((("r"."organization_id" IS NULL) AND "public"."is_platform_admin"("auth"."uid"())) OR (("r"."organization_id" IS NOT NULL) AND "public"."has_permission"("auth"."uid"(), "r"."organization_id", 'tenant.roles.manage'::"text")))))));



CREATE POLICY "role_permissions_select_authenticated" ON "public"."role_permissions" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."role_template_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_template_permissions_manage_platform_admin" ON "public"."role_template_permissions" USING ("public"."is_platform_admin"("auth"."uid"())) WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "role_template_permissions_select_authenticated" ON "public"."role_template_permissions" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."role_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_templates_manage_platform_admin" ON "public"."role_templates" USING ("public"."is_platform_admin"("auth"."uid"())) WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "role_templates_select_authenticated" ON "public"."role_templates" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_manage_tenant" ON "public"."roles" USING ((("organization_id" IS NOT NULL) AND "public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.roles.manage'::"text"))) WITH CHECK ((("organization_id" IS NOT NULL) AND "public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.roles.manage'::"text")));



CREATE POLICY "roles_select_system_or_member" ON "public"."roles" FOR SELECT USING ((("organization_id" IS NULL) OR "public"."is_org_member"("auth"."uid"(), "organization_id")));



ALTER TABLE "public"."service_charge_allocations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_charge_allocations_manage" ON "public"."service_charge_allocations" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.service_charges.manage'::"text") AND "public"."organization_is_active"("organization_id") AND (EXISTS ( SELECT 1
   FROM "public"."service_charge_levies" "l"
  WHERE (("l"."id" = "service_charge_allocations"."levy_id") AND ("l"."status" = 'DRAFT'::"text")))))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.service_charges.manage'::"text") AND "public"."organization_is_active"("organization_id") AND (EXISTS ( SELECT 1
   FROM "public"."service_charge_levies" "l"
  WHERE (("l"."id" = "service_charge_allocations"."levy_id") AND ("l"."status" = 'DRAFT'::"text"))))));



CREATE POLICY "service_charge_allocations_select" ON "public"."service_charge_allocations" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.service_charges.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.service_charges.manage'::"text")));



ALTER TABLE "public"."service_charge_levies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_charge_levies_manage" ON "public"."service_charge_levies" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.service_charges.manage'::"text") AND "public"."organization_is_active"("organization_id") AND ("status" = 'DRAFT'::"text"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.service_charges.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "service_charge_levies_select" ON "public"."service_charge_levies" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.service_charges.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.service_charges.manage'::"text")));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscriptions_manage_platform_admin" ON "public"."subscriptions" USING ("public"."is_platform_admin"("auth"."uid"())) WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "subscriptions_select_member" ON "public"."subscriptions" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."supplier_invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_invoices_select_permission" ON "public"."supplier_invoices" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.suppliers.read'::"text"));



ALTER TABLE "public"."supplier_payment_allocations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_payment_allocations_select_permission" ON "public"."supplier_payment_allocations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."supplier_payments" "sp"
  WHERE (("sp"."id" = "supplier_payment_allocations"."payment_id") AND "public"."has_permission"("auth"."uid"(), "sp"."organization_id", 'finance.suppliers.read'::"text")))));



ALTER TABLE "public"."supplier_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_payments_select_permission" ON "public"."supplier_payments" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.suppliers.read'::"text"));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_manage" ON "public"."suppliers" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.accounts.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "suppliers_select_permission" ON "public"."suppliers" FOR SELECT USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.suppliers.read'::"text"));



ALTER TABLE "public"."tax_decisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tax_decisions_select" ON "public"."tax_decisions" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'finance.tax_mapping.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'finance.tax_mapping.manage'::"text")));



ALTER TABLE "public"."tax_rule_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tax_rule_versions_select" ON "public"."tax_rule_versions" FOR SELECT TO "authenticated" USING ((("status" <> 'DRAFT'::"text") OR "public"."is_platform_admin"("auth"."uid"())));



ALTER TABLE "public"."tenant_branding" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_branding_manage" ON "public"."tenant_branding" USING ("public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.settings.manage'::"text")) WITH CHECK ("public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.settings.manage'::"text"));



CREATE POLICY "tenant_branding_select_member" ON "public"."tenant_branding" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."tenant_feature_flags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_feature_flags_manage_platform_admin" ON "public"."tenant_feature_flags" USING ("public"."is_platform_admin"("auth"."uid"())) WITH CHECK ("public"."is_platform_admin"("auth"."uid"()));



CREATE POLICY "tenant_feature_flags_select_member" ON "public"."tenant_feature_flags" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



ALTER TABLE "public"."unit_handover_snags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unit_handover_snags_manage" ON "public"."unit_handover_snags" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.handover.manage'::"text") AND "public"."organization_is_active"("organization_id") AND (EXISTS ( SELECT 1
   FROM "public"."unit_handovers" "h"
  WHERE (("h"."id" = "unit_handover_snags"."handover_id") AND ("h"."status" = 'SCHEDULED'::"text")))))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.handover.manage'::"text") AND "public"."organization_is_active"("organization_id") AND (EXISTS ( SELECT 1
   FROM "public"."unit_handovers" "h"
  WHERE (("h"."id" = "unit_handover_snags"."handover_id") AND ("h"."status" = 'SCHEDULED'::"text"))))));



CREATE POLICY "unit_handover_snags_select" ON "public"."unit_handover_snags" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.handover.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'property.handover.manage'::"text")));



ALTER TABLE "public"."unit_handovers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unit_handovers_select" ON "public"."unit_handovers" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.handover.read'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'property.handover.manage'::"text")));



ALTER TABLE "public"."unit_lease_deposit_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unit_lease_deposit_events_select_own" ON "public"."unit_lease_deposit_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."unit_leases" "l"
  WHERE (("l"."id" = "unit_lease_deposit_events"."lease_id") AND ("l"."tenant_member_id" = "public"."current_member_id"()) AND "public"."organization_is_active"("l"."organization_id")))));



CREATE POLICY "unit_lease_deposit_events_select_staff" ON "public"."unit_lease_deposit_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."unit_leases" "l"
  WHERE (("l"."id" = "unit_lease_deposit_events"."lease_id") AND ("public"."has_permission"("auth"."uid"(), "l"."organization_id", 'property.leases.view'::"text") OR "public"."has_permission"("auth"."uid"(), "l"."organization_id", 'property.leases.manage'::"text"))))));



ALTER TABLE "public"."unit_leases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unit_leases_select_own" ON "public"."unit_leases" FOR SELECT USING ((("tenant_member_id" = "public"."current_member_id"()) AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "unit_leases_select_staff" ON "public"."unit_leases" FOR SELECT USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.leases.view'::"text") OR "public"."has_permission"("auth"."uid"(), "organization_id", 'property.leases.manage'::"text")));



ALTER TABLE "public"."unit_ownerships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unit_ownerships_manage" ON "public"."unit_ownerships" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.members.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "unit_ownerships_select_member" ON "public"."unit_ownerships" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



CREATE POLICY "unit_ownerships_select_own" ON "public"."unit_ownerships" FOR SELECT USING ((("member_id" = "public"."current_member_id"()) AND "public"."organization_is_active"("organization_id")));



ALTER TABLE "public"."units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "units_manage" ON "public"."units" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.units.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.units.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "units_select_member" ON "public"."units" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));



CREATE POLICY "units_select_own" ON "public"."units" FOR SELECT USING (("public"."organization_is_active"("organization_id") AND ("id" IN ( SELECT "unit_ownerships"."unit_id"
   FROM "public"."unit_ownerships"
  WHERE (("unit_ownerships"."member_id" = "public"."current_member_id"()) AND (("unit_ownerships"."end_date" IS NULL) OR ("unit_ownerships"."end_date" >= CURRENT_DATE)))))));



ALTER TABLE "public"."user_role_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_role_assignments_manage" ON "public"."user_role_assignments" USING ((("organization_id" IS NOT NULL) AND "public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.users.manage'::"text"))) WITH CHECK ((("organization_id" IS NOT NULL) AND "public"."has_permission"("auth"."uid"(), "organization_id", 'tenant.users.manage'::"text")));



CREATE POLICY "user_role_assignments_select_member" ON "public"."user_role_assignments" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (("organization_id" IS NOT NULL) AND "public"."is_org_member"("auth"."uid"(), "organization_id"))));



ALTER TABLE "public"."zones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "zones_manage" ON "public"."zones" USING (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.units.manage'::"text") AND "public"."organization_is_active"("organization_id"))) WITH CHECK (("public"."has_permission"("auth"."uid"(), "organization_id", 'property.units.manage'::"text") AND "public"."organization_is_active"("organization_id")));



CREATE POLICY "zones_select_member" ON "public"."zones" FOR SELECT USING ("public"."is_org_member"("auth"."uid"(), "organization_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."accept_member_invitation"("p_invitation_id" "uuid", "p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_member_invitation"("p_invitation_id" "uuid", "p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_member_invitation"("p_invitation_id" "uuid", "p_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accrue_commission"("p_organization_id" "uuid", "p_broker_id" "uuid", "p_property_id" "uuid", "p_source_type" "text", "p_basis_amount" numeric, "p_rate_percent" numeric, "p_gross_amount" numeric, "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_unit_id" "uuid", "p_lease_id" "uuid", "p_installment_plan_id" "uuid", "p_earned_date" "date", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accrue_commission"("p_organization_id" "uuid", "p_broker_id" "uuid", "p_property_id" "uuid", "p_source_type" "text", "p_basis_amount" numeric, "p_rate_percent" numeric, "p_gross_amount" numeric, "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_unit_id" "uuid", "p_lease_id" "uuid", "p_installment_plan_id" "uuid", "p_earned_date" "date", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accrue_commission"("p_organization_id" "uuid", "p_broker_id" "uuid", "p_property_id" "uuid", "p_source_type" "text", "p_basis_amount" numeric, "p_rate_percent" numeric, "p_gross_amount" numeric, "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_unit_id" "uuid", "p_lease_id" "uuid", "p_installment_plan_id" "uuid", "p_earned_date" "date", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."activate_unit_lease"("p_lease_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_unit_lease"("p_lease_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_unit_lease"("p_lease_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid", "p_role_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid", "p_role_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid", "p_role_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."allocate_document_number"("p_organization_id" "uuid", "p_document_type" "text", "p_source_type" "text", "p_source_id" "uuid", "p_issue_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."allocate_document_number"("p_organization_id" "uuid", "p_document_type" "text", "p_source_type" "text", "p_source_id" "uuid", "p_issue_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."allocate_document_number"("p_organization_id" "uuid", "p_document_type" "text", "p_source_type" "text", "p_source_id" "uuid", "p_issue_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."append_financial_audit_event"("p_organization_id" "uuid", "p_action" "text", "p_entity_type" "text", "p_resort_id" "uuid", "p_entity_id" "uuid", "p_request_id" "text", "p_ip_address" "inet", "p_user_agent" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."append_financial_audit_event"("p_organization_id" "uuid", "p_action" "text", "p_entity_type" "text", "p_resort_id" "uuid", "p_entity_id" "uuid", "p_request_id" "text", "p_ip_address" "inet", "p_user_agent" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_due_type_revenue_nature"("p_mapping_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_due_type_revenue_nature"("p_mapping_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_due_type_revenue_nature"("p_mapping_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_expense_account_input_tax"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_expense_account_input_tax"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_expense_account_input_tax"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_purchase_order"("p_purchase_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_purchase_order"("p_purchase_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_purchase_order"("p_purchase_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_tax_rule"("p_rule_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_tax_rule"("p_rule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_tax_rule"("p_rule_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."archive_unit"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_unit"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_unit"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_subscription"("p_organization_id" "uuid", "p_plan_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_subscription"("p_organization_id" "uuid", "p_plan_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_subscription"("p_organization_id" "uuid", "p_plan_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."auto_match_bank_statement"("p_statement_id" "uuid", "p_date_tolerance_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_match_bank_statement"("p_statement_id" "uuid", "p_date_tolerance_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_match_bank_statement"("p_statement_id" "uuid", "p_date_tolerance_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_installment_plan"("p_plan_id" "uuid", "p_cancel_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_installment_plan"("p_plan_id" "uuid", "p_cancel_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_installment_plan"("p_plan_id" "uuid", "p_cancel_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_supplier_invoice"("p_organization_id" "uuid", "p_invoice_id" "uuid", "p_fiscal_period_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_supplier_invoice"("p_organization_id" "uuid", "p_invoice_id" "uuid", "p_fiscal_period_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_supplier_invoice"("p_organization_id" "uuid", "p_invoice_id" "uuid", "p_fiscal_period_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_unit_lease"("p_lease_id" "uuid", "p_cancel_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_unit_lease"("p_lease_id" "uuid", "p_cancel_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_unit_lease"("p_lease_id" "uuid", "p_cancel_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."capitalise_project_cost"("p_project_id" "uuid", "p_amount" numeric, "p_credit_account_id" "uuid", "p_entry_date" "date", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."capitalise_project_cost"("p_project_id" "uuid", "p_amount" numeric, "p_credit_account_id" "uuid", "p_entry_date" "date", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."capitalise_project_cost"("p_project_id" "uuid", "p_amount" numeric, "p_credit_account_id" "uuid", "p_entry_date" "date", "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "postgres";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "anon";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_asset_disposal_readiness"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_asset_disposal_readiness"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_asset_disposal_readiness"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_coa_no_loop"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_coa_no_loop"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_coa_no_loop"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_einvoice_emission_readiness"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_einvoice_emission_readiness"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_einvoice_emission_readiness"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_fx_readiness"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_fx_readiness"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_fx_readiness"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_input_tax_readiness"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_input_tax_readiness"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_input_tax_readiness"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_installment_plan_completion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_installment_plan_completion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_installment_plan_completion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_tax_enforcement_readiness"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_tax_enforcement_readiness"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_tax_enforcement_readiness"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_einvoice_document"("p_profile_id" "uuid", "p_source_type" "text", "p_source_id" "uuid", "p_document_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_einvoice_document"("p_profile_id" "uuid", "p_source_type" "text", "p_source_id" "uuid", "p_document_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_einvoice_document"("p_profile_id" "uuid", "p_source_type" "text", "p_source_id" "uuid", "p_document_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_incoming_cheque"("p_cheque_id" "uuid", "p_clearing_date" "date", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_incoming_cheque"("p_cheque_id" "uuid", "p_clearing_date" "date", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_incoming_cheque"("p_cheque_id" "uuid", "p_clearing_date" "date", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clone_chart_of_accounts_template"("p_organization_id" "uuid", "p_template_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clone_chart_of_accounts_template"("p_organization_id" "uuid", "p_template_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_chart_of_accounts_template"("p_organization_id" "uuid", "p_template_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clone_tenant_role_templates"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clone_tenant_role_templates"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_tenant_role_templates"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."close_cashier_session"("p_session_id" "uuid", "p_actual_closing_balance" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_cashier_session"("p_session_id" "uuid", "p_actual_closing_balance" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_cashier_session"("p_session_id" "uuid", "p_actual_closing_balance" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_unit_handover"("p_handover_id" "uuid", "p_completed_date" "date", "p_electricity_reading" numeric, "p_water_reading" numeric, "p_gas_reading" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_unit_handover"("p_handover_id" "uuid", "p_completed_date" "date", "p_electricity_reading" numeric, "p_water_reading" numeric, "p_gas_reading" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_unit_handover"("p_handover_id" "uuid", "p_completed_date" "date", "p_electricity_reading" numeric, "p_water_reading" numeric, "p_gas_reading" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_input_tax_split"("p_organization_id" "uuid", "p_expense_account_id" "uuid", "p_supplier_id" "uuid", "p_invoice_number" "text", "p_vat_amount" numeric, "p_decimals" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_input_tax_split"("p_organization_id" "uuid", "p_expense_account_id" "uuid", "p_supplier_id" "uuid", "p_invoice_number" "text", "p_vat_amount" numeric, "p_decimals" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_input_tax_split"("p_organization_id" "uuid", "p_expense_account_id" "uuid", "p_supplier_id" "uuid", "p_invoice_number" "text", "p_vat_amount" numeric, "p_decimals" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_service_charge_allocations"("p_levy_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_service_charge_allocations"("p_levy_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_service_charge_allocations"("p_levy_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."convert_to_base"("p_organization_id" "uuid", "p_amount" numeric, "p_currency" "text", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."convert_to_base"("p_organization_id" "uuid", "p_amount" numeric, "p_currency" "text", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_to_base"("p_organization_id" "uuid", "p_amount" numeric, "p_currency" "text", "p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_cashbox"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_name" "text", "p_gl_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_cashbox"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_name" "text", "p_gl_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_cashbox"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_name" "text", "p_gl_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_fiscal_year"("p_organization_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_fiscal_year"("p_organization_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_fiscal_year"("p_organization_id" "uuid", "p_name" "text", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_installment_plan"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_buyer_member_id" "uuid", "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_total_price" numeric, "p_down_payment" numeric, "p_installment_count" integer, "p_installment_frequency" "text", "p_starts_on" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_installment_plan"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_buyer_member_id" "uuid", "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_total_price" numeric, "p_down_payment" numeric, "p_installment_count" integer, "p_installment_frequency" "text", "p_starts_on" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_installment_plan"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_buyer_member_id" "uuid", "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_total_price" numeric, "p_down_payment" numeric, "p_installment_count" integer, "p_installment_frequency" "text", "p_starts_on" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_journal_entry"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_description" "text", "p_source_type" "text", "p_lines" "jsonb", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_journal_entry"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_description" "text", "p_source_type" "text", "p_lines" "jsonb", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_journal_entry"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_description" "text", "p_source_type" "text", "p_lines" "jsonb", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_journal_entry_internal"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_description" "text", "p_source_type" "text", "p_lines" "jsonb", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_journal_entry_internal"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_description" "text", "p_source_type" "text", "p_lines" "jsonb", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_member_invitation"("p_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_member_invitation"("p_member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_member_invitation"("p_member_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_online_payment_checkout_transaction"("p_due_ids" "uuid"[], "p_provider" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_online_payment_checkout_transaction"("p_due_ids" "uuid"[], "p_provider" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_online_payment_checkout_transaction"("p_due_ids" "uuid"[], "p_provider" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text", "p_default_currency" "text", "p_plan_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text", "p_default_currency" "text", "p_plan_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_organization"("p_name" "text", "p_slug" "text", "p_default_currency" "text", "p_plan_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_organization_onboarding"("p_org_name" "text", "p_entity_type" "text", "p_entity_type_custom_label" "text", "p_resort_name" "text", "p_resort_code" "text", "p_timezone" "text", "p_default_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_organization_onboarding"("p_org_name" "text", "p_entity_type" "text", "p_entity_type_custom_label" "text", "p_resort_name" "text", "p_resort_code" "text", "p_timezone" "text", "p_default_currency" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_organization_onboarding"("p_org_name" "text", "p_entity_type" "text", "p_entity_type_custom_label" "text", "p_resort_name" "text", "p_resort_code" "text", "p_timezone" "text", "p_default_currency" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_purchase_order"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_request_id" "uuid", "p_description" "text", "p_amount" numeric, "p_order_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_purchase_order"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_request_id" "uuid", "p_description" "text", "p_amount" numeric, "p_order_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_purchase_order"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_request_id" "uuid", "p_description" "text", "p_amount" numeric, "p_order_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_purchase_request"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_description" "text", "p_estimated_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_purchase_request"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_description" "text", "p_estimated_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_purchase_request"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_description" "text", "p_estimated_amount" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_resort"("p_organization_id" "uuid", "p_name" "text", "p_code" "text", "p_timezone" "text", "p_address" "text", "p_governorate" "text", "p_phone" "text", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_resort"("p_organization_id" "uuid", "p_name" "text", "p_code" "text", "p_timezone" "text", "p_address" "text", "p_governorate" "text", "p_phone" "text", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_resort"("p_organization_id" "uuid", "p_name" "text", "p_code" "text", "p_timezone" "text", "p_address" "text", "p_governorate" "text", "p_phone" "text", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_tax_rule_draft"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_effective_from" "date", "p_e_document_type" "text", "p_issuer_scope" "text", "p_legal_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_tax_rule_draft"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_effective_from" "date", "p_e_document_type" "text", "p_issuer_scope" "text", "p_legal_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_tax_rule_draft"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_effective_from" "date", "p_e_document_type" "text", "p_issuer_scope" "text", "p_legal_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_unit_lease"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_tenant_member_id" "uuid", "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_rent_amount" numeric, "p_rent_frequency" "text", "p_starts_on" "date", "p_ends_on" "date", "p_security_deposit_amount" numeric, "p_billing_recipient" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_unit_lease"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_tenant_member_id" "uuid", "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_rent_amount" numeric, "p_rent_frequency" "text", "p_starts_on" "date", "p_ends_on" "date", "p_security_deposit_amount" numeric, "p_billing_recipient" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_unit_lease"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_tenant_member_id" "uuid", "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_rent_amount" numeric, "p_rent_frequency" "text", "p_starts_on" "date", "p_ends_on" "date", "p_security_deposit_amount" numeric, "p_billing_recipient" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."creditable_remaining"("p_due_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."creditable_remaining"("p_due_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."creditable_remaining"("p_due_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."currency_decimals"("p_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."currency_decimals"("p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."currency_decimals"("p_currency" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_member_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_member_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_member_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "postgres";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decide_purchase_request"("p_request_id" "uuid", "p_approve" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decide_purchase_request"("p_request_id" "uuid", "p_approve" boolean, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_purchase_request"("p_request_id" "uuid", "p_approve" boolean, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_resort"("p_resort_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_resort"("p_resort_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_resort"("p_resort_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."depreciable_remaining"("p_asset_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."depreciable_remaining"("p_asset_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."depreciable_remaining"("p_asset_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."depreciation_for_period"("p_asset_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."depreciation_for_period"("p_asset_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."depreciation_for_period"("p_asset_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."disable_payment_provider"("p_settings_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."disable_payment_provider"("p_settings_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."disable_payment_provider"("p_settings_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispose_fixed_asset"("p_asset_id" "uuid", "p_disposal_date" "date", "p_proceeds" numeric, "p_proceeds_account_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispose_fixed_asset"("p_asset_id" "uuid", "p_disposal_date" "date", "p_proceeds" numeric, "p_proceeds_account_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dispose_fixed_asset"("p_asset_id" "uuid", "p_disposal_date" "date", "p_proceeds" numeric, "p_proceeds_account_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."due_ids_have_pending_online_checkout"("p_due_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."due_ids_have_pending_online_checkout"("p_due_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."due_ids_have_pending_online_checkout"("p_due_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."due_outstanding"("p_due_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."due_outstanding"("p_due_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."due_outstanding"("p_due_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enable_payment_provider"("p_settings_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enable_payment_provider"("p_settings_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enable_payment_provider"("p_settings_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."end_unit_lease"("p_lease_id" "uuid", "p_ends_on" "date", "p_end_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."end_unit_lease"("p_lease_id" "uuid", "p_ends_on" "date", "p_end_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_unit_lease"("p_lease_id" "uuid", "p_ends_on" "date", "p_end_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_stale_member_invitations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_stale_member_invitations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_stale_online_payment_transactions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_stale_online_payment_transactions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_bank_reconciliation"("p_statement_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_bank_reconciliation"("p_statement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_bank_reconciliation"("p_statement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "postgres";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "anon";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "service_role";



GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."forbid_online_txn_mutation_after_pending"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forbid_online_txn_mutation_after_pending"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forbid_online_txn_mutation_after_pending"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_lease_rent_dues"("p_organization_id" "uuid", "p_lease_id" "uuid", "p_period" "text", "p_issue_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_lease_rent_dues"("p_organization_id" "uuid", "p_lease_id" "uuid", "p_period" "text", "p_issue_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_lease_rent_dues"("p_organization_id" "uuid", "p_lease_id" "uuid", "p_period" "text", "p_issue_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_recurring_dues"("p_organization_id" "uuid", "p_schedule_id" "uuid", "p_period" "text", "p_generated_by" "uuid", "p_override_issue_date" "date", "p_ip_address" "inet", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_recurring_dues"("p_organization_id" "uuid", "p_schedule_id" "uuid", "p_period" "text", "p_generated_by" "uuid", "p_override_issue_date" "date", "p_ip_address" "inet", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_recurring_dues"("p_organization_id" "uuid", "p_schedule_id" "uuid", "p_period" "text", "p_generated_by" "uuid", "p_override_issue_date" "date", "p_ip_address" "inet", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_account_ledger"("p_organization_id" "uuid", "p_account_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_account_ledger"("p_organization_id" "uuid", "p_account_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_ledger"("p_organization_id" "uuid", "p_account_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_bank_match_candidates"("p_statement_line_id" "uuid", "p_date_tolerance_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_bank_match_candidates"("p_statement_line_id" "uuid", "p_date_tolerance_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_bank_match_candidates"("p_statement_line_id" "uuid", "p_date_tolerance_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_bank_reconciliation_summary"("p_statement_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_bank_reconciliation_summary"("p_statement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_bank_reconciliation_summary"("p_statement_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_cash_flow_statement"("p_organization_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_cash_flow_statement"("p_organization_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cash_flow_statement"("p_organization_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_cash_position"("p_organization_id" "uuid", "p_as_of_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_cash_position"("p_organization_id" "uuid", "p_as_of_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cash_position"("p_organization_id" "uuid", "p_as_of_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_einvoice_source_for_credit_note"("p_credit_note_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_einvoice_source_for_credit_note"("p_credit_note_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_einvoice_source_for_credit_note"("p_credit_note_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_einvoice_source_for_due"("p_due_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_einvoice_source_for_due"("p_due_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_einvoice_source_for_due"("p_due_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_entitlement"("p_organization_id" "uuid", "p_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_entitlement"("p_organization_id" "uuid", "p_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_entitlement"("p_organization_id" "uuid", "p_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_exchange_rate"("p_organization_id" "uuid", "p_foreign_currency" "text", "p_base_currency" "text", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_exchange_rate"("p_organization_id" "uuid", "p_foreign_currency" "text", "p_base_currency" "text", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_exchange_rate"("p_organization_id" "uuid", "p_foreign_currency" "text", "p_base_currency" "text", "p_date" "date") TO "service_role";



GRANT ALL ON TABLE "public"."journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entries" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_journal_entry_for_view"("p_entry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_journal_entry_for_view"("p_entry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_journal_entry_for_view"("p_entry_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_lease_deposit_summary"("p_lease_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_lease_deposit_summary"("p_lease_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_lease_deposit_summary"("p_lease_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_own_organization_display"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_own_organization_display"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_own_organization_display"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_payment_provider_credentials"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_provider" "text", "p_environment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_payment_provider_credentials"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_provider" "text", "p_environment" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_payment_provider_settings_credentials"("p_settings_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_payment_provider_settings_credentials"("p_settings_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payment_provider_settings_credentials"("p_settings_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_service_charge_allocations"("p_levy_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_service_charge_allocations"("p_levy_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_charge_allocations"("p_levy_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_tax_decision_coverage"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tax_decision_coverage"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tax_decision_coverage"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_trial_balance"("p_organization_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_trial_balance"("p_organization_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_trial_balance"("p_organization_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_unrecognized_dues_summary"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_unrecognized_dues_summary"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unrecognized_dues_summary"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_financial_permission"("p_organization_id" "uuid", "p_permission_key" "text", "p_resort_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_financial_permission"("p_organization_id" "uuid", "p_permission_key" "text", "p_resort_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_financial_permission"("p_organization_id" "uuid", "p_permission_key" "text", "p_resort_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_organization_id" "uuid", "p_permission_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_organization_id" "uuid", "p_permission_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_organization_id" "uuid", "p_permission_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_property_csv"("p_organization_id" "uuid", "p_import_kind" "text", "p_rows" "jsonb", "p_resort_id" "uuid", "p_allow_partial" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_property_csv"("p_organization_id" "uuid", "p_import_kind" "text", "p_rows" "jsonb", "p_resort_id" "uuid", "p_allow_partial" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_property_csv"("p_organization_id" "uuid", "p_import_kind" "text", "p_rows" "jsonb", "p_resort_id" "uuid", "p_allow_partial" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "postgres";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "anon";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_member"("p_user_id" "uuid", "p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_member"("p_user_id" "uuid", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_user_id" "uuid", "p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_resort_member"("p_user_id" "uuid", "p_resort_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_resort_member"("p_user_id" "uuid", "p_resort_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_resort_member"("p_user_id" "uuid", "p_resort_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_credit_note"("p_due_id" "uuid", "p_gross_amount" numeric, "p_reason" "text", "p_credit_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_credit_note"("p_due_id" "uuid", "p_gross_amount" numeric, "p_reason" "text", "p_credit_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_credit_note"("p_due_id" "uuid", "p_gross_amount" numeric, "p_reason" "text", "p_credit_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_dues"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_unit_ids" "uuid"[], "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_amount" numeric, "p_amount_by_unit_type" "jsonb", "p_issue_date" "date", "p_due_date" "date", "p_description" "text", "p_ip_address" "inet", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_dues"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_unit_ids" "uuid"[], "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_amount" numeric, "p_amount_by_unit_type" "jsonb", "p_issue_date" "date", "p_due_date" "date", "p_description" "text", "p_ip_address" "inet", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_dues"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_unit_ids" "uuid"[], "p_due_type_id" "uuid", "p_receivable_account_id" "uuid", "p_amount" numeric, "p_amount_by_unit_type" "jsonb", "p_issue_date" "date", "p_due_date" "date", "p_description" "text", "p_ip_address" "inet", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_service_charge_levy"("p_levy_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_service_charge_levy"("p_levy_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_service_charge_levy"("p_levy_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lease_rent_period_key"("p_frequency" "text", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lease_rent_period_key"("p_frequency" "text", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lease_rent_period_key"("p_frequency" "text", "p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lease_rent_period_range"("p_frequency" "text", "p_period" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lease_rent_period_range"("p_frequency" "text", "p_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lease_rent_period_range"("p_frequency" "text", "p_period" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_unit_ownership"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_member_id" "uuid", "p_share_percentage" numeric, "p_is_primary_contact" boolean, "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_unit_ownership"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_member_id" "uuid", "p_share_percentage" numeric, "p_is_primary_contact" boolean, "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_unit_ownership"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_member_id" "uuid", "p_share_percentage" numeric, "p_is_primary_contact" boolean, "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_catalogue_items"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_catalogue_items"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_catalogue_items"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_credit_notes"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_credit_notes"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_credit_notes"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_creditable_dues"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_creditable_dues"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_creditable_dues"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_due_type_catalogue_links"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_due_type_catalogue_links"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_due_type_catalogue_links"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_due_type_tax_mappings"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_due_type_tax_mappings"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_due_type_tax_mappings"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_dunning_candidates"("p_organization_id" "uuid", "p_as_of" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_dunning_candidates"("p_organization_id" "uuid", "p_as_of" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_dunning_candidates"("p_organization_id" "uuid", "p_as_of" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_dunning_notices"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_dunning_notices"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_dunning_notices"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_exchange_rates"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_exchange_rates"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_exchange_rates"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_fixed_assets"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_fixed_assets"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_fixed_assets"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_payment_provider_settings"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_payment_provider_settings"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_payment_provider_settings"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_projects"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_projects"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_projects"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."revenue_natures" TO "anon";
GRANT ALL ON TABLE "public"."revenue_natures" TO "authenticated";
GRANT ALL ON TABLE "public"."revenue_natures" TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_revenue_natures"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_revenue_natures"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_revenue_natures"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_tax_enforcement_lapses"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_tax_enforcement_lapses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_tax_enforcement_lapses"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lock_coa_after_use"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lock_coa_after_use"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_coa_after_use"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_coa_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_coa_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_coa_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_sequence_value"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_sequence_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_sequence_value"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_sequence_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_sequence_value"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_sequence_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."normalize_phone"("p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_phone"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone"("p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."open_cashier_session"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_cashbox_id" "uuid", "p_opening_balance" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_cashier_session"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_cashbox_id" "uuid", "p_opening_balance" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_cashier_session"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_cashbox_id" "uuid", "p_opening_balance" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."organization_is_active"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."organization_is_active"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."organization_is_active"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_commission"("p_commission_id" "uuid", "p_cash_account_id" "uuid", "p_paid_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_commission"("p_commission_id" "uuid", "p_cash_account_id" "uuid", "p_paid_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_commission"("p_commission_id" "uuid", "p_cash_account_id" "uuid", "p_paid_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_depreciation_for_period"("p_organization_id" "uuid", "p_fiscal_period_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_depreciation_for_period"("p_organization_id" "uuid", "p_fiscal_period_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_depreciation_for_period"("p_organization_id" "uuid", "p_fiscal_period_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_due_to_ledger"("p_due_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_due_to_ledger"("p_due_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_due_to_ledger"("p_due_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_fx_difference"("p_organization_id" "uuid", "p_property_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_difference" numeric, "p_counter_account_id" "uuid", "p_description" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_fx_difference"("p_organization_id" "uuid", "p_property_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_difference" numeric, "p_counter_account_id" "uuid", "p_description" "text", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_fx_difference"("p_organization_id" "uuid", "p_property_id" "uuid", "p_fiscal_period_id" "uuid", "p_entry_date" "date", "p_difference" numeric, "p_counter_account_id" "uuid", "p_description" "text", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_journal_entry"("p_journal_entry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_journal_entry"("p_journal_entry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_journal_entry"("p_journal_entry_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_journal_entry_internal"("p_journal_entry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_journal_entry_internal"("p_journal_entry_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_payment_internal"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_member_id" "uuid", "p_unit_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_deposit_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_payment_internal"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_member_id" "uuid", "p_unit_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_deposit_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid", "p_actor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_supplier_invoice"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_order_id" "uuid", "p_invoice_number" "text", "p_expense_account_id" "uuid", "p_net_amount" numeric, "p_discount_amount" numeric, "p_vat_rate" numeric, "p_vat_account_id" "uuid", "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_invoice_date" "date", "p_due_date" "date", "p_fiscal_period_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_supplier_invoice"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_order_id" "uuid", "p_invoice_number" "text", "p_expense_account_id" "uuid", "p_net_amount" numeric, "p_discount_amount" numeric, "p_vat_rate" numeric, "p_vat_account_id" "uuid", "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_invoice_date" "date", "p_due_date" "date", "p_fiscal_period_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_supplier_invoice"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_order_id" "uuid", "p_invoice_number" "text", "p_expense_account_id" "uuid", "p_net_amount" numeric, "p_discount_amount" numeric, "p_vat_rate" numeric, "p_vat_account_id" "uuid", "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_invoice_date" "date", "p_due_date" "date", "p_fiscal_period_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_supplier_invoice_in_currency"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_order_id" "uuid", "p_invoice_number" "text", "p_expense_account_id" "uuid", "p_net_amount" numeric, "p_discount_amount" numeric, "p_vat_rate" numeric, "p_vat_account_id" "uuid", "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_invoice_date" "date", "p_due_date" "date", "p_fiscal_period_id" "uuid", "p_currency" "text", "p_exchange_rate" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_supplier_invoice_in_currency"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_order_id" "uuid", "p_invoice_number" "text", "p_expense_account_id" "uuid", "p_net_amount" numeric, "p_discount_amount" numeric, "p_vat_rate" numeric, "p_vat_account_id" "uuid", "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_invoice_date" "date", "p_due_date" "date", "p_fiscal_period_id" "uuid", "p_currency" "text", "p_exchange_rate" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_supplier_invoice_in_currency"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_purchase_order_id" "uuid", "p_invoice_number" "text", "p_expense_account_id" "uuid", "p_net_amount" numeric, "p_discount_amount" numeric, "p_vat_rate" numeric, "p_vat_account_id" "uuid", "p_wht_rate" numeric, "p_wht_account_id" "uuid", "p_invoice_date" "date", "p_due_date" "date", "p_fiscal_period_id" "uuid", "p_currency" "text", "p_exchange_rate" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_delete_used_coa"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_delete_used_coa"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_delete_used_coa"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_uncancel_supplier_invoice"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_uncancel_supplier_invoice"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_uncancel_supplier_invoice"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_unreverse_payment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_unreverse_payment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_unreverse_payment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_unreverse_payment_allocation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_unreverse_payment_allocation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_unreverse_payment_allocation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_unreverse_supplier_payment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_unreverse_supplier_payment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_unreverse_supplier_payment"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_unreverse_supplier_payment_allocation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_unreverse_supplier_payment_allocation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_unreverse_supplier_payment_allocation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."preview_generate_recurring_dues"("p_organization_id" "uuid", "p_schedule_id" "uuid", "p_period" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."preview_generate_recurring_dues"("p_organization_id" "uuid", "p_schedule_id" "uuid", "p_period" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."preview_generate_recurring_dues"("p_organization_id" "uuid", "p_schedule_id" "uuid", "p_period" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."project_wip_summary"("p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."project_wip_summary"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."project_wip_summary"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."raise_dunning_notices"("p_organization_id" "uuid", "p_stage" smallint, "p_as_of" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."raise_dunning_notices"("p_organization_id" "uuid", "p_stage" smallint, "p_as_of" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."raise_dunning_notices"("p_organization_id" "uuid", "p_stage" smallint, "p_as_of" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."recognize_pending_dues"("p_organization_id" "uuid", "p_fiscal_period_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recognize_pending_dues"("p_organization_id" "uuid", "p_fiscal_period_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recognize_pending_dues"("p_organization_id" "uuid", "p_fiscal_period_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_cashier_session"("p_session_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_cashier_session"("p_session_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_cashier_session"("p_session_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_dunning_delivery"("p_notice_id" "uuid", "p_channel" "text", "p_reference" "text", "p_delivered_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_dunning_delivery"("p_notice_id" "uuid", "p_channel" "text", "p_reference" "text", "p_delivered_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_dunning_delivery"("p_notice_id" "uuid", "p_channel" "text", "p_reference" "text", "p_delivered_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_einvoice_attempt"("p_document_id" "uuid", "p_operation" "text", "p_resulting_status" "text", "p_http_status" integer, "p_authority_status" "text", "p_authority_uuid" "text", "p_authority_long_id" "text", "p_qr_payload" "text", "p_error_code" "text", "p_error_detail" "text", "p_request_summary" "jsonb", "p_response_summary" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_einvoice_attempt"("p_document_id" "uuid", "p_operation" "text", "p_resulting_status" "text", "p_http_status" integer, "p_authority_status" "text", "p_authority_uuid" "text", "p_authority_long_id" "text", "p_qr_payload" "text", "p_error_code" "text", "p_error_detail" "text", "p_request_summary" "jsonb", "p_response_summary" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_einvoice_attempt"("p_document_id" "uuid", "p_operation" "text", "p_resulting_status" "text", "p_http_status" integer, "p_authority_status" "text", "p_authority_uuid" "text", "p_authority_long_id" "text", "p_qr_payload" "text", "p_error_code" "text", "p_error_detail" "text", "p_request_summary" "jsonb", "p_response_summary" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_expense"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_expense_category_id" "uuid", "p_description" "text", "p_amount" numeric, "p_expense_date" "date", "p_payment_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_cashier_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_expense"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_expense_category_id" "uuid", "p_description" "text", "p_amount" numeric, "p_expense_date" "date", "p_payment_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_cashier_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_expense"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_expense_category_id" "uuid", "p_description" "text", "p_amount" numeric, "p_expense_date" "date", "p_payment_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_cashier_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_incoming_cheque"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_bank_account_id" "uuid", "p_cheque_number" "text", "p_amount" numeric, "p_member_id" "uuid", "p_cheque_date" "date", "p_due_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_incoming_cheque"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_bank_account_id" "uuid", "p_cheque_number" "text", "p_amount" numeric, "p_member_id" "uuid", "p_cheque_date" "date", "p_due_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_incoming_cheque"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_bank_account_id" "uuid", "p_cheque_number" "text", "p_amount" numeric, "p_member_id" "uuid", "p_cheque_date" "date", "p_due_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_input_tax_decision"("p_invoice_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_input_tax_decision"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_input_tax_decision"("p_invoice_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_lease_deposit_event"("p_lease_id" "uuid", "p_event_type" "text", "p_amount" numeric, "p_settlement_account_id" "uuid", "p_reason" "text", "p_event_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_lease_deposit_event"("p_lease_id" "uuid", "p_event_type" "text", "p_amount" numeric, "p_settlement_account_id" "uuid", "p_reason" "text", "p_event_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_lease_deposit_event"("p_lease_id" "uuid", "p_event_type" "text", "p_amount" numeric, "p_settlement_account_id" "uuid", "p_reason" "text", "p_event_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_online_payment"("p_transaction_id" "uuid", "p_webhook_event_id" "text", "p_provider_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_online_payment"("p_transaction_id" "uuid", "p_webhook_event_id" "text", "p_provider_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_payment"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_member_id" "uuid", "p_unit_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_deposit_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_payment"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_member_id" "uuid", "p_unit_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_deposit_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_payment"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_member_id" "uuid", "p_unit_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_deposit_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_payment_provider_verification"("p_settings_id" "uuid", "p_success" boolean, "p_error_message" "text", "p_expected_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_payment_provider_verification"("p_settings_id" "uuid", "p_success" boolean, "p_error_message" "text", "p_expected_updated_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_payment_provider_verification"("p_settings_id" "uuid", "p_success" boolean, "p_error_message" "text", "p_expected_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_supplier_payment"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_payment_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_supplier_payment"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_payment_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_supplier_payment"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_supplier_id" "uuid", "p_amount" numeric, "p_method" "text", "p_payment_date" "date", "p_payment_account_id" "uuid", "p_fiscal_period_id" "uuid", "p_allocations" "jsonb", "p_idempotency_key" "text", "p_cashier_session_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_tax_decision_for_due"("p_due_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_tax_decision_for_due"("p_due_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_tax_decision_for_due"("p_due_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_tax_decision_for_due_internal"("p_due_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_tax_decision_for_due_internal"("p_due_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_tax_decision_for_due_internal"("p_due_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."release_project_wip"("p_project_id" "uuid", "p_amount" numeric, "p_entry_date" "date", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_project_wip"("p_project_id" "uuid", "p_amount" numeric, "p_entry_date" "date", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_project_wip"("p_project_id" "uuid", "p_amount" numeric, "p_entry_date" "date", "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reopen_bank_reconciliation"("p_statement_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reopen_bank_reconciliation"("p_statement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reopen_bank_reconciliation"("p_statement_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_due_buyer"("p_due_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_due_buyer"("p_due_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_due_buyer"("p_due_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_input_tax_account"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_input_tax_account"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_input_tax_account"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_output_tax_account"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_output_tax_account"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_output_tax_account"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."tax_rule_versions" TO "anon";
GRANT ALL ON TABLE "public"."tax_rule_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_rule_versions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_tax_rule"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_transaction_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_tax_rule"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_transaction_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_tax_rule"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_transaction_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_unit"("p_organization_id" "uuid", "p_unit_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_unit"("p_organization_id" "uuid", "p_unit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_unit"("p_organization_id" "uuid", "p_unit_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reverse_journal_entry"("p_journal_entry_id" "uuid", "p_reversal_fiscal_period_id" "uuid", "p_reversal_date" "date", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_journal_entry"("p_journal_entry_id" "uuid", "p_reversal_fiscal_period_id" "uuid", "p_reversal_date" "date", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reverse_journal_entry"("p_journal_entry_id" "uuid", "p_reversal_fiscal_period_id" "uuid", "p_reversal_date" "date", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reverse_tax_decision"("p_decision_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_tax_decision"("p_decision_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reverse_tax_decision"("p_decision_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_due_type_revenue_nature_approval"("p_mapping_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_due_type_revenue_nature_approval"("p_mapping_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_due_type_revenue_nature_approval"("p_mapping_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_due_schedules"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_due_schedules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_due_schedules"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_lease_rent_generation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_lease_rent_generation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."schedule_unit_handover"("p_unit_id" "uuid", "p_scheduled_date" "date", "p_handed_to_member_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."schedule_unit_handover"("p_unit_id" "uuid", "p_scheduled_date" "date", "p_handed_to_member_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."schedule_unit_handover"("p_unit_id" "uuid", "p_scheduled_date" "date", "p_handed_to_member_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."security_function_grant_inventory"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."security_function_grant_inventory"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_asset_disposal_accounts"("p_organization_id" "uuid", "p_gain_account_id" "uuid", "p_loss_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_asset_disposal_accounts"("p_organization_id" "uuid", "p_gain_account_id" "uuid", "p_loss_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_asset_disposal_accounts"("p_organization_id" "uuid", "p_gain_account_id" "uuid", "p_loss_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_cheque_status"("p_cheque_id" "uuid", "p_new_status" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_cheque_status"("p_cheque_id" "uuid", "p_new_status" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_cheque_status"("p_cheque_id" "uuid", "p_new_status" "text", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_due_type_catalogue_item"("p_due_type_id" "uuid", "p_catalogue_item_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_due_type_catalogue_item"("p_due_type_id" "uuid", "p_catalogue_item_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_due_type_catalogue_item"("p_due_type_id" "uuid", "p_catalogue_item_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_due_type_revenue_nature"("p_due_type_id" "uuid", "p_revenue_nature" "text", "p_notes" "text", "p_amount_basis" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_due_type_revenue_nature"("p_due_type_id" "uuid", "p_revenue_nature" "text", "p_notes" "text", "p_amount_basis" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_due_type_revenue_nature"("p_due_type_id" "uuid", "p_revenue_nature" "text", "p_notes" "text", "p_amount_basis" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_einvoice_profile_enabled"("p_profile_id" "uuid", "p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_einvoice_profile_enabled"("p_profile_id" "uuid", "p_enabled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_einvoice_profile_enabled"("p_profile_id" "uuid", "p_enabled" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_einvoice_profile_verification"("p_profile_id" "uuid", "p_success" boolean, "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_einvoice_profile_verification"("p_profile_id" "uuid", "p_success" boolean, "p_error" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_einvoice_profile_verification"("p_profile_id" "uuid", "p_success" boolean, "p_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_expense_account_input_tax"("p_expense_account_id" "uuid", "p_recoverability" "text", "p_recoverable_ratio" numeric, "p_ratio_method" "text", "p_ratio_period" "text", "p_ratio_reference" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_expense_account_input_tax"("p_expense_account_id" "uuid", "p_recoverability" "text", "p_recoverable_ratio" numeric, "p_ratio_method" "text", "p_ratio_period" "text", "p_ratio_reference" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_expense_account_input_tax"("p_expense_account_id" "uuid", "p_recoverability" "text", "p_recoverable_ratio" numeric, "p_ratio_method" "text", "p_ratio_period" "text", "p_ratio_reference" "text", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_fiscal_period_status"("p_fiscal_period_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_fiscal_period_status"("p_fiscal_period_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_fiscal_period_status"("p_fiscal_period_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_fx_difference_accounts"("p_organization_id" "uuid", "p_gain_account_id" "uuid", "p_loss_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_fx_difference_accounts"("p_organization_id" "uuid", "p_gain_account_id" "uuid", "p_loss_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_fx_difference_accounts"("p_organization_id" "uuid", "p_gain_account_id" "uuid", "p_loss_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_input_tax_account"("p_organization_id" "uuid", "p_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_input_tax_account"("p_organization_id" "uuid", "p_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_input_tax_account"("p_organization_id" "uuid", "p_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_member_tax_identity"("p_member_id" "uuid", "p_customer_type" "text", "p_tax_registration_number" "text", "p_identity_document_type" "text", "p_identity_document_number" "text", "p_legal_name" "text", "p_country_code" "text", "p_billing_address" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_member_tax_identity"("p_member_id" "uuid", "p_customer_type" "text", "p_tax_registration_number" "text", "p_identity_document_type" "text", "p_identity_document_number" "text", "p_legal_name" "text", "p_country_code" "text", "p_billing_address" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_member_tax_identity"("p_member_id" "uuid", "p_customer_type" "text", "p_tax_registration_number" "text", "p_identity_document_type" "text", "p_identity_document_number" "text", "p_legal_name" "text", "p_country_code" "text", "p_billing_address" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_organization_status"("p_organization_id" "uuid", "p_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_organization_status"("p_organization_id" "uuid", "p_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_organization_status"("p_organization_id" "uuid", "p_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_output_tax_account"("p_organization_id" "uuid", "p_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_output_tax_account"("p_organization_id" "uuid", "p_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_output_tax_account"("p_organization_id" "uuid", "p_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_purchase_order_status"("p_purchase_order_id" "uuid", "p_new_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_purchase_order_status"("p_purchase_order_id" "uuid", "p_new_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_purchase_order_status"("p_purchase_order_id" "uuid", "p_new_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_tax_enforcement"("p_organization_id" "uuid", "p_enabled" boolean, "p_reason" "text", "p_acknowledged_undecided_dues" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_tax_enforcement"("p_organization_id" "uuid", "p_enabled" boolean, "p_reason" "text", "p_acknowledged_undecided_dues" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_tax_enforcement"("p_organization_id" "uuid", "p_enabled" boolean, "p_reason" "text", "p_acknowledged_undecided_dues" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_unit_lease_billing_recipient"("p_lease_id" "uuid", "p_billing_recipient" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_unit_lease_billing_recipient"("p_lease_id" "uuid", "p_billing_recipient" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_unit_lease_billing_recipient"("p_lease_id" "uuid", "p_billing_recipient" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."settle_supplier_invoice_fx_difference"("p_invoice_id" "uuid", "p_settlement_date" "date", "p_settlement_rate" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_supplier_invoice_fx_difference"("p_invoice_id" "uuid", "p_settlement_date" "date", "p_settlement_rate" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_supplier_invoice_fx_difference"("p_invoice_id" "uuid", "p_settlement_date" "date", "p_settlement_rate" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_journal_entry_for_review"("p_journal_entry_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_journal_entry_for_review"("p_journal_entry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_journal_entry_for_review"("p_journal_entry_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."supersede_tax_rule"("p_rule_id" "uuid", "p_effective_from" "date", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_e_document_type" "text", "p_issuer_scope" "text", "p_legal_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."supersede_tax_rule"("p_rule_id" "uuid", "p_effective_from" "date", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_e_document_type" "text", "p_issuer_scope" "text", "p_legal_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."supersede_tax_rule"("p_rule_id" "uuid", "p_effective_from" "date", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_e_document_type" "text", "p_issuer_scope" "text", "p_legal_reference" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_member_primary_phone"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_member_primary_phone"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_member_primary_phone"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tax_rule_content_hash"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_effective_from" "date", "p_e_document_type" "text", "p_issuer_scope" "text", "p_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tax_rule_content_hash"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_effective_from" "date", "p_e_document_type" "text", "p_issuer_scope" "text", "p_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tax_rule_content_hash"("p_jurisdiction" "text", "p_revenue_nature" "text", "p_tax_treatment" "text", "p_vat_rate" numeric, "p_effective_from" "date", "p_e_document_type" "text", "p_issuer_scope" "text", "p_version" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_credit_note_immutable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_credit_note_immutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_credit_note_immutable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_dues_post_to_ledger"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_dues_post_to_ledger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_dues_post_to_ledger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_dues_tax_decision"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_dues_tax_decision"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_dues_tax_decision"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_input_tax_decision_immutable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_input_tax_decision_immutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_input_tax_decision_immutable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_members_tax_identity_changed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_members_tax_identity_changed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_members_tax_identity_changed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_organizations_tax_identity_changed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_organizations_tax_identity_changed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_organizations_tax_identity_changed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_tax_decision_immutable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_tax_decision_immutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_tax_decision_immutable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_tax_rule_immutable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_tax_rule_immutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_tax_rule_immutable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_tax_rule_set_hash"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_tax_rule_set_hash"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_tax_rule_set_hash"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_resort"("p_resort_id" "uuid", "p_name" "text", "p_code" "text", "p_timezone" "text", "p_address" "text", "p_governorate" "text", "p_phone" "text", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_resort"("p_resort_id" "uuid", "p_name" "text", "p_code" "text", "p_timezone" "text", "p_address" "text", "p_governorate" "text", "p_phone" "text", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_resort"("p_resort_id" "uuid", "p_name" "text", "p_code" "text", "p_timezone" "text", "p_address" "text", "p_governorate" "text", "p_phone" "text", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_unit"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_code" "text", "p_unit_type" "text", "p_custom_type_label" "text", "p_building_id" "uuid", "p_zone_id" "uuid", "p_floor_number" integer, "p_area" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_unit"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_code" "text", "p_unit_type" "text", "p_custom_type_label" "text", "p_building_id" "uuid", "p_zone_id" "uuid", "p_floor_number" integer, "p_area" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_unit"("p_organization_id" "uuid", "p_unit_id" "uuid", "p_code" "text", "p_unit_type" "text", "p_custom_type_label" "text", "p_building_id" "uuid", "p_zone_id" "uuid", "p_floor_number" integer, "p_area" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_catalogue_item"("p_organization_id" "uuid", "p_code" "text", "p_name_ar" "text", "p_name_en" "text", "p_unit_code" "text", "p_item_code_type" "text", "p_item_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_catalogue_item"("p_organization_id" "uuid", "p_code" "text", "p_name_ar" "text", "p_name_en" "text", "p_unit_code" "text", "p_item_code_type" "text", "p_item_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_catalogue_item"("p_organization_id" "uuid", "p_code" "text", "p_name_ar" "text", "p_name_en" "text", "p_unit_code" "text", "p_item_code_type" "text", "p_item_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_einvoice_profile"("p_organization_id" "uuid", "p_jurisdiction" "text", "p_environment" "text", "p_taxpayer_id" "text", "p_branch_code" "text", "p_activity_code" "text", "p_property_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_einvoice_profile"("p_organization_id" "uuid", "p_jurisdiction" "text", "p_environment" "text", "p_taxpayer_id" "text", "p_branch_code" "text", "p_activity_code" "text", "p_property_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_einvoice_profile"("p_organization_id" "uuid", "p_jurisdiction" "text", "p_environment" "text", "p_taxpayer_id" "text", "p_branch_code" "text", "p_activity_code" "text", "p_property_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_payment_provider_settings"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_provider" "text", "p_environment" "text", "p_merchant_identifier" "text", "p_public_key" "text", "p_api_key" "text", "p_hmac_secret" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_payment_provider_settings"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_provider" "text", "p_environment" "text", "p_merchant_identifier" "text", "p_public_key" "text", "p_api_key" "text", "p_hmac_secret" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_payment_provider_settings"("p_organization_id" "uuid", "p_resort_id" "uuid", "p_provider" "text", "p_environment" "text", "p_merchant_identifier" "text", "p_public_key" "text", "p_api_key" "text", "p_hmac_secret" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_online_payments_clearing_account"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_online_payments_clearing_account"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_online_payments_clearing_account"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_payment_provider_settings_scope"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_payment_provider_settings_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_payment_provider_settings_scope"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_financial_audit_chain"("p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_financial_audit_chain"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_financial_audit_chain"("p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."void_payment"("p_organization_id" "uuid", "p_payment_id" "uuid", "p_reason" "text", "p_ip_address" "inet", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."void_payment"("p_organization_id" "uuid", "p_payment_id" "uuid", "p_reason" "text", "p_ip_address" "inet", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."void_payment"("p_organization_id" "uuid", "p_payment_id" "uuid", "p_reason" "text", "p_ip_address" "inet", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."void_supplier_payment"("p_organization_id" "uuid", "p_payment_id" "uuid", "p_fiscal_period_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."void_supplier_payment"("p_organization_id" "uuid", "p_payment_id" "uuid", "p_fiscal_period_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."void_supplier_payment"("p_organization_id" "uuid", "p_payment_id" "uuid", "p_fiscal_period_id" "uuid", "p_reason" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."bank_statement_lines" TO "anon";
GRANT ALL ON TABLE "public"."bank_statement_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_statement_lines" TO "service_role";



GRANT ALL ON TABLE "public"."bank_statements" TO "anon";
GRANT ALL ON TABLE "public"."bank_statements" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_statements" TO "service_role";



GRANT ALL ON TABLE "public"."banks" TO "anon";
GRANT ALL ON TABLE "public"."banks" TO "authenticated";
GRANT ALL ON TABLE "public"."banks" TO "service_role";



GRANT ALL ON TABLE "public"."brokers" TO "anon";
GRANT ALL ON TABLE "public"."brokers" TO "authenticated";
GRANT ALL ON TABLE "public"."brokers" TO "service_role";



GRANT ALL ON TABLE "public"."budgets" TO "anon";
GRANT ALL ON TABLE "public"."budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."budgets" TO "service_role";



GRANT ALL ON TABLE "public"."buildings" TO "anon";
GRANT ALL ON TABLE "public"."buildings" TO "authenticated";
GRANT ALL ON TABLE "public"."buildings" TO "service_role";



GRANT ALL ON TABLE "public"."cash_transactions" TO "anon";
GRANT ALL ON TABLE "public"."cash_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."cashboxes" TO "anon";
GRANT ALL ON TABLE "public"."cashboxes" TO "authenticated";
GRANT ALL ON TABLE "public"."cashboxes" TO "service_role";



GRANT ALL ON TABLE "public"."cashier_sessions" TO "anon";
GRANT ALL ON TABLE "public"."cashier_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."cashier_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."catalogue_items" TO "anon";
GRANT ALL ON TABLE "public"."catalogue_items" TO "authenticated";
GRANT ALL ON TABLE "public"."catalogue_items" TO "service_role";



GRANT ALL ON TABLE "public"."chart_of_accounts" TO "anon";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."chart_of_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."cheque_status_history" TO "anon";
GRANT ALL ON TABLE "public"."cheque_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."cheque_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."cheques" TO "anon";
GRANT ALL ON TABLE "public"."cheques" TO "authenticated";
GRANT ALL ON TABLE "public"."cheques" TO "service_role";



GRANT ALL ON TABLE "public"."coa_template_accounts" TO "anon";
GRANT ALL ON TABLE "public"."coa_template_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."coa_template_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."coa_templates" TO "anon";
GRANT ALL ON TABLE "public"."coa_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."coa_templates" TO "service_role";



GRANT ALL ON TABLE "public"."commissions" TO "anon";
GRANT ALL ON TABLE "public"."commissions" TO "authenticated";
GRANT ALL ON TABLE "public"."commissions" TO "service_role";



GRANT ALL ON TABLE "public"."contact_requests" TO "anon";
GRANT ALL ON TABLE "public"."contact_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_requests" TO "service_role";



GRANT ALL ON TABLE "public"."cost_centers" TO "anon";
GRANT ALL ON TABLE "public"."cost_centers" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_centers" TO "service_role";



GRANT ALL ON TABLE "public"."credit_notes" TO "anon";
GRANT ALL ON TABLE "public"."credit_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_notes" TO "service_role";



GRANT ALL ON TABLE "public"."demo_leads" TO "anon";
GRANT ALL ON TABLE "public"."demo_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_leads" TO "service_role";



GRANT ALL ON TABLE "public"."document_number_counters" TO "anon";
GRANT ALL ON TABLE "public"."document_number_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."document_number_counters" TO "service_role";



GRANT ALL ON TABLE "public"."document_numbers" TO "anon";
GRANT ALL ON TABLE "public"."document_numbers" TO "authenticated";
GRANT ALL ON TABLE "public"."document_numbers" TO "service_role";



GRANT ALL ON TABLE "public"."document_sequences" TO "anon";
GRANT ALL ON TABLE "public"."document_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."document_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."due_generation_runs" TO "anon";
GRANT ALL ON TABLE "public"."due_generation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."due_generation_runs" TO "service_role";



GRANT ALL ON TABLE "public"."due_schedules" TO "anon";
GRANT ALL ON TABLE "public"."due_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."due_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."due_type_revenue_natures" TO "anon";
GRANT ALL ON TABLE "public"."due_type_revenue_natures" TO "authenticated";
GRANT ALL ON TABLE "public"."due_type_revenue_natures" TO "service_role";



GRANT ALL ON TABLE "public"."due_types" TO "anon";
GRANT ALL ON TABLE "public"."due_types" TO "authenticated";
GRANT ALL ON TABLE "public"."due_types" TO "service_role";



GRANT ALL ON TABLE "public"."dues" TO "anon";
GRANT ALL ON TABLE "public"."dues" TO "authenticated";
GRANT ALL ON TABLE "public"."dues" TO "service_role";



GRANT ALL ON TABLE "public"."dunning_notices" TO "anon";
GRANT ALL ON TABLE "public"."dunning_notices" TO "authenticated";
GRANT ALL ON TABLE "public"."dunning_notices" TO "service_role";



GRANT ALL ON TABLE "public"."dunning_policies" TO "anon";
GRANT ALL ON TABLE "public"."dunning_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."dunning_policies" TO "service_role";



GRANT ALL ON TABLE "public"."einvoice_documents" TO "anon";
GRANT ALL ON TABLE "public"."einvoice_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."einvoice_documents" TO "service_role";



GRANT ALL ON TABLE "public"."einvoice_profiles" TO "anon";
GRANT ALL ON TABLE "public"."einvoice_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."einvoice_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."einvoice_submission_attempts" TO "anon";
GRANT ALL ON TABLE "public"."einvoice_submission_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."einvoice_submission_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."exchange_rates" TO "anon";
GRANT ALL ON TABLE "public"."exchange_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."exchange_rates" TO "service_role";



GRANT ALL ON TABLE "public"."expense_account_input_tax" TO "anon";
GRANT ALL ON TABLE "public"."expense_account_input_tax" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_account_input_tax" TO "service_role";



GRANT ALL ON TABLE "public"."expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_categories" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."financial_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."financial_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."fiscal_periods" TO "anon";
GRANT ALL ON TABLE "public"."fiscal_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."fiscal_periods" TO "service_role";



GRANT ALL ON TABLE "public"."fiscal_years" TO "anon";
GRANT ALL ON TABLE "public"."fiscal_years" TO "authenticated";
GRANT ALL ON TABLE "public"."fiscal_years" TO "service_role";



GRANT ALL ON TABLE "public"."fixed_asset_depreciation" TO "anon";
GRANT ALL ON TABLE "public"."fixed_asset_depreciation" TO "authenticated";
GRANT ALL ON TABLE "public"."fixed_asset_depreciation" TO "service_role";



GRANT ALL ON TABLE "public"."fixed_assets" TO "anon";
GRANT ALL ON TABLE "public"."fixed_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."fixed_assets" TO "service_role";



GRANT ALL ON TABLE "public"."input_tax_decisions" TO "anon";
GRANT ALL ON TABLE "public"."input_tax_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."input_tax_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."installment_plans" TO "anon";
GRANT ALL ON TABLE "public"."installment_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."installment_plans" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entry_lines" TO "anon";
GRANT ALL ON TABLE "public"."journal_entry_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entry_lines" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."lease_rent_generation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."lease_rent_generation_runs" TO "service_role";



GRANT ALL ON TABLE "public"."member_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."member_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."member_activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."member_documents" TO "anon";
GRANT ALL ON TABLE "public"."member_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."member_documents" TO "service_role";



GRANT ALL ON TABLE "public"."member_invitation_short_links" TO "service_role";



GRANT ALL ON TABLE "public"."member_invitations" TO "anon";
GRANT ALL ON TABLE "public"."member_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."member_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."member_phones" TO "anon";
GRANT ALL ON TABLE "public"."member_phones" TO "authenticated";
GRANT ALL ON TABLE "public"."member_phones" TO "service_role";



GRANT ALL ON TABLE "public"."member_saved_filters" TO "anon";
GRANT ALL ON TABLE "public"."member_saved_filters" TO "authenticated";
GRANT ALL ON TABLE "public"."member_saved_filters" TO "service_role";



GRANT ALL ON TABLE "public"."member_tag_assignments" TO "anon";
GRANT ALL ON TABLE "public"."member_tag_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."member_tag_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."member_tags" TO "anon";
GRANT ALL ON TABLE "public"."member_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."member_tags" TO "service_role";



GRANT ALL ON TABLE "public"."members" TO "anon";
GRANT ALL ON TABLE "public"."members" TO "authenticated";
GRANT ALL ON TABLE "public"."members" TO "service_role";



GRANT ALL ON TABLE "public"."payment_allocations" TO "anon";
GRANT ALL ON TABLE "public"."payment_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."unit_ownerships" TO "anon";
GRANT ALL ON TABLE "public"."unit_ownerships" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_ownerships" TO "service_role";



GRANT ALL ON TABLE "public"."units" TO "anon";
GRANT ALL ON TABLE "public"."units" TO "authenticated";
GRANT ALL ON TABLE "public"."units" TO "service_role";



GRANT ALL ON TABLE "public"."zones" TO "anon";
GRANT ALL ON TABLE "public"."zones" TO "authenticated";
GRANT ALL ON TABLE "public"."zones" TO "service_role";



GRANT ALL ON TABLE "public"."units_with_financials" TO "anon";
GRANT ALL ON TABLE "public"."units_with_financials" TO "authenticated";
GRANT ALL ON TABLE "public"."units_with_financials" TO "service_role";



GRANT ALL ON TABLE "public"."members_with_financials" TO "anon";
GRANT ALL ON TABLE "public"."members_with_financials" TO "authenticated";
GRANT ALL ON TABLE "public"."members_with_financials" TO "service_role";



GRANT ALL ON TABLE "public"."online_payment_transaction_allocations" TO "anon";
GRANT ALL ON TABLE "public"."online_payment_transaction_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."online_payment_transaction_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."online_payment_transactions" TO "anon";
GRANT ALL ON TABLE "public"."online_payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."online_payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."organization_finance_settings" TO "anon";
GRANT ALL ON TABLE "public"."organization_finance_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_finance_settings" TO "service_role";



GRANT ALL ON TABLE "public"."organization_memberships" TO "anon";
GRANT ALL ON TABLE "public"."organization_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."payment_provider_settings" TO "anon";
GRANT ALL ON TABLE "public"."payment_provider_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_provider_settings" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."plan_entitlements" TO "anon";
GRANT ALL ON TABLE "public"."plan_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_entitlements" TO "service_role";



GRANT ALL ON TABLE "public"."plan_installments" TO "anon";
GRANT ALL ON TABLE "public"."plan_installments" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_installments" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."platform_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."platform_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."properties" TO "anon";
GRANT ALL ON TABLE "public"."properties" TO "authenticated";
GRANT ALL ON TABLE "public"."properties" TO "service_role";



GRANT ALL ON TABLE "public"."property_import_logs" TO "anon";
GRANT ALL ON TABLE "public"."property_import_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."property_import_logs" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_requests" TO "anon";
GRANT ALL ON TABLE "public"."purchase_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_requests" TO "service_role";



GRANT ALL ON TABLE "public"."resort_memberships" TO "anon";
GRANT ALL ON TABLE "public"."resort_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."resort_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."resorts" TO "anon";
GRANT ALL ON TABLE "public"."resorts" TO "authenticated";
GRANT ALL ON TABLE "public"."resorts" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."role_template_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_template_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_template_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."role_templates" TO "anon";
GRANT ALL ON TABLE "public"."role_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."role_templates" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."service_charge_allocations" TO "anon";
GRANT ALL ON TABLE "public"."service_charge_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."service_charge_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."service_charge_levies" TO "anon";
GRANT ALL ON TABLE "public"."service_charge_levies" TO "authenticated";
GRANT ALL ON TABLE "public"."service_charge_levies" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_invoices" TO "anon";
GRANT ALL ON TABLE "public"."supplier_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_payment_allocations" TO "anon";
GRANT ALL ON TABLE "public"."supplier_payment_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_payment_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_payments" TO "anon";
GRANT ALL ON TABLE "public"."supplier_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_payments" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."tax_decisions" TO "anon";
GRANT ALL ON TABLE "public"."tax_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."tax_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_branding" TO "anon";
GRANT ALL ON TABLE "public"."tenant_branding" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_branding" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."tenant_feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_feature_flags" TO "service_role";



GRANT ALL ON TABLE "public"."unit_handover_snags" TO "anon";
GRANT ALL ON TABLE "public"."unit_handover_snags" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_handover_snags" TO "service_role";



GRANT ALL ON TABLE "public"."unit_handovers" TO "anon";
GRANT ALL ON TABLE "public"."unit_handovers" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_handovers" TO "service_role";



GRANT ALL ON TABLE "public"."unit_lease_deposit_events" TO "anon";
GRANT ALL ON TABLE "public"."unit_lease_deposit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_lease_deposit_events" TO "service_role";



GRANT ALL ON TABLE "public"."unit_leases" TO "anon";
GRANT ALL ON TABLE "public"."unit_leases" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_leases" TO "service_role";



GRANT ALL ON TABLE "public"."user_role_assignments" TO "anon";
GRANT ALL ON TABLE "public"."user_role_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."user_role_assignments" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

-- ---------------------------------------------------------------------
-- SECTION 2 of 4: baseline_auth_objects.sql
-- sha256 2bae9922168a07360a45b868243d8f571060d8d2975f98dd386dfddf139d4b82
-- Auth companion -- the trigger pg_dump omits
-- ---------------------------------------------------------------------

-- Baseline companion — application objects outside the `public` schema
--
-- WHY THIS FILE EXISTS
-- `supabase db dump` excludes the `auth` schema by design (see its
-- --exclude-schema list). Production carries exactly one application object
-- there, and the schema dump therefore omits it. A baseline consisting of the
-- dump alone produces a database where every new user signs up successfully
-- and then has no `profiles` row — a failure invisible until someone
-- registers.
--
-- SCOPE — verified, not assumed
-- Production has 6 non-internal triggers outside `public`. Exactly ONE is
-- ours; the other five belong to Supabase's own subsystems and must NOT be
-- recreated by us:
--
--   auth.users      trg_on_auth_user_created  -> public.handle_new_user     <- OURS
--   realtime.subscription  tr_check_filters              -> realtime.*      platform
--   storage.buckets enforce_bucket_name_length_trigger   -> storage.*       platform
--   storage.buckets protect_buckets_delete               -> storage.*       platform
--   storage.objects protect_objects_delete               -> storage.*       platform
--   storage.objects update_objects_updated_at            -> storage.*       platform
--
-- ORDERING
-- Apply AFTER the schema baseline. `public.handle_new_user()` is created
-- there; this file only wires the trigger to it.
--
-- OWNERSHIP CAVEAT
-- `auth.users` is owned by `supabase_auth_admin`, not `postgres`. Creating a
-- trigger on it requires sufficient privilege. On Supabase this works when the
-- baseline is applied as `postgres`, which is how the original migration
-- created it — but it is a privilege dependency worth knowing about before
-- restoring into any non-Supabase Postgres.
--
-- ONE DELIBERATE DIFFERENCE FROM PRODUCTION
-- Production's stored definition is:
--     EXECUTE FUNCTION handle_new_user()      -- unqualified
-- resolved through search_path at creation time. This file writes it as
--     EXECUTE FUNCTION public.handle_new_user()
-- Same target function; the qualification removes a dependency on whatever
-- search_path happens to be active when the baseline is applied. Step 5 must
-- confirm the two resolve identically rather than taking this on trust.

-- Fail loudly if the schema baseline has not been applied first. Without this
-- guard a missing function would surface later as silently broken signup
-- rather than as a failed restore.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'handle_new_user'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    RAISE EXCEPTION
      'BASELINE_ORDER_ERROR: public.handle_new_user() is missing. Apply the schema baseline before this file.';
  END IF;
END
$$;

-- Idempotent: CREATE OR REPLACE TRIGGER (PostgreSQL 14+) replaces an existing
-- trigger of the same name on the same table atomically, so re-running the
-- baseline is safe. Production runs PostgreSQL 17.
CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- SECTION 3 of 4: baseline_03_security_postamble.sql
-- sha256 52d23cbbc8ca267bff6fdba03d6446e4a6ec3930e0d6b7a729df63dd9ab8de43
-- Security postamble -- restates removals, then asserts
-- ---------------------------------------------------------------------

-- Baseline file 3 of 5 — SECURITY POSTAMBLE
--
-- Applied AFTER the schema dump and the auth companion, BEFORE the seed.
--
-- The preamble fixed the default privileges so that objects are not born
-- granted to anon. This file re-states the deviations that differ from
-- production's OWN defaults and therefore cannot be produced by defaults
-- alone. Each one is a privilege that was explicitly taken away in production
-- and that pg_dump cannot serialise, because a removal leaves no artefact.
--
-- Every statement below was derived from production, not authored by hand:
--   * the ten functions are those where
--       has_function_privilege('authenticated', oid, 'EXECUTE') is false
--   * the two relations are those where a role holds fewer privileges than the
--     default ACL would grant
--
-- This file ENDS BY ASSERTING. A baseline that silently fails to harden is the
-- exact failure being repaired here, so it must refuse to complete rather than
-- leave the database quietly open.

-- ---------------------------------------------------------------------------
-- 1. Internal functions that must never be reachable by a signed-in client.
--    Source: Phase 1 migration 20260820191859 (which itself repaired an
--    over-grant introduced by 20260820190630). post_payment_internal and
--    post_journal_entry_internal are the unguarded internals that
--    record_payment and post_journal_entry exist to wrap — direct access
--    bypasses the RBAC guard entirely.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.append_financial_audit_event(p_organization_id uuid, p_action text, p_entity_type text, p_resort_id uuid, p_entity_id uuid, p_request_id text, p_ip_address inet, p_user_agent text, p_metadata jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_journal_entry_internal(p_organization_id uuid, p_resort_id uuid, p_fiscal_period_id uuid, p_entry_date date, p_description text, p_source_type text, p_lines jsonb, p_idempotency_key text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_member_invitations() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_online_payment_transactions() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_payment_provider_credentials(p_organization_id uuid, p_resort_id uuid, p_provider text, p_environment text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.post_journal_entry_internal(p_journal_entry_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.post_payment_internal(p_organization_id uuid, p_resort_id uuid, p_member_id uuid, p_unit_id uuid, p_amount numeric, p_method text, p_payment_date date, p_deposit_account_id uuid, p_fiscal_period_id uuid, p_allocations jsonb, p_idempotency_key text, p_cashier_session_id uuid, p_actor_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_online_payment(p_transaction_id uuid, p_webhook_event_id text, p_provider_payload jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_lease_rent_generation() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.security_function_grant_inventory() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. lease_rent_generation_runs — the table whose anon exposure was the
--    confirmed production P0 in Phase 1 (migration 20260820190307).
--    Target: anon nothing; authenticated SELECT only; service_role full.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.lease_rent_generation_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.lease_rent_generation_runs FROM authenticated;
GRANT SELECT ON TABLE public.lease_rent_generation_runs TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. member_invitation_short_links — reached only through SECURITY DEFINER
--    functions and the service role. No client role holds any privilege.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.member_invitation_short_links FROM anon;
REVOKE ALL ON TABLE public.member_invitation_short_links FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. ASSERTIONS — this file fails loudly rather than completing quietly.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_anon_fns int;
  v_auth_fns int;
  v_bad text;
BEGIN
  -- 4a. anon must not be able to execute ANY application function.
  SELECT count(*) INTO v_anon_fns
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_depend d ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
  WHERE n.nspname = 'public' AND d.objid IS NULL
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon_fns <> 0 THEN
    SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
    WHERE n.nspname = 'public' AND d.objid IS NULL
      AND has_function_privilege('anon', p.oid, 'EXECUTE');
    RAISE EXCEPTION
      'POSTAMBLE_FAILED: anon can execute % application function(s): %', v_anon_fns, left(v_bad, 400);
  END IF;

  -- 4b. authenticated must be able to execute exactly 193 of 203 — the ten
  --     revoked above are the difference. A count that drifts either way means
  --     the function surface changed without this file being updated.
  SELECT count(*) INTO v_auth_fns
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_depend d ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
  WHERE n.nspname = 'public' AND d.objid IS NULL
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF v_auth_fns <> 193 THEN
    RAISE EXCEPTION
      'POSTAMBLE_FAILED: authenticated can execute % application functions, expected 193.', v_auth_fns;
  END IF;

  -- 4c. Neither deviating relation may carry an anon grant.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('lease_rent_generation_runs','member_invitation_short_links')
      AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'POSTAMBLE_FAILED: anon still holds a grant on a table that must have none.';
  END IF;

  -- 4d. authenticated on lease_rent_generation_runs must be exactly SELECT.
  IF (
    SELECT coalesce(string_agg(privilege_type, ',' ORDER BY privilege_type), '(none)')
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'lease_rent_generation_runs' AND grantee = 'authenticated'
  ) <> 'SELECT' THEN
    RAISE EXCEPTION 'POSTAMBLE_FAILED: authenticated privileges on lease_rent_generation_runs are not exactly SELECT.';
  END IF;

  -- 4e. member_invitation_short_links must grant authenticated nothing.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'member_invitation_short_links' AND grantee = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'POSTAMBLE_FAILED: authenticated still holds a grant on member_invitation_short_links.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- SECTION 4 of 4: baseline_04_reference_data.sql
-- sha256 255fa05a5458e833dbfec5c0dfe933233f6232227fc325d2cf0e1f24518c0325
-- Reference data seed
-- ---------------------------------------------------------------------

-- Baseline file 4 of 5 -- REFERENCE DATA SEED
--
-- Applied last: after the schema, the auth companion and the security postamble.
--
-- TRANSPORT -- INSERT, not COPY
-- The previous attempt used `--use-copy`, producing `COPY ... FROM stdin`: a
-- form requiring a client that streams the following lines as data. The
-- Management API executes SQL text only, so line 29 was parsed as a statement
-- and the apply failed with `42601 syntax error at or near "RESORT_STANDARD"`.
-- That was a transport incompatibility, not a data defect -- but INSERT is the
-- right choice regardless: 456 rows is a trivial volume, and a security-
-- sensitive artefact worth reading line by line beats a faster load path.
--
-- NO `ON CONFLICT DO NOTHING`
-- Deliberately absent. This reproduces a database from zero; it is not an
-- idempotent migration. A row that already exists means the target was not the
-- empty database it is supposed to be, and that must fail loudly rather than be
-- skipped in silence -- exactly the condition that would make a gate result
-- meaningless.
--
-- `session_replication_role = replica` REMOVED
-- pg_dump emits it to suppress triggers and foreign-key checks during a bulk
-- load. It is stripped here on purpose: with it, `plan_entitlements -> plans`
-- and `role_template_permissions -> role_templates/permissions` would load
-- without being validated. Keeping the checks live means a successful apply is
-- itself evidence that the reference data is internally consistent.
--
-- CONTENTS -- 456 rows across 8 reference tables, plus one global role.
-- No tenant data: generated with `-s public` and 92 explicit table exclusions,
-- then proven by set-equality of every UUID against production's reference
-- primary keys.

BEGIN;

INSERT INTO "public"."coa_templates" ("key", "name_ar", "name_en") VALUES
	('RESORT_STANDARD', 'دليل الحسابات القياسي للمنتجعات', 'Standard Resort Chart of Accounts');

INSERT INTO "public"."coa_template_accounts" ("id", "template_key", "sort_order", "code", "parent_code", "name_ar", "name_en", "category", "normal_balance", "is_group", "is_cash_equivalent", "cash_flow_section") VALUES
	('f0727d6d-e9f5-43db-9ad1-9b0694e31ca6', 'RESORT_STANDARD', 1, '1000', NULL, 'الأصول', 'Assets', 'ASSET', 'DEBIT', true, false, NULL),
	('23d6be87-485f-49fe-95e0-756d7987c619', 'RESORT_STANDARD', 2, '1100', '1000', 'الأصول المتداولة', 'Current Assets', 'ASSET', 'DEBIT', true, false, NULL),
	('2b05eecb-9cf6-4e0f-8eef-8afa98b601fd', 'RESORT_STANDARD', 6, '1200', '1000', 'الأصول الثابتة', 'Fixed Assets', 'ASSET', 'DEBIT', true, false, NULL),
	('2574d24b-8409-4230-885a-e6586aeddb82', 'RESORT_STANDARD', 9, '2000', NULL, 'الخصوم', 'Liabilities', 'LIABILITY', 'CREDIT', true, false, NULL),
	('cfe8afa5-4977-49e3-9746-40ba08ab3ea9', 'RESORT_STANDARD', 12, '3000', NULL, 'حقوق الملكية', 'Equity', 'EQUITY', 'CREDIT', true, false, NULL),
	('005eb716-2e48-4789-a2a1-6dbf0c34f8a7', 'RESORT_STANDARD', 14, '4000', NULL, 'الإيرادات', 'Revenue', 'REVENUE', 'CREDIT', true, false, NULL),
	('1342a66d-40f7-489f-a5f6-8c407937eb28', 'RESORT_STANDARD', 18, '5000', NULL, 'المصروفات', 'Expenses', 'EXPENSE', 'DEBIT', true, false, NULL),
	('c3abee61-14a5-4a4d-9d18-19c9d886466b', 'RESORT_STANDARD', 3, '1110', '1100', 'الصندوق', 'Cash on Hand', 'ASSET', 'DEBIT', false, true, NULL),
	('19f1514f-fcd1-4659-bf05-87f41f01cf9f', 'RESORT_STANDARD', 4, '1120', '1100', 'البنوك', 'Banks', 'ASSET', 'DEBIT', false, true, NULL),
	('c13fbc01-eaf3-47bb-a158-71631291b114', 'RESORT_STANDARD', 5, '1130', '1100', 'ذمم الأعضاء المدينة', 'Accounts Receivable - Members', 'ASSET', 'DEBIT', false, false, 'OPERATING'),
	('cfd4124a-3826-4594-bd9c-bcb0c55db9ca', 'RESORT_STANDARD', 10, '2100', '2000', 'ذمم الموردين الدائنة', 'Accounts Payable - Suppliers', 'LIABILITY', 'CREDIT', false, false, 'OPERATING'),
	('f85c6abc-d061-43b6-9ca9-a1165d71a7d5', 'RESORT_STANDARD', 11, '2200', '2000', 'إيرادات مقبوضة مقدمًا', 'Unearned Revenue', 'LIABILITY', 'CREDIT', false, false, 'OPERATING'),
	('87fa7c6a-a874-4c46-8953-e47fed78bb03', 'RESORT_STANDARD', 15, '4100', '4000', 'إيرادات اشتراكات الصيانة', 'Maintenance Fee Revenue', 'REVENUE', 'CREDIT', false, false, 'OPERATING'),
	('34f60e4b-4440-415f-a9fc-510b3dcd9b7e', 'RESORT_STANDARD', 16, '4200', '4000', 'إيرادات رسوم العضوية', 'Membership Fee Revenue', 'REVENUE', 'CREDIT', false, false, 'OPERATING'),
	('0847b67b-8b7f-4b68-8c74-42f6369bf21f', 'RESORT_STANDARD', 17, '4300', '4000', 'إيرادات أخرى', 'Other Revenue', 'REVENUE', 'CREDIT', false, false, 'OPERATING'),
	('2e13e135-1860-4b31-be42-432338acb568', 'RESORT_STANDARD', 19, '5100', '5000', 'الرواتب والأجور', 'Salaries & Wages', 'EXPENSE', 'DEBIT', false, false, 'OPERATING'),
	('9d085f3a-742c-45e8-b50b-b5a350a3209f', 'RESORT_STANDARD', 20, '5200', '5000', 'الصيانة والتشغيل', 'Maintenance & Operations', 'EXPENSE', 'DEBIT', false, false, 'OPERATING'),
	('25f358be-9528-4922-a111-88f7c9250429', 'RESORT_STANDARD', 21, '5300', '5000', 'المرافق (كهرباء ومياه)', 'Utilities', 'EXPENSE', 'DEBIT', false, false, 'OPERATING'),
	('a14cc56f-73c4-46ae-b5c8-1f16b737acfe', 'RESORT_STANDARD', 22, '5400', '5000', 'مصروفات إدارية عامة', 'General & Administrative', 'EXPENSE', 'DEBIT', false, false, 'OPERATING'),
	('3d90aa2a-a5c9-4b23-89b3-ba36d2fe2524', 'RESORT_STANDARD', 7, '1210', '1200', 'مبانٍ ومنشآت', 'Buildings & Facilities', 'ASSET', 'DEBIT', false, false, 'INVESTING'),
	('9dd4911a-13bf-477b-a291-213e6353dded', 'RESORT_STANDARD', 8, '1220', '1200', 'مجمع الإهلاك', 'Accumulated Depreciation', 'ASSET', 'DEBIT', false, false, 'INVESTING'),
	('9307e3c1-902f-4bb9-a301-2d29af4384f7', 'RESORT_STANDARD', 13, '3100', '3000', 'الأرباح المرحّلة', 'Retained Earnings', 'EQUITY', 'CREDIT', false, false, 'FINANCING'),
	('b0e31738-1893-486e-ac0f-dd8160b13e08', 'RESORT_STANDARD', 23, '2300', '2000', 'ضريبة مخرجات مستحقة', 'Output Tax Payable', 'LIABILITY', 'CREDIT', false, false, 'OPERATING'),
	('51bd9b26-594b-4073-b4f7-de5166146c6c', 'RESORT_STANDARD', 24, '1140', '1100', 'ضريبة مدخلات قابلة للاسترداد', 'Recoverable Input Tax', 'ASSET', 'DEBIT', false, false, 'OPERATING');

INSERT INTO "public"."permissions" ("id", "key", "description") VALUES
	('4228356f-a24f-427a-bed8-280739f3e8f7', 'platform.organizations.manage', 'Create, suspend, reactivate organizations'),
	('f41dd8ee-b53b-4b1d-a8ac-295130ae8196', 'platform.subscriptions.manage', 'Assign plans and manage entitlements'),
	('c3c64b9a-6c40-433c-8790-7c0180249593', 'platform.audit.view', 'View platform-wide audit logs'),
	('11650e77-9e56-4111-a080-cc9ff76d5eb3', 'tenant.settings.manage', 'Manage organization profile, resorts, branding, financial settings'),
	('7d55dfb9-4b35-4eed-b807-9495c228f4e0', 'tenant.users.manage', 'Manage organization users, invitations, memberships'),
	('5ebb917a-3379-4160-ab8e-8cee01a96832', 'tenant.roles.manage', 'Manage organization roles and permission grants'),
	('69dbb48a-1ef0-4ba3-a6e3-927356a3c75c', 'property.units.view', 'View property units'),
	('cd9f241f-a48b-4aeb-bfc1-7bb654583374', 'property.units.manage', 'Manage property units'),
	('b880ce9f-c87a-405b-879d-351db72b2de8', 'property.members.view', 'View owners/members'),
	('764229dd-5d10-49a9-8cdf-3a32877a46e0', 'property.members.manage', 'Manage owners/members'),
	('3c3e8a8a-14dd-459a-8767-bed39ef9f738', 'finance.accounts.view', 'View chart of accounts'),
	('390d4173-6ba9-48d7-a0db-4cfcdc5cc9d0', 'finance.accounts.manage', 'Manage chart of accounts'),
	('1b1f35ee-d999-4715-807d-48e21721a327', 'finance.entries.create', 'Create journal entries'),
	('cdb07a01-d2e7-4f30-bac6-f252f3c192f6', 'finance.entries.review', 'Review journal entries'),
	('003a4503-5d04-4041-926b-fe3779b3b63f', 'finance.entries.post', 'Post journal entries'),
	('a6f2c50e-c770-4134-8271-e2b8173c5a2a', 'finance.entries.reverse', 'Reverse posted journal entries'),
	('2acf2eb2-e82c-4b74-b4f8-8e09dc277508', 'finance.periods.manage', 'Manage fiscal years and periods'),
	('9436b217-d17b-46f6-acd9-1f4dfe7fc14b', 'finance.reports.view', 'View financial reports'),
	('33934426-a8c1-4b6e-9123-cac421dae5ef', 'receivables.dues.create', 'Create dues'),
	('bad69c74-0ed0-486c-b291-775d0c8c230f', 'receivables.payments.create', 'Create payments'),
	('85d846f9-8b31-4e7b-964c-c0626cce0099', 'receivables.allocations.manage', 'Manage payment allocations'),
	('40888e42-556b-44f6-800e-333dcd5d3539', 'cashier.sessions.open', 'Open cashier sessions'),
	('4a38d1e9-c20f-40b2-8732-6520f99ead0b', 'cashier.sessions.close', 'Close cashier sessions'),
	('f66eb67a-886d-4ed4-bcef-60b0df6a93cc', 'cashier.transactions.create', 'Create cashier transactions'),
	('a45b1927-38d8-4475-a721-53c43d12356a', 'cashier.reconciliations.approve', 'Approve cashier reconciliations'),
	('0eae72b9-17e8-42d6-84a9-5f5d523b468c', 'banking.accounts.view', 'View bank accounts'),
	('d0e7ec37-9689-4cd6-80c6-16f38649d6e8', 'banking.cheques.manage', 'Manage cheques'),
	('b379de1c-453c-4b8e-bc32-06937574bc20', 'banking.reconciliations.manage', 'Manage bank reconciliations'),
	('9155198f-1b4c-4d25-b305-8cbf2d578127', 'inventory.items.manage', 'Manage inventory items'),
	('67d7d7a8-5553-4a20-a9e2-4d86272454a3', 'inventory.transactions.create', 'Create inventory transactions'),
	('7dc3dec4-9daa-45e7-9566-eaf78eb28387', 'inventory.adjustments.approve', 'Approve inventory adjustments'),
	('ce517338-d3ab-47fa-a41e-4ba408d6580f', 'purchasing.requests.create', 'Create purchase requests'),
	('04df2b75-8f30-4eb3-af84-cae4e8674e4e', 'purchasing.orders.approve', 'Approve purchase orders'),
	('e969ee9f-a24b-40a1-89ee-d4af1484670e', 'finance.payments.read', 'قراءة سجل الدفعات والإيصالات المالية'),
	('3f0176bd-badc-40e1-af69-d73f91df027e', 'finance.payments.create', 'تسجيل الدفعات وتحصيل الرسوم وتوزيعها'),
	('bb2cdbdd-3a42-4dec-8eec-8e930cfb680e', 'finance.dues.read', 'قراءة كشوف المستحقات ورصيد الديون'),
	('482eddac-f113-4b99-a284-431f1238a171', 'finance.dues.issue', 'إصدار المستحقات اليدوية الفردية والجماعية'),
	('c2f96681-1ca9-47fb-907a-9a258e8ef143', 'finance.schedules.read', 'قراءة الجداول والرسوم الدورية'),
	('3316b55a-f6ea-43fb-96c9-bbf41631ddab', 'finance.schedules.manage', 'إنشاء وتعديل وتفعيل الجداول الدورية'),
	('751b6759-9ca1-496c-835f-375ebdbb6815', 'finance.schedules.generate', 'التوليد الفوري للدورة المالية الآن'),
	('3506066a-987d-48c5-b620-c0dabc6ab51e', 'finance.reports.read', 'قراءة التقارير المالية وكشوف الحساب والميزانيات'),
	('fbf4377e-ff58-4a2c-8d52-08e40fff1c71', 'finance.reports.export', 'تصدير التقارير المالية بصيغة CSV أو PDF'),
	('06af1f25-6410-4c8f-b38d-92214c8e3a98', 'finance.audit.read', 'قراءة سجل التدقيق المالي المشفّر'),
	('3a4cb8ac-51aa-4a65-9f4f-95bc70d1b155', 'finance.audit.verify', 'تشغيل فحص سلامة سلسلة التشفير SHA-256'),
	('8bb704d5-5b6e-45c2-8e77-6e10f4587df0', 'finance.payments.void', 'إلغاء دفعة مسجَّلة (عكس محاسبي دون حذف)'),
	('06506bad-8392-4141-b5e8-7d6338a038b0', 'finance.expenses.read', 'قراءة سجل المصروفات وسندات الصرف'),
	('eea54123-734c-4b78-9305-dd4e770f00f0', 'finance.service_charges.read', 'الاطلاع على تحصيلات رسوم الخدمة وتوزيعها على الوحدات'),
	('c41b62cf-7e02-4bed-85e4-3e1d30267278', 'finance.suppliers.read', 'قراءة بيانات الموردين وطلبات وأوامر الشراء والفواتير والدفعات'),
	('b0d60e78-9f50-466b-879f-adbf70f2cdcd', 'finance.budgets.manage', 'إدارة الميزانيات التقديرية للحسابات لكل فترة مالية'),
	('1ab2f99b-fd8b-4253-819c-9010316aa5bc', 'finance.suppliers.void', 'إلغاء فاتورة مورد أو عكس دفعة مسددة له (عكس محاسبي دون حذف)'),
	('5305b7c7-c71e-460a-ad2f-523c6920c7b5', 'members.portal.invite', 'دعوة عضو (مالك) لإنشاء حساب في بوابة الملاك الذاتية'),
	('e2720f4f-7533-4873-8d1f-2d035a6f856a', 'finance.online_payments.manage', 'إدارة إعدادات مزودي الدفع الإلكتروني (Manage online payment provider settings)'),
	('e7cad0f6-1a04-489c-a3ba-4ebbeba1fe79', 'property.leases.view', 'عرض عقود الإيجار والإشغال'),
	('1cb25622-d6cd-4377-94e6-50a5de5ff7dc', 'property.leases.manage', 'إدارة عقود الإيجار والإشغال (إنشاء، تفعيل، إنهاء)'),
	('f6b90b8c-f372-4d51-bfa1-af777aa1e561', 'property.installments.view', 'عرض خطط التقسيط'),
	('4008104d-6662-4bd9-a5dd-8de2571d4092', 'property.installments.manage', 'إدارة خطط التقسيط (إنشاء، إلغاء)'),
	('e2e432de-bf71-48a8-8ceb-a19e82babdb0', 'finance.bank_reconciliation.read', 'الاطلاع على كشوف الحسابات البنكية والمطابقات'),
	('2a36bd49-2dcd-4237-b1be-18247964d707', 'finance.bank_reconciliation.manage', 'استيراد كشوف الحسابات البنكية وتنفيذ المطابقة واعتمادها'),
	('b5a536fe-e643-4074-809c-8e5fa4d724d1', 'finance.service_charges.manage', 'إنشاء تحصيلات رسوم الخدمة وحساب التوزيع وإصدارها على الوحدات'),
	('24709092-fc90-468d-9be3-dda45973d9ca', 'finance.commissions.read', 'الاطلاع على الوسطاء وعمولاتهم'),
	('856e50e3-93d6-44d9-8f37-1c276caa6314', 'finance.commissions.manage', 'إضافة الوسطاء وتسجيل استحقاق العمولات وسدادها'),
	('14c88d5c-e441-4081-9958-ce241a71bb90', 'property.handover.read', 'الاطلاع على تسليم الوحدات وقوائم الملاحظات'),
	('a1f13ee1-c601-4e56-b53f-61cb0722a88e', 'property.handover.manage', 'جدولة تسليم الوحدات وتسجيل الملاحظات واعتماد التسليم'),
	('7bdb05ca-01e9-41f0-8592-b1045d695b49', 'finance.einvoice.read', 'الاطلاع على حالة الفواتير الإلكترونية وسجل إرسالها'),
	('1cf58bde-2898-4265-8a80-a3a96537380a', 'finance.einvoice.manage', 'ضبط التسجيل لدى مصلحة الضرائب وإرسال الفواتير الإلكترونية'),
	('6f6b7549-4d4e-4356-915a-da3a8a04a177', 'finance.tax_mapping.read', 'الاطلاع على ربط أنواع المستحقات بطبيعة الإيراد والقرارات الضريبية'),
	('3fc89a3e-2a87-4484-9280-af1f1fe15793', 'finance.tax_mapping.manage', 'ربط أنواع المستحقات بطبيعة الإيراد واعتمادها'),
	('b75fd988-f070-473b-9cac-81c6b0a3f7d7', 'finance.tax_enforcement.manage', 'تفعيل أو إيقاف الإنفاذ الضريبي للمؤسسة'),
	('531c6fdd-11f2-429e-8bbb-044a5a79d4ac', 'finance.assets.read', 'الاطلاع على سجل الأصول الثابتة وإهلاكها'),
	('05b21a38-8757-4f0d-85f6-ec4e6f96130d', 'finance.assets.manage', 'تسجيل الأصول الثابتة وترحيل الإهلاك'),
	('9a34c54a-2076-417c-a98d-f3ae4a4ec4a0', 'finance.fx.read', 'الاطلاع على أسعار الصرف'),
	('6ac66a7e-2a23-42ef-9901-6c2cc344914c', 'finance.fx.manage', 'تسجيل أسعار الصرف وتعديلها'),
	('4b05ae1e-2a58-4688-8ec6-f0c24cf8165d', 'finance.dunning.read', 'الاطلاع على سياسات وإشعارات التحصيل'),
	('3542b267-81bd-4a7f-a6f5-60ec6b3f371f', 'finance.dunning.manage', 'ضبط سياسات التحصيل ورفع الإشعارات');

INSERT INTO "public"."plans" ("id", "key", "name_ar", "name_en", "sort_order", "created_at") VALUES
	('da6711ae-16fd-4409-9da2-896d68227ba6', 'STARTER', 'الأساسية', 'Starter', 1, '2026-08-10 12:54:06.042068+00'),
	('a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'PROFESSIONAL', 'الاحترافية', 'Professional', 2, '2026-08-10 12:54:06.042068+00'),
	('8ffcdb95-43db-4df8-85e1-d045d8272563', 'ENTERPRISE', 'المؤسسية', 'Enterprise', 3, '2026-08-10 12:54:06.042068+00');

INSERT INTO "public"."plan_entitlements" ("id", "plan_id", "key", "value") VALUES
	('f42b9295-0d65-4e54-9cdc-df6572dc0958', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'max_resorts', '1'),
	('bcc6ac98-e478-42ad-bd04-2dd3fdc17716', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'max_users', '5'),
	('977f40cc-625e-4eed-9448-e7a3d0dff7fa', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'max_units', '100'),
	('c149c612-0223-41da-8a17-96b3a97177e9', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'finance_module', 'true'),
	('2823c4d5-db46-4f78-87a1-3834696474d1', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'cashier_module', 'true'),
	('f5f57a73-4f51-4ef6-b379-f599835c8a95', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'banking_module', 'false'),
	('ec899a24-3e45-43d5-a178-11d2eaeb1e79', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'fixed_assets_module', 'false'),
	('80694aa9-9824-4aa3-bf5d-732067e4b0fd', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'inventory_module', 'false'),
	('1faf49f1-b230-4280-99df-b785981b868f', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'purchasing_module', 'false'),
	('ccf1274b-e910-4a10-a0a2-14e5bc9866ca', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'advanced_reports', 'false'),
	('5fc3a707-6fe4-4535-8919-a17fc78f5df4', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'white_label', 'false'),
	('2effa5b7-3af8-492d-ab66-af75e2002dbf', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'api_access', 'false'),
	('317ce911-4b1e-42a9-a262-4742d84fc8c4', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'audit_retention_days', '30'),
	('f0f583a5-ef36-4ce1-8496-fc76075ae08a', 'da6711ae-16fd-4409-9da2-896d68227ba6', 'priority_support', 'false'),
	('f53387b0-c24a-429c-9ca3-981457e68629', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'max_resorts', '3'),
	('6608cfa4-9c32-4eda-8dd1-25143ca3527a', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'max_users', '25'),
	('f98779f8-bfa9-4434-8577-409ab9ea314a', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'max_units', '1000'),
	('e3e9b9ae-65d3-419c-99bd-05bd986318c7', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'finance_module', 'true'),
	('b74096c5-ae48-4686-8e4c-9f5ab5b11dce', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'cashier_module', 'true'),
	('3e46a215-4044-47ef-a7f1-9c00b6bdeee5', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'banking_module', 'true'),
	('d342ad41-821a-4784-a01f-e5f9b6f9da42', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'fixed_assets_module', 'true'),
	('5796f2cf-a42d-4852-9b53-cb44f7488f79', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'inventory_module', 'true'),
	('3e66927a-5779-4948-aeed-847ed3c33308', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'purchasing_module', 'false'),
	('f34a2727-46e2-4cb6-8517-bae9455af475', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'advanced_reports', 'true'),
	('3217ac2c-a83b-4690-a934-0bfd68a0c720', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'white_label', 'false'),
	('2dea28d3-f545-4e45-8ac5-86f804c3b226', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'api_access', 'false'),
	('493ead8a-45ae-44f5-94b8-2fbaa3f5e271', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'audit_retention_days', '180'),
	('69126009-9b16-4736-a8b8-1dad0f84144d', 'a09b61fb-6ee2-4446-9fc4-6bd70eb11b33', 'priority_support', 'false'),
	('2d18d11a-f3ba-4715-80cb-5c3b038c7ba8', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'max_resorts', '-1'),
	('b5b7c3c3-7d36-4e09-bb69-c7ce34ac5583', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'max_users', '-1'),
	('71abd6bb-1006-4763-a34e-73e372994392', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'max_units', '-1'),
	('c5119bd5-0d60-4218-b7a0-4601cc4f866d', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'finance_module', 'true'),
	('ff603f5c-a8cf-44ab-bc1b-2fe248b93f93', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'cashier_module', 'true'),
	('deb6be7c-7ba7-4ec5-83de-81fd6cdc6e7c', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'banking_module', 'true'),
	('a22aca8c-bc99-4323-9b14-22243f10adb5', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'fixed_assets_module', 'true'),
	('5df6f529-0a8a-411c-b810-4a3c7c124ef2', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'inventory_module', 'true'),
	('93fa22eb-68c3-4b29-8d7b-0a029e3d14e5', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'purchasing_module', 'true'),
	('8091ef53-ab69-4f2e-b3c2-0ca52aeaff7c', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'advanced_reports', 'true'),
	('6d27102a-3a82-4f29-ae9e-0ba0babf29ad', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'white_label', 'true'),
	('8466ec8d-bd61-40ec-8275-bceef4897dad', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'api_access', 'true'),
	('4e375b38-b85a-41cb-9066-095eaf31fb4b', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'audit_retention_days', '365'),
	('c4ed42e0-2ceb-4651-a935-0a03ef2f5c41', '8ffcdb95-43db-4df8-85e1-d045d8272563', 'priority_support', 'true');

INSERT INTO "public"."revenue_natures" ("code", "name_ar", "name_en", "is_derived", "sort_order", "created_at") VALUES
	('RESIDENTIAL_RENT', 'إيجار وحدة سكنية', 'Residential Rent', false, 1, '2026-08-18 14:33:37.706927+00'),
	('COMMERCIAL_RENT', 'إيجار وحدة تجارية', 'Commercial Rent', false, 2, '2026-08-18 14:33:37.706927+00'),
	('RESIDENTIAL_UNIT_SALE', 'بيع وحدة سكنية', 'Residential Unit Sale', false, 3, '2026-08-18 14:33:37.706927+00'),
	('COMMERCIAL_UNIT_SALE', 'بيع وحدة تجارية', 'Commercial Unit Sale', false, 4, '2026-08-18 14:33:37.706927+00'),
	('SALE_BOOKING_PAYMENT', 'دفعة حجز', 'Booking / Reservation', true, 5, '2026-08-18 14:33:37.706927+00'),
	('SALE_DOWN_PAYMENT', 'مقدم بيع', 'Down Payment', true, 6, '2026-08-18 14:33:37.706927+00'),
	('SALE_INSTALLMENT', 'قسط وحدة', 'Unit Installment', true, 7, '2026-08-18 14:33:37.706927+00'),
	('SALE_FINAL_PAYMENT', 'الدفعة النهائية', 'Final Unit Payment', true, 8, '2026-08-18 14:33:37.706927+00'),
	('SALE_ADMINISTRATIVE_FEE', 'رسوم إدارية للبيع', 'Administrative Fee - Sale', false, 9, '2026-08-18 14:33:37.706927+00'),
	('TRANSFER_FEE', 'رسوم نقل أو تنازل', 'Transfer Fee', false, 10, '2026-08-18 14:33:37.706927+00'),
	('MANAGEMENT_FEE', 'رسوم إدارة', 'Management Fee', false, 11, '2026-08-18 14:33:37.706927+00'),
	('MAINTENANCE_SERVICE', 'رسوم صيانة', 'Maintenance Fee', false, 12, '2026-08-18 14:33:37.706927+00'),
	('SECURITY_SERVICE', 'أمن وحراسة', 'Security Fee', false, 13, '2026-08-18 14:33:37.706927+00'),
	('CLEANING_SERVICE', 'نظافة', 'Cleaning Fee', false, 14, '2026-08-18 14:33:37.706927+00'),
	('LANDSCAPING_SERVICE', 'تنسيق حدائق', 'Landscaping Fee', false, 15, '2026-08-18 14:33:37.706927+00'),
	('CLUB_OR_FACILITY_SERVICE', 'استخدام مرافق أو نادٍ', 'Facility / Club Fee', false, 16, '2026-08-18 14:33:37.706927+00'),
	('UTILITY_RECHARGE', 'إعادة تحميل مرافق', 'Utilities Recharge', false, 17, '2026-08-18 14:33:37.706927+00'),
	('UTILITY_ADMINISTRATION_FEE', 'رسوم إدارة مرافق', 'Utility Administration Fee', false, 18, '2026-08-18 14:33:37.706927+00'),
	('LATE_PAYMENT_PENALTY', 'غرامة تأخير', 'Late Payment Penalty', false, 19, '2026-08-18 14:33:37.706927+00'),
	('RESERVATION_CANCELLATION_FEE', 'رسوم إلغاء حجز', 'Reservation Cancellation Fee', false, 20, '2026-08-18 14:33:37.706927+00'),
	('REFUND_RENT', 'رد إيجار', 'Refund - Rent', true, 21, '2026-08-18 14:33:37.706927+00'),
	('REFUND_INSTALLMENT', 'رد قسط', 'Refund - Installment', true, 22, '2026-08-18 14:33:37.706927+00'),
	('REFUND_SERVICE', 'رد رسوم خدمة', 'Refund - Service', true, 23, '2026-08-18 14:33:37.706927+00'),
	('SECURITY_DEPOSIT', 'تأمين قابل للرد', 'Security Deposit', false, 24, '2026-08-18 14:33:37.706927+00'),
	('DEPOSIT_APPLIED_TO_SALE', 'تأمين محوَّل للبيع', 'Deposit Applied to Sale', true, 25, '2026-08-18 14:33:37.706927+00'),
	('DEPOSIT_FORFEITED', 'تأمين مصادَر', 'Deposit Forfeited', false, 26, '2026-08-18 14:33:37.706927+00'),
	('PARKING_FEE', 'رسوم موقف سيارات', 'Parking Fee', false, 27, '2026-08-18 14:33:37.706927+00'),
	('ACCESS_CARD_FEE', 'كارت دخول', 'Access Card Fee', false, 28, '2026-08-18 14:33:37.706927+00'),
	('REPLACEMENT_CARD_FEE', 'بدل فاقد', 'Replacement Card Fee', false, 29, '2026-08-18 14:33:37.706927+00'),
	('GUEST_SERVICE_FEE', 'خدمة للزائر', 'Guest Service Fee', false, 30, '2026-08-18 14:33:37.706927+00'),
	('RENTAL_MANAGEMENT_COMMISSION', 'عمولة إدارة تأجير', 'Rental Management Commission', false, 31, '2026-08-18 14:33:37.706927+00'),
	('BROKER_COMMISSION', 'عمولة وساطة', 'Broker / Commission Income', false, 32, '2026-08-18 14:33:37.706927+00'),
	('ADVERTISING_PROMOTION_FEE', 'إعلان أو ترويج', 'Advertising / Promotion Fee', false, 33, '2026-08-18 14:33:37.706927+00'),
	('EVENT_VENUE_FEE', 'تأجير مكان لحدث', 'Event / Venue Fee', false, 34, '2026-08-18 14:33:37.706927+00'),
	('CONTRACTOR_RECHARGE', 'تحميل تكلفة مقاول', 'Contractor Recharge', false, 35, '2026-08-18 14:33:37.706927+00'),
	('INTEREST_FINANCING_CHARGE', 'فوائد أو رسوم تمويل', 'Interest / Financing Charge', false, 36, '2026-08-18 14:33:37.706927+00'),
	('OWNER_ASSOCIATION_CONTRIBUTION', 'مساهمة اتحاد ملاك', 'Owners Association Contribution', false, 37, '2026-08-18 14:33:37.706927+00');

INSERT INTO "public"."role_templates" ("key", "name_ar", "name_en", "sort_order") VALUES
	('TENANT_OWNER', 'مالك المنظمة', 'Tenant Owner', 1),
	('TENANT_ADMIN', 'مدير النظام', 'Tenant Admin', 2),
	('GENERAL_MANAGER', 'المدير العام', 'General Manager', 3),
	('FINANCE_MANAGER', 'المدير المالي', 'Finance Manager', 4),
	('ACCOUNTANT', 'محاسب', 'Accountant', 5),
	('CASHIER', 'أمين خزينة', 'Cashier', 6),
	('COLLECTOR', 'محصّل', 'Collector', 7),
	('AUDITOR', 'مراجع', 'Auditor', 8),
	('PROPERTY_MANAGER', 'مدير أملاك', 'Property Manager', 9),
	('STOREKEEPER', 'أمين مخزن', 'Storekeeper', 10),
	('PURCHASING_MANAGER', 'مدير مشتريات', 'Purchasing Manager', 11),
	('VIEWER', 'مشاهد', 'Viewer', 12);

INSERT INTO "public"."role_template_permissions" ("role_template_key", "permission_key") VALUES
	('TENANT_OWNER', 'tenant.settings.manage'),
	('TENANT_OWNER', 'tenant.users.manage'),
	('TENANT_OWNER', 'tenant.roles.manage'),
	('TENANT_OWNER', 'property.units.view'),
	('TENANT_OWNER', 'property.units.manage'),
	('TENANT_OWNER', 'property.members.view'),
	('TENANT_OWNER', 'property.members.manage'),
	('TENANT_OWNER', 'finance.accounts.view'),
	('TENANT_OWNER', 'finance.accounts.manage'),
	('TENANT_OWNER', 'finance.entries.create'),
	('TENANT_OWNER', 'finance.entries.review'),
	('TENANT_OWNER', 'finance.entries.post'),
	('TENANT_OWNER', 'finance.entries.reverse'),
	('TENANT_OWNER', 'finance.periods.manage'),
	('TENANT_OWNER', 'finance.reports.view'),
	('TENANT_OWNER', 'finance.reports.export'),
	('TENANT_OWNER', 'receivables.dues.create'),
	('TENANT_OWNER', 'receivables.payments.create'),
	('TENANT_OWNER', 'receivables.allocations.manage'),
	('TENANT_OWNER', 'cashier.sessions.open'),
	('TENANT_OWNER', 'cashier.sessions.close'),
	('TENANT_OWNER', 'cashier.transactions.create'),
	('TENANT_OWNER', 'cashier.reconciliations.approve'),
	('TENANT_OWNER', 'banking.accounts.view'),
	('TENANT_OWNER', 'banking.cheques.manage'),
	('TENANT_OWNER', 'banking.reconciliations.manage'),
	('TENANT_OWNER', 'inventory.items.manage'),
	('TENANT_OWNER', 'inventory.transactions.create'),
	('TENANT_OWNER', 'inventory.adjustments.approve'),
	('TENANT_OWNER', 'purchasing.requests.create'),
	('TENANT_OWNER', 'purchasing.orders.approve'),
	('TENANT_ADMIN', 'tenant.settings.manage'),
	('TENANT_ADMIN', 'tenant.users.manage'),
	('TENANT_ADMIN', 'tenant.roles.manage'),
	('TENANT_ADMIN', 'property.units.view'),
	('TENANT_ADMIN', 'property.members.view'),
	('TENANT_ADMIN', 'finance.reports.view'),
	('GENERAL_MANAGER', 'property.units.view'),
	('GENERAL_MANAGER', 'property.members.view'),
	('GENERAL_MANAGER', 'finance.reports.view'),
	('GENERAL_MANAGER', 'finance.reports.export'),
	('GENERAL_MANAGER', 'receivables.dues.create'),
	('GENERAL_MANAGER', 'receivables.payments.create'),
	('GENERAL_MANAGER', 'cashier.reconciliations.approve'),
	('GENERAL_MANAGER', 'banking.accounts.view'),
	('GENERAL_MANAGER', 'inventory.adjustments.approve'),
	('GENERAL_MANAGER', 'purchasing.orders.approve'),
	('FINANCE_MANAGER', 'finance.accounts.view'),
	('FINANCE_MANAGER', 'finance.accounts.manage'),
	('FINANCE_MANAGER', 'finance.entries.create'),
	('FINANCE_MANAGER', 'finance.entries.review'),
	('FINANCE_MANAGER', 'finance.entries.post'),
	('FINANCE_MANAGER', 'finance.entries.reverse'),
	('FINANCE_MANAGER', 'finance.periods.manage'),
	('FINANCE_MANAGER', 'finance.reports.view'),
	('FINANCE_MANAGER', 'finance.reports.export'),
	('FINANCE_MANAGER', 'receivables.dues.create'),
	('FINANCE_MANAGER', 'receivables.payments.create'),
	('FINANCE_MANAGER', 'receivables.allocations.manage'),
	('FINANCE_MANAGER', 'banking.accounts.view'),
	('FINANCE_MANAGER', 'banking.cheques.manage'),
	('FINANCE_MANAGER', 'banking.reconciliations.manage'),
	('FINANCE_MANAGER', 'cashier.reconciliations.approve'),
	('ACCOUNTANT', 'finance.accounts.view'),
	('ACCOUNTANT', 'finance.entries.create'),
	('ACCOUNTANT', 'finance.entries.review'),
	('ACCOUNTANT', 'finance.reports.view'),
	('ACCOUNTANT', 'receivables.dues.create'),
	('ACCOUNTANT', 'receivables.payments.create'),
	('ACCOUNTANT', 'receivables.allocations.manage'),
	('CASHIER', 'cashier.sessions.open'),
	('CASHIER', 'cashier.sessions.close'),
	('CASHIER', 'cashier.transactions.create'),
	('CASHIER', 'receivables.payments.create'),
	('COLLECTOR', 'property.units.view'),
	('COLLECTOR', 'property.members.view'),
	('COLLECTOR', 'receivables.payments.create'),
	('AUDITOR', 'finance.accounts.view'),
	('AUDITOR', 'finance.reports.view'),
	('AUDITOR', 'finance.reports.export'),
	('AUDITOR', 'property.units.view'),
	('AUDITOR', 'property.members.view'),
	('AUDITOR', 'banking.accounts.view'),
	('PROPERTY_MANAGER', 'property.units.view'),
	('PROPERTY_MANAGER', 'property.units.manage'),
	('PROPERTY_MANAGER', 'property.members.view'),
	('PROPERTY_MANAGER', 'property.members.manage'),
	('STOREKEEPER', 'inventory.items.manage'),
	('STOREKEEPER', 'inventory.transactions.create'),
	('PURCHASING_MANAGER', 'purchasing.requests.create'),
	('PURCHASING_MANAGER', 'purchasing.orders.approve'),
	('VIEWER', 'finance.reports.view'),
	('VIEWER', 'property.units.view'),
	('VIEWER', 'property.members.view'),
	('TENANT_OWNER', 'finance.payments.read'),
	('TENANT_OWNER', 'finance.payments.create'),
	('TENANT_OWNER', 'finance.dues.read'),
	('TENANT_OWNER', 'finance.dues.issue'),
	('TENANT_OWNER', 'finance.schedules.read'),
	('TENANT_OWNER', 'finance.schedules.manage'),
	('TENANT_OWNER', 'finance.schedules.generate'),
	('TENANT_OWNER', 'finance.reports.read'),
	('TENANT_OWNER', 'finance.audit.read'),
	('TENANT_OWNER', 'finance.audit.verify'),
	('TENANT_ADMIN', 'finance.reports.read'),
	('TENANT_ADMIN', 'finance.dues.read'),
	('TENANT_ADMIN', 'finance.schedules.read'),
	('TENANT_ADMIN', 'finance.payments.read'),
	('TENANT_ADMIN', 'finance.audit.read'),
	('GENERAL_MANAGER', 'finance.reports.read'),
	('GENERAL_MANAGER', 'finance.dues.read'),
	('GENERAL_MANAGER', 'finance.dues.issue'),
	('GENERAL_MANAGER', 'finance.payments.read'),
	('GENERAL_MANAGER', 'finance.payments.create'),
	('GENERAL_MANAGER', 'finance.schedules.read'),
	('FINANCE_MANAGER', 'finance.payments.read'),
	('FINANCE_MANAGER', 'finance.payments.create'),
	('FINANCE_MANAGER', 'finance.dues.read'),
	('FINANCE_MANAGER', 'finance.dues.issue'),
	('FINANCE_MANAGER', 'finance.schedules.read'),
	('FINANCE_MANAGER', 'finance.schedules.manage'),
	('FINANCE_MANAGER', 'finance.schedules.generate'),
	('FINANCE_MANAGER', 'finance.reports.read'),
	('FINANCE_MANAGER', 'finance.audit.read'),
	('ACCOUNTANT', 'finance.reports.read'),
	('ACCOUNTANT', 'finance.dues.read'),
	('ACCOUNTANT', 'finance.dues.issue'),
	('ACCOUNTANT', 'finance.payments.read'),
	('ACCOUNTANT', 'finance.payments.create'),
	('ACCOUNTANT', 'finance.schedules.read'),
	('CASHIER', 'finance.payments.read'),
	('CASHIER', 'finance.payments.create'),
	('CASHIER', 'finance.dues.read'),
	('CASHIER', 'finance.schedules.read'),
	('CASHIER', 'finance.reports.read'),
	('COLLECTOR', 'finance.dues.read'),
	('COLLECTOR', 'finance.payments.read'),
	('COLLECTOR', 'finance.payments.create'),
	('AUDITOR', 'finance.reports.read'),
	('AUDITOR', 'finance.dues.read'),
	('AUDITOR', 'finance.schedules.read'),
	('AUDITOR', 'finance.payments.read'),
	('AUDITOR', 'finance.audit.read'),
	('AUDITOR', 'finance.audit.verify'),
	('PROPERTY_MANAGER', 'finance.dues.read'),
	('PROPERTY_MANAGER', 'finance.schedules.read'),
	('PROPERTY_MANAGER', 'finance.payments.read'),
	('VIEWER', 'finance.reports.read'),
	('VIEWER', 'finance.dues.read'),
	('VIEWER', 'finance.schedules.read'),
	('VIEWER', 'finance.payments.read'),
	('FINANCE_MANAGER', 'finance.payments.void'),
	('FINANCE_MANAGER', 'finance.expenses.read'),
	('ACCOUNTANT', 'finance.expenses.read'),
	('AUDITOR', 'finance.expenses.read'),
	('TENANT_OWNER', 'finance.payments.void'),
	('TENANT_OWNER', 'finance.expenses.read'),
	('TENANT_OWNER', 'finance.suppliers.read'),
	('PURCHASING_MANAGER', 'finance.suppliers.read'),
	('GENERAL_MANAGER', 'finance.suppliers.read'),
	('FINANCE_MANAGER', 'finance.suppliers.read'),
	('ACCOUNTANT', 'finance.suppliers.read'),
	('AUDITOR', 'finance.suppliers.read'),
	('TENANT_OWNER', 'finance.budgets.manage'),
	('FINANCE_MANAGER', 'finance.budgets.manage'),
	('TENANT_OWNER', 'finance.suppliers.void'),
	('FINANCE_MANAGER', 'finance.suppliers.void'),
	('TENANT_OWNER', 'members.portal.invite'),
	('FINANCE_MANAGER', 'members.portal.invite'),
	('ACCOUNTANT', 'members.portal.invite'),
	('PROPERTY_MANAGER', 'members.portal.invite'),
	('TENANT_OWNER', 'finance.online_payments.manage'),
	('FINANCE_MANAGER', 'finance.online_payments.manage'),
	('TENANT_OWNER', 'property.leases.view'),
	('TENANT_OWNER', 'property.leases.manage'),
	('TENANT_ADMIN', 'property.leases.view'),
	('GENERAL_MANAGER', 'property.leases.view'),
	('PROPERTY_MANAGER', 'property.leases.view'),
	('PROPERTY_MANAGER', 'property.leases.manage'),
	('FINANCE_MANAGER', 'property.leases.view'),
	('ACCOUNTANT', 'property.leases.view'),
	('COLLECTOR', 'property.leases.view'),
	('AUDITOR', 'property.leases.view'),
	('VIEWER', 'property.leases.view'),
	('TENANT_OWNER', 'property.installments.view'),
	('TENANT_OWNER', 'property.installments.manage'),
	('TENANT_ADMIN', 'property.installments.view'),
	('GENERAL_MANAGER', 'property.installments.view'),
	('PROPERTY_MANAGER', 'property.installments.view'),
	('PROPERTY_MANAGER', 'property.installments.manage'),
	('FINANCE_MANAGER', 'property.installments.view'),
	('ACCOUNTANT', 'property.installments.view'),
	('COLLECTOR', 'property.installments.view'),
	('AUDITOR', 'property.installments.view'),
	('VIEWER', 'property.installments.view'),
	('TENANT_OWNER', 'finance.bank_reconciliation.read'),
	('TENANT_OWNER', 'finance.bank_reconciliation.manage'),
	('FINANCE_MANAGER', 'finance.bank_reconciliation.read'),
	('FINANCE_MANAGER', 'finance.bank_reconciliation.manage'),
	('ACCOUNTANT', 'finance.bank_reconciliation.read'),
	('ACCOUNTANT', 'finance.bank_reconciliation.manage'),
	('AUDITOR', 'finance.bank_reconciliation.read'),
	('TENANT_OWNER', 'finance.service_charges.read'),
	('TENANT_OWNER', 'finance.service_charges.manage'),
	('FINANCE_MANAGER', 'finance.service_charges.read'),
	('FINANCE_MANAGER', 'finance.service_charges.manage'),
	('ACCOUNTANT', 'finance.service_charges.read'),
	('ACCOUNTANT', 'finance.service_charges.manage'),
	('PROPERTY_MANAGER', 'finance.service_charges.read'),
	('AUDITOR', 'finance.service_charges.read'),
	('TENANT_OWNER', 'finance.commissions.read'),
	('TENANT_OWNER', 'finance.commissions.manage'),
	('FINANCE_MANAGER', 'finance.commissions.read'),
	('FINANCE_MANAGER', 'finance.commissions.manage'),
	('ACCOUNTANT', 'finance.commissions.read'),
	('ACCOUNTANT', 'finance.commissions.manage'),
	('PROPERTY_MANAGER', 'finance.commissions.read'),
	('AUDITOR', 'finance.commissions.read'),
	('TENANT_OWNER', 'property.handover.read'),
	('TENANT_OWNER', 'property.handover.manage'),
	('PROPERTY_MANAGER', 'property.handover.read'),
	('PROPERTY_MANAGER', 'property.handover.manage'),
	('GENERAL_MANAGER', 'property.handover.read'),
	('AUDITOR', 'property.handover.read'),
	('TENANT_OWNER', 'finance.einvoice.read'),
	('TENANT_OWNER', 'finance.einvoice.manage'),
	('FINANCE_MANAGER', 'finance.einvoice.read'),
	('FINANCE_MANAGER', 'finance.einvoice.manage'),
	('ACCOUNTANT', 'finance.einvoice.read'),
	('ACCOUNTANT', 'finance.einvoice.manage'),
	('AUDITOR', 'finance.einvoice.read'),
	('TENANT_OWNER', 'finance.tax_mapping.read'),
	('TENANT_OWNER', 'finance.tax_mapping.manage'),
	('FINANCE_MANAGER', 'finance.tax_mapping.read'),
	('FINANCE_MANAGER', 'finance.tax_mapping.manage'),
	('ACCOUNTANT', 'finance.tax_mapping.read'),
	('ACCOUNTANT', 'finance.tax_mapping.manage'),
	('TENANT_OWNER', 'finance.tax_enforcement.manage'),
	('FINANCE_MANAGER', 'finance.tax_enforcement.manage'),
	('TENANT_OWNER', 'finance.assets.read'),
	('TENANT_OWNER', 'finance.assets.manage'),
	('FINANCE_MANAGER', 'finance.assets.read'),
	('FINANCE_MANAGER', 'finance.assets.manage'),
	('ACCOUNTANT', 'finance.assets.read'),
	('ACCOUNTANT', 'finance.assets.manage'),
	('PROPERTY_MANAGER', 'finance.assets.read'),
	('AUDITOR', 'finance.assets.read'),
	('TENANT_OWNER', 'finance.fx.read'),
	('TENANT_OWNER', 'finance.fx.manage'),
	('FINANCE_MANAGER', 'finance.fx.read'),
	('FINANCE_MANAGER', 'finance.fx.manage'),
	('ACCOUNTANT', 'finance.fx.read'),
	('ACCOUNTANT', 'finance.fx.manage'),
	('AUDITOR', 'finance.fx.read'),
	('CASHIER', 'finance.fx.read'),
	('TENANT_OWNER', 'finance.dunning.read'),
	('TENANT_OWNER', 'finance.dunning.manage'),
	('FINANCE_MANAGER', 'finance.dunning.read'),
	('FINANCE_MANAGER', 'finance.dunning.manage'),
	('ACCOUNTANT', 'finance.dunning.read'),
	('COLLECTOR', 'finance.dunning.read'),
	('COLLECTOR', 'finance.dunning.manage'),
	('AUDITOR', 'finance.dunning.read');

--
-- The single global role, appended by hand.
--
-- pg_dump cannot row-filter, and public.roles holds 6,889 rows of which 6,888
-- are per-tenant clones created at onboarding by clone_tenant_role_templates().
-- Dumping the table wholesale would put every tenant's roles into the baseline.
-- Only the row with organization_id IS NULL belongs here.
--
-- Verified: exactly one such row exists in production, and it is
-- PLATFORM_SUPER_ADMIN. Four integration suites assert this role exists.
--
INSERT INTO public.roles (id, organization_id, key, name_ar, name_en, is_system, created_at)
VALUES ('d7212d4b-8899-4a52-af9a-60be2e6ea79e', NULL, 'PLATFORM_SUPER_ADMIN', 'مدير المنصة العام', 'Platform Super Admin', 't', '2026-08-10 12:17:44.80389+00');

--
-- ASSERTIONS -- inside the transaction, so a failure rolls the seed back
-- entirely rather than leaving the database partly populated.
--
DO $$
DECLARE
  v_total int;
  v_roles int;
  v_tenant int;
  v_bad text;
BEGIN
  SELECT (SELECT count(*) FROM public.permissions)
       + (SELECT count(*) FROM public.role_templates)
       + (SELECT count(*) FROM public.role_template_permissions)
       + (SELECT count(*) FROM public.coa_templates)
       + (SELECT count(*) FROM public.coa_template_accounts)
       + (SELECT count(*) FROM public.revenue_natures)
       + (SELECT count(*) FROM public.plans)
       + (SELECT count(*) FROM public.plan_entitlements)
    INTO v_total;
  IF v_total <> 456 THEN
    RAISE EXCEPTION 'SEED_FAILED: reference rows = %, expected 456.', v_total;
  END IF;

  SELECT count(*) INTO v_roles FROM public.roles;
  IF v_roles <> 1 THEN
    RAISE EXCEPTION 'SEED_FAILED: public.roles holds % rows, expected exactly 1.', v_roles;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.roles
                 WHERE organization_id IS NULL AND key = 'PLATFORM_SUPER_ADMIN') THEN
    RAISE EXCEPTION 'SEED_FAILED: the single role is not the global PLATFORM_SUPER_ADMIN.';
  END IF;

  -- Checked directly, not trusted from the exclusion list: the first seed
  -- attempt leaked 22 auth tables while its exclusion list looked correct.
  SELECT count(*), string_agg(t, ', ' ORDER BY t) INTO v_tenant, v_bad
  FROM (
    SELECT c.relname AS t
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname NOT IN ('permissions','role_templates','role_template_permissions',
                            'coa_templates','coa_template_accounts','revenue_natures',
                            'plans','plan_entitlements','roles')
      AND (xpath('/row/c/text()',
             query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname),
                          false, true, '')))[1]::text::int > 0
  ) q;
  IF v_tenant > 0 THEN
    RAISE EXCEPTION 'SEED_FAILED: % tenant table(s) contain rows: %', v_tenant, left(v_bad, 400);
  END IF;
END
$$;

COMMIT;

