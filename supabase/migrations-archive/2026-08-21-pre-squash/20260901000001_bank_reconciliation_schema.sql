-- Bank reconciliation, part 1 of 2: schema.
--
-- Closes the last phase-1 gap in the finance module. Until now the system
-- could record what the BOOKS say about a bank account (journal lines on the
-- account's gl_account_id) but had no way to confront that against what the
-- BANK says, which is the control that catches unrecorded fees, duplicated
-- postings, and cheques that never cleared.
--
-- SIGN CONVENTION -- the single most important decision here. A statement
-- line's `amount` is signed from the ACCOUNT HOLDER's point of view:
--   positive = money into the account, negative = money out.
-- A bank account's GL account is a DEBIT-normal asset, so its signed movement
-- is (debit - credit) -- money in is a debit. The two therefore use the same
-- scale and matching is a direct equality test, with no per-side flipping to
-- get wrong. Importers must normalize to this convention.

create table public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  -- Balances as printed by the bank, not as computed by us.
  opening_balance numeric(19, 4) not null,
  closing_balance numeric(19, 4) not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'RECONCILED')),
  reconciled_at timestamptz,
  reconciled_by uuid references auth.users (id),
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_statements_period_order check (period_end >= period_start),
  -- One statement per account per period end; re-importing the same month
  -- should correct the existing statement, not silently create a second one
  -- that double-counts every line.
  unique (bank_account_id, period_end)
);

create index idx_bank_statements_org on public.bank_statements (organization_id, status);

create trigger trg_bank_statements_updated_at
  before update on public.bank_statements
  for each row execute function public.set_updated_at();

create table public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  statement_id uuid not null references public.bank_statements (id) on delete cascade,
  line_date date not null,
  description text,
  reference text,
  amount numeric(19, 4) not null check (amount <> 0),
  matched_journal_entry_line_id uuid references public.journal_entry_lines (id) on delete set null,
  match_type text check (match_type in ('AUTO', 'MANUAL')),
  matched_at timestamptz,
  matched_by uuid references auth.users (id),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  -- A given GL line can back at most one statement line. Postgres allows
  -- unlimited NULLs under a unique constraint, so unmatched lines are
  -- unaffected while double-matching is impossible.
  unique (matched_journal_entry_line_id),
  -- match_type and matched_at only mean something alongside an actual match.
  constraint bank_statement_lines_match_coherent check (
    (matched_journal_entry_line_id is null and match_type is null and matched_at is null)
    or (matched_journal_entry_line_id is not null and match_type is not null and matched_at is not null)
  )
);

create index idx_bank_statement_lines_statement
  on public.bank_statement_lines (statement_id, line_date);
create index idx_bank_statement_lines_unmatched
  on public.bank_statement_lines (statement_id)
  where matched_journal_entry_line_id is null;

alter table public.bank_statements enable row level security;
alter table public.bank_statement_lines enable row level security;

insert into public.permissions (key, description) values
  ('finance.bank_reconciliation.read', 'الاطلاع على كشوف الحسابات البنكية والمطابقات'),
  ('finance.bank_reconciliation.manage', 'استيراد كشوف الحسابات البنكية وتنفيذ المطابقة واعتمادها')
on conflict do nothing;

-- Reading a statement is gated on its own read permission rather than plain
-- org membership: statement lines expose the organization's full banking
-- activity, which is narrower-audience data than, say, the dues list.
create policy "bank_statements_select"
  on public.bank_statements for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.bank_reconciliation.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.bank_reconciliation.manage')
  );

create policy "bank_statements_manage"
  on public.bank_statements for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.bank_reconciliation.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.bank_reconciliation.manage')
    and public.organization_is_active(organization_id)
  );

create policy "bank_statement_lines_select"
  on public.bank_statement_lines for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.bank_reconciliation.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.bank_reconciliation.manage')
  );

-- A RECONCILED statement is a signed-off control document. Blocking writes to
-- its lines here means "reopen it first" is enforced by the database, not just
-- by whichever UI happens to be in front of it.
create policy "bank_statement_lines_manage"
  on public.bank_statement_lines for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.bank_reconciliation.manage')
    and public.organization_is_active(organization_id)
    and exists (
      select 1 from public.bank_statements s
      where s.id = statement_id and s.status = 'DRAFT'
    )
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.bank_reconciliation.manage')
    and public.organization_is_active(organization_id)
    and exists (
      select 1 from public.bank_statements s
      where s.id = statement_id and s.status = 'DRAFT'
    )
  );

-- Same two-part backfill every other permission in this schema uses: attach
-- to role templates for orgs created from now on, then grant to the
-- already-cloned per-organization roles.
insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'finance.bank_reconciliation.read'),
  ('TENANT_OWNER', 'finance.bank_reconciliation.manage'),
  ('FINANCE_MANAGER', 'finance.bank_reconciliation.read'),
  ('FINANCE_MANAGER', 'finance.bank_reconciliation.manage'),
  -- The accountant is who actually performs a reconciliation, so they get
  -- manage; the auditor reviews the result and stays read-only by design.
  ('ACCOUNTANT', 'finance.bank_reconciliation.read'),
  ('ACCOUNTANT', 'finance.bank_reconciliation.manage'),
  ('AUDITOR', 'finance.bank_reconciliation.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key in ('finance.bank_reconciliation.read', 'finance.bank_reconciliation.manage')
on conflict do nothing;
