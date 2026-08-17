-- Cash Flow Statement, part 1 of 2: teach the chart of accounts which
-- accounts ARE cash, and which activity section every other account's cash
-- effect belongs to.
--
-- The statement is produced by the DIRECT method (see part 2): we read the
-- actual cash movements out of the posted journal rather than reverse-
-- engineering them from a comparative balance sheet. That only works if two
-- things are declared on the account itself, because neither is derivable
-- from `category` alone:
--
--   is_cash_equivalent -- WHICH accounts count as cash. Code 1110/1120 in the
--     standard template, but tenants customize their COA freely (spec §11),
--     so this cannot be a code-prefix heuristic.
--   cash_flow_section  -- OPERATING / INVESTING / FINANCING. Undecidable from
--     `category`: Accounts Payable and a bank loan are both LIABILITY but sit
--     in different sections, as do Accounts Receivable (operating) and a
--     building purchase (investing).
--
-- cash_flow_section stays nullable on purpose. An unclassified account still
-- appears on the statement -- falling back to OPERATING, the safe default for
-- working-capital accounts -- but part 2 returns an is_classified flag so the
-- report can mark those rows as needing an accountant's decision instead of
-- silently presenting a guess as fact.

alter table public.chart_of_accounts
  add column if not exists is_cash_equivalent boolean not null default false,
  add column if not exists cash_flow_section text
    check (cash_flow_section in ('OPERATING', 'INVESTING', 'FINANCING'));

comment on column public.chart_of_accounts.is_cash_equivalent is
  'Account is cash or a cash equivalent (till, bank, short-term deposit). Defines the "cash" whose movement the cash flow statement explains.';
comment on column public.chart_of_accounts.cash_flow_section is
  'Cash flow activity section this account''s cash effect belongs to. NULL = not yet classified; the statement falls back to OPERATING and flags the row.';

-- Partial index: the statement filters on is_cash_equivalent for the opening
-- and closing cash position, and true rows are a handful per org.
create index if not exists chart_of_accounts_cash_equivalent_idx
  on public.chart_of_accounts (organization_id)
  where is_cash_equivalent;

-- Carry both flags on the starter template so a newly seeded org gets a
-- correct statement without any manual classification.
alter table public.coa_template_accounts
  add column if not exists is_cash_equivalent boolean not null default false,
  add column if not exists cash_flow_section text
    check (cash_flow_section in ('OPERATING', 'INVESTING', 'FINANCING'));

update public.coa_template_accounts set is_cash_equivalent = true
  where template_key = 'RESORT_STANDARD' and code in ('1110', '1120');

update public.coa_template_accounts set cash_flow_section = 'OPERATING'
  where template_key = 'RESORT_STANDARD' and code in (
    '1130',  -- Accounts Receivable - Members
    '2100',  -- Accounts Payable - Suppliers
    '2200',  -- Unearned Revenue
    '4100', '4200', '4300',
    '5100', '5200', '5300', '5400'
  );

update public.coa_template_accounts set cash_flow_section = 'INVESTING'
  where template_key = 'RESORT_STANDARD' and code in (
    '1210',  -- Buildings & Facilities
    '1220'   -- Accumulated Depreciation
  );

update public.coa_template_accounts set cash_flow_section = 'FINANCING'
  where template_key = 'RESORT_STANDARD' and code = '3100';  -- Retained Earnings

-- Propagate the template's classification when cloning.
create or replace function public.clone_chart_of_accounts_template(
  p_organization_id uuid,
  p_template_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_new_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  create temporary table if not exists _coa_clone_map (code text primary key, id uuid) on commit drop;
  delete from _coa_clone_map;

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

-- Backfill orgs that already cloned the template before this migration. Keyed
-- on the template's own codes, so a tenant's hand-made accounts stay NULL and
-- get surfaced as unclassified rather than being guessed at here.
update public.chart_of_accounts a
set is_cash_equivalent = t.is_cash_equivalent,
    cash_flow_section = t.cash_flow_section
from public.coa_template_accounts t
where t.template_key = 'RESORT_STANDARD'
  and a.code = t.code
  and a.cash_flow_section is null
  and not a.is_cash_equivalent
  and (t.is_cash_equivalent or t.cash_flow_section is not null);
