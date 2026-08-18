-- E-invoicing core: the jurisdiction-AGNOSTIC half of statutory invoice
-- clearance. Egypt (ETA) and Saudi Arabia (ZATCA/Fatoora) both mandate it, the
-- UAE follows, and the three agree on almost nothing mechanically -- ETA takes
-- signed JSON over REST, ZATCA takes UBL 2.1 XML with a cryptographic stamp and
-- a TLV QR code, and clearance-vs-reporting differs by transaction type.
--
-- THE ARCHITECTURAL DECISION THIS FILE EXISTS TO FIX. Nothing here knows any of
-- that. This layer owns the submission LEDGER -- lifecycle, idempotency, audit,
-- credentials -- and the per-country payload, signing and transport live behind
-- a TypeScript adapter interface (lib/einvoice/types.ts). Adding Saudi Arabia
-- must be writing one adapter file, not touching the schema. Building "ETA
-- integration" first and retrofitting ZATCA into it is the expensive mistake
-- this shape is chosen to avoid.
--
-- Deliberately mirrors payment_provider_settings and the payments adapter
-- pattern, which already solved the same problem shape (per-tenant credentials
-- for an external authority, sandbox before production, normalized status while
-- preserving the raw one). Consistency with a pattern this codebase already
-- proved beats a novel one.

-- Per-organization enrolment with a tax authority. Same DRAFT-until-verified
-- discipline as payment providers: credentials are proven against the sandbox
-- before anything can be filed for real, because a rejected statutory filing is
-- not a retryable inconvenience.
create table public.einvoice_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  jurisdiction text not null check (jurisdiction in ('EG_ETA', 'SA_ZATCA', 'AE_PEPPOL')),
  environment text not null default 'SANDBOX' check (environment in ('SANDBOX', 'PRODUCTION')),

  -- Identifiers the authority issues or requires. Public by nature -- they
  -- appear on the invoice itself -- so they live in columns.
  taxpayer_id text,
  branch_code text,
  activity_code text,

  -- Secrets never do. Vault secret ids, exactly as payment_provider_settings
  -- holds api_key_secret_id / hmac_secret_id rather than the keys themselves.
  client_id_secret_id uuid,
  client_secret_secret_id uuid,
  signing_certificate_secret_id uuid,
  signing_key_secret_id uuid,

  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'SUSPENDED')),
  enabled boolean not null default false,
  verified_at timestamptz,
  last_verification_error text,
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One live enrolment per organization per jurisdiction per environment. An
  -- org may legitimately hold both an Egyptian and a Saudi profile at once.
  unique (organization_id, jurisdiction, environment)
);

create index idx_einvoice_profiles_org on public.einvoice_profiles (organization_id, jurisdiction);

create trigger trg_einvoice_profiles_updated_at
  before update on public.einvoice_profiles
  for each row execute function public.set_updated_at();

-- One row per business document that must reach a tax authority.
create table public.einvoice_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.einvoice_profiles (id),

  -- What is being filed. Kept as a loose (type, id) pair rather than a foreign
  -- key per source, so a new filable document type does not require a schema
  -- change here.
  source_type text not null
    check (source_type in ('SUPPLIER_INVOICE', 'PAYMENT_RECEIPT', 'DUE', 'CREDIT_NOTE', 'DEBIT_NOTE')),
  source_id uuid not null,
  document_type text not null default 'INVOICE'
    check (document_type in ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'RECEIPT')),

  -- NORMALIZED lifecycle, shared by every jurisdiction.
  --   DRAFT      built locally, not yet signed
  --   SIGNED     stamped/signed, not yet sent
  --   SUBMITTED  in the authority's hands, outcome unknown
  --   ACCEPTED   cleared
  --   REJECTED   the authority refused it -- a decision, not a glitch
  --   CANCELLED  withdrawn at the authority after acceptance
  --   FAILED     transport or local failure
  -- REJECTED and FAILED are deliberately separate. FAILED is safe to retry
  -- unchanged; REJECTED means the document itself is wrong and retrying it
  -- unchanged will fail forever. Collapsing them into one "error" state is how
  -- systems end up in infinite resubmission loops against a tax authority.
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SIGNED', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'FAILED')),

  -- The authority's own status string, verbatim and unmapped. Same reasoning as
  -- NormalizedWebhookPayload.providerStatus in the payments adapters: several
  -- distinct authority states can bucket into one normalized status, and
  -- without this the distinction is lost the moment a response is parsed.
  authority_status text,

  -- Identifiers the authority returns.
  authority_uuid text,
  authority_long_id text,
  -- ZATCA requires a TLV QR on the printed invoice; ETA prints its own code.
  -- Stored because the printed document must reproduce exactly what was filed.
  qr_payload text,

  -- Stable across every retry of this document. The adapter passes it to the
  -- authority where the API supports it, and the unique constraint below stops
  -- a duplicate row regardless. A double-filed invoice is a tax problem, not a
  -- duplicate-charge inconvenience.
  idempotency_key text not null,

  attempt_count int not null default 0,
  last_error_code text,
  last_error_detail text,
  submitted_at timestamptz,
  settled_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, idempotency_key),
  -- A given source document is filed once per profile. Re-filing after a
  -- rejection reuses this row rather than creating a rival one.
  unique (profile_id, source_type, source_id),
  constraint einvoice_documents_settled_has_time check (
    status not in ('ACCEPTED', 'REJECTED', 'CANCELLED') or settled_at is not null
  )
);

create index idx_einvoice_documents_org_status
  on public.einvoice_documents (organization_id, status);
-- Drives the poller: everything still awaiting an authority verdict.
create index idx_einvoice_documents_pending
  on public.einvoice_documents (profile_id, submitted_at)
  where status = 'SUBMITTED';

create trigger trg_einvoice_documents_updated_at
  before update on public.einvoice_documents
  for each row execute function public.set_updated_at();

-- Append-only record of every exchange with the authority. This is the evidence
-- trail during a tax audit, so it is never updated or deleted, only added to.
create table public.einvoice_submission_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid not null references public.einvoice_documents (id) on delete cascade,
  attempt_number int not null,
  operation text not null check (operation in ('SUBMIT', 'POLL', 'CANCEL')),
  http_status int,
  authority_status text,
  resulting_status text,
  -- REDACTED summaries only. Adapters must strip credentials, signing material
  -- and personal data before anything lands here -- the same explicit-redaction
  -- rule the payment adapters carry, and the reason the Fawry error echo was
  -- fixed in 7a0daf4. Raw authority payloads must never be stored verbatim.
  request_summary jsonb,
  response_summary jsonb,
  occurred_at timestamptz not null default now()
);

create index idx_einvoice_attempts_document
  on public.einvoice_submission_attempts (document_id, occurred_at);

alter table public.einvoice_profiles enable row level security;
alter table public.einvoice_documents enable row level security;
alter table public.einvoice_submission_attempts enable row level security;

insert into public.permissions (key, description) values
  ('finance.einvoice.read', 'الاطلاع على حالة الفواتير الإلكترونية وسجل إرسالها'),
  ('finance.einvoice.manage', 'ضبط التسجيل لدى مصلحة الضرائب وإرسال الفواتير الإلكترونية')
on conflict do nothing;

-- Profiles are read-only to clients even for managers: they are written through
-- an RPC that forces re-verification whenever credentials change, mirroring the
-- payment-provider rule fixed in 14a85a1 where changing a merchant identifier
-- must drop the row back to DRAFT.
create policy "einvoice_profiles_select"
  on public.einvoice_profiles for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.einvoice.manage')
  );

create policy "einvoice_documents_select"
  on public.einvoice_documents for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.einvoice.manage')
  );

create policy "einvoice_attempts_select"
  on public.einvoice_submission_attempts for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.einvoice.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.einvoice.manage')
  );

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'finance.einvoice.read'),
  ('TENANT_OWNER', 'finance.einvoice.manage'),
  ('FINANCE_MANAGER', 'finance.einvoice.read'),
  ('FINANCE_MANAGER', 'finance.einvoice.manage'),
  ('ACCOUNTANT', 'finance.einvoice.read'),
  ('ACCOUNTANT', 'finance.einvoice.manage'),
  ('AUDITOR', 'finance.einvoice.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key in ('finance.einvoice.read', 'finance.einvoice.manage')
on conflict do nothing;

-- A profile may only leave DRAFT once its credentials have actually been proven
-- against the authority's sandbox, and any change to identifying credentials
-- drops it back. Same guarantee as record_payment_provider_verification.
create or replace function public.set_einvoice_profile_verification(
  p_profile_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
        -- Truncated, and never the raw authority body: the same sanitisation
        -- rule applied to provider errors in 7a0daf4.
        last_verification_error = left(coalesce(p_error, 'verification failed'), 500),
        enabled = false, updated_by = auth.uid()
    where id = p_profile_id;
  end if;
end;
$$;

-- Claim (or re-claim) a document for filing. Returns the row to work on, so a
-- retry after a crash resumes the existing document rather than opening a rival
-- one -- the idempotency guarantee the unique constraints back up.
create or replace function public.claim_einvoice_document(
  p_profile_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_document_type text default 'INVOICE'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
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

  -- The production guard: an unverified enrolment cannot file. Deliberately
  -- checked here rather than trusted to the caller.
  if v_profile.status <> 'ACTIVE' or not v_profile.enabled then
    raise exception
      'EINVOICE_PROFILE_NOT_ACTIVE: لم يُفعَّل التسجيل لدى مصلحة الضرائب بعد؛ تحقّق من بيانات الاعتماد أولًا'
      using errcode = 'P0001';
  end if;

  select id, status into v_id, v_status
  from public.einvoice_documents
  where profile_id = p_profile_id and source_type = p_source_type and source_id = p_source_id;

  if v_id is not null then
    -- Already cleared: refuse rather than quietly file a second time.
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

-- Record the outcome of one exchange: advances the document and appends to the
-- audit trail in a single transaction, so a document can never show a status
-- that no attempt explains.
create or replace function public.record_einvoice_attempt(
  p_document_id uuid,
  p_operation text,
  p_resulting_status text,
  p_http_status int default null,
  p_authority_status text default null,
  p_authority_uuid text default null,
  p_authority_long_id text default null,
  p_qr_payload text default null,
  p_error_code text default null,
  p_error_detail text default null,
  p_request_summary jsonb default null,
  p_response_summary jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
