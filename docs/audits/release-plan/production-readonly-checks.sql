-- PRODUCTION READ-ONLY CHECKS -- FOR REVIEW. NOT RUN. Nothing in this file has been executed against production.
-- (It was only parse-checked against the isolated local stack; the numbers it printed there mean nothing for production.)
--
-- How it must be run (by a person who holds the production credentials; credentials are NEVER written into this file):
--   PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=30000" \
--     psql "$PROD_READONLY_URL" -X -v ON_ERROR_STOP=1 -f docs/audits/release-plan/production-readonly-checks.sql | tee prod-readonly-YYYYMMDD.txt
-- Rules: a read-only role if one exists; otherwise the settings above make every statement fail on a write. No statement below writes, locks
-- explicitly, or creates anything. Run off-peak (the counts scan tables). If a count times out, use its reltuples line (section 3) instead and say so.

\echo '== 0. session safety (must show read_only = on)'
select current_user, current_setting('default_transaction_read_only') as read_only, current_setting('statement_timeout') as stmt_timeout,
       current_setting('server_version') as server_version, now() as at;

\echo '== 1. migration ledger: which of the 54 authorized migrations from 20261009 on are already applied'
select count(*) as ledger_total, max(version) as latest from supabase_migrations.schema_migrations;
select version from supabase_migrations.schema_migrations where version >= '20261009000000' order by version;

\echo '== 2. organizations'
select status, count(*) as organizations, count(*) filter (where is_demo) as demo from public.organizations group by 1 order by 2 desc;

\echo '== 3. volumes that decide lock and scan time (estimate first, exact second)'
select relname, reltuples::bigint as est_rows, pg_size_pretty(pg_total_relation_size(oid)) as total_size
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
  and relname in ('organizations','dues','payments','payment_allocations','journal_entries','journal_entry_lines','chart_of_accounts','fiscal_years',
                  'fiscal_periods','units','members','unit_ownerships','financial_audit_logs','platform_audit_logs','notifications','access_events',
                  'bank_statement_lines','cashboxes','bank_accounts','organization_finance_settings')
order by reltuples desc;
select 'dues' t, count(*) from public.dues union all select 'payments', count(*) from public.payments
union all select 'payment_allocations', count(*) from public.payment_allocations union all select 'journal_entries', count(*) from public.journal_entries
union all select 'journal_entry_lines', count(*) from public.journal_entry_lines union all select 'units', count(*) from public.units
union all select 'members', count(*) from public.members union all select 'notifications', count(*) from public.notifications
union all select 'access_events', count(*) from public.access_events union all select 'financial_audit_logs', count(*) from public.financial_audit_logs;

\echo '== 3b. the largest organizations (the views and RLS gains do not transfer to one big tenant)'
select organization_id, count(*) as dues from public.dues group by 1 order by 2 desc limit 10;
select organization_id, count(*) as units from public.units group by 1 order by 2 desc limit 10;

\echo '== 4. PRE-FLIGHT: statements that can FAIL the migration if existing rows or objects do not fit'
\echo '-- 4a. 20261009130000 re-adds check_audit_action with 12 values: any other action value makes it fail (and the whole migration roll back)'
select action, count(*) from public.financial_audit_logs
where action <> all (array['PAYMENT_CREATED','PAYMENT_IDEMPOTENT_REPLAY','PAYMENT_ALLOCATION_CREATED','PAYMENT_REVERSED','DUE_ISSUED','DUE_BATCH_ISSUED',
  'RECURRING_DUES_GENERATED','RECURRING_DUES_SKIPPED','OPERATION_REJECTED','LEASE_RENT_DUE_GENERATED','LEASE_RENT_DUE_SKIPPED','OPENING_BALANCE_RECORDED'])
group by 1 order by 2 desc;
\echo '   expected: zero rows'
\echo '-- 4b. 20261015100000/100100 rebuild the notification constraints from the LIVE definition (+ amenity values); if a constraint is missing they use a base list'
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.notifications'::regclass and conname in ('notifications_source_type_check','notifications_type_check');
select 'source_type' as col, source_type as value, count(*) from public.notifications group by 2 order by 3 desc;
select 'type' as col, type as value, count(*) from public.notifications group by 2 order by 3 desc;
\echo '   expected: both constraints present; if either is missing, every distinct value above must be in the migration base list'
\echo '-- 4c. 20261016100000 RAISES if access_events_reason_code_check is missing'
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.access_events'::regclass and conname = 'access_events_reason_code_check';
\echo '   expected: one row'
\echo '-- 4d. 20261014100000 drops bank_statement_lines.resolution* (only if an earlier draft of 2c was applied) after writing one audit row per explained line'
select count(*) filter (where to_jsonb(bl)->>'resolution' is not null) as explained_lines, count(*) as lines from public.bank_statement_lines bl;
select count(*) as has_resolution_columns from information_schema.columns
where table_schema = 'public' and table_name = 'bank_statement_lines' and column_name in ('resolution','resolution_reason','resolved_by','resolved_at');
\echo '-- 4e. 20261017100000 (3a): backfills EVERY payment_allocations row; ADD CONSTRAINT / SET NOT NULL scan payments and payment_allocations under ACCESS EXCLUSIVE'
select count(*) as allocations, count(*) filter (where reversed_at is not null) as reversed_allocations from public.payment_allocations;
select count(*) as payments, count(*) filter (where status = 'POSTED') as posted, count(*) filter (where unallocated_amount > 0) as with_unallocated from public.payments;
select count(*) as already_has_3a_columns from information_schema.columns
where table_schema = 'public' and table_name in ('payments','payment_allocations') and column_name in ('advance_amount','kind','applied_on');
\echo '   expected for a database before 3a: 0 columns'

\echo '== 5. objects the migrations replace: current state (compare md5 with the text of the previous definition in git; a difference = hand edit on production)'
select p.proname, pg_get_function_identity_arguments(p.oid) as args, md5(p.prosrc) as src_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
 'apply_payment_credit','assert_open_fiscal_period_for_date','assert_posting_period','auto_match_bank_statement','finalize_bank_reconciliation','get_account_ledger',
 'get_audit_actor_names','get_bank_match_candidates','get_bank_reconciliation_summary','get_cash_flow_statement','get_cash_position','get_trial_balance',
 'get_trial_balance_with_opening','has_any_permission','has_permission','has_financial_permission','is_org_member','is_org_participant','issue_dues','list_projects',
 'post_fx_difference','post_payment_internal','post_supplier_invoice_in_currency','process_visitor_gate_scan_core','project_wip_summary','record_member_opening_balance',
 'record_payment','replace_role_permissions_atomic','void_payment','recompute_due_payment_status','due_effective_paid')
order by 1, 2;
select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename in ('chart_of_accounts','fiscal_periods','fiscal_years','journal_entries','journal_entry_lines','dues',
  'financial_audit_logs','organizations','tenant_branding','organization_memberships','platform_audit_logs','cost_centers','budgets','banks','bank_accounts','cashboxes',
  'cash_transactions','cheques','due_types','expense_categories','projects')
order by tablename, policyname;
select c.relname, c.relrowsecurity as rls_on from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('units_with_financials','members_with_financials');
select viewname, md5(definition) from pg_views where schemaname = 'public' and viewname in ('units_with_financials','members_with_financials');

\echo '== 6. DEPOSIT-ACCOUNT RULE (20261018100000): which organizations would start refusing receipts, and what 1130 has received'
\echo '-- 6a. organizations with at least one active cash box or bank account'
select count(distinct organization_id) as orgs_with_linked_account from (
  select organization_id from public.cashboxes where is_active union select organization_id from public.bank_accounts where is_active) x;
\echo '-- 6b. receipts of the last 180 days by deposit account and whether that account is linked to an ACTIVE cash box / bank account of the same organization'
with linked as (
  select organization_id, gl_account_id from public.cashboxes where is_active
  union select organization_id, gl_account_id from public.bank_accounts where is_active)
select a.code, a.category, a.is_group, (l.gl_account_id is not null) as linked, count(*) as receipts, count(distinct p.organization_id) as orgs, sum(p.amount) as amount
from public.payments p
join public.chart_of_accounts a on a.id = p.deposit_account_id
left join linked l on l.organization_id = p.organization_id and l.gl_account_id = p.deposit_account_id
where p.created_at >= now() - interval '180 days'
group by 1, 2, 3, 4 order by receipts desc limit 40;
\echo '-- 6c. organizations that received receipts in the last 90 days on an UNLINKED account: these need a cash box / bank account BEFORE the rule is deployed'
with linked as (
  select organization_id, gl_account_id from public.cashboxes where is_active
  union select organization_id, gl_account_id from public.bank_accounts where is_active)
select p.organization_id, a.code, count(*) as receipts, max(p.created_at)::date as last_receipt
from public.payments p
join public.chart_of_accounts a on a.id = p.deposit_account_id
left join linked l on l.organization_id = p.organization_id and l.gl_account_id = p.deposit_account_id
where p.created_at >= now() - interval '90 days' and l.gl_account_id is null
group by 1, 2 order by receipts desc limit 100;
\echo '-- 6d. every receipt ever deposited to a code-1130 account (the receivables control account in the standard chart)'
select a.organization_id, a.code, a.name_en, count(*) as receipts, sum(p.amount) as amount, min(p.created_at)::date as first_receipt, max(p.created_at)::date as last_receipt
from public.payments p join public.chart_of_accounts a on a.id = p.deposit_account_id
where a.code = '1130' group by 1, 2, 3 order by receipts desc limit 100;
\echo '-- 6e. EVERY cash box / bank account link judged by the SAME conditions the deposit rule uses (migration 20261018100000: treasury_gl_account_is_valid + the link must be active)'
\echo '--     reasons: LINK_INACTIVE | ACCOUNT_MISSING | ACCOUNT_OF_ANOTHER_ORGANIZATION | ACCOUNT_NOT_ASSET | ACCOUNT_IS_GROUP | ACCOUNT_INACTIVE | ACCOUNT_NOT_CASH_EQUIVALENT'
\echo '-- 6e-1. one row per link that fails at least one condition (a link can fail several; all reasons are listed)'
with links as (
  select 'cashbox'::text as kind, c.id as link_id, c.name as link_name, c.organization_id, c.gl_account_id, c.is_active as link_active from public.cashboxes c
  union all
  select 'bank'::text, b.id, b.account_name, b.organization_id, b.gl_account_id, b.is_active from public.bank_accounts b
), judged as (
  select l.*, a.code, a.category, a.is_group, a.is_active as account_active, a.is_cash_equivalent,
         array_remove(array[
           case when not l.link_active then 'LINK_INACTIVE' end,
           case when a.id is null then 'ACCOUNT_MISSING' end,
           case when a.id is not null and a.organization_id <> l.organization_id then 'ACCOUNT_OF_ANOTHER_ORGANIZATION' end,
           case when a.id is not null and a.category <> 'ASSET' then 'ACCOUNT_NOT_ASSET' end,
           case when a.id is not null and a.is_group then 'ACCOUNT_IS_GROUP' end,
           case when a.id is not null and not a.is_active then 'ACCOUNT_INACTIVE' end,
           case when a.id is not null and not a.is_cash_equivalent then 'ACCOUNT_NOT_CASH_EQUIVALENT' end
         ], null) as reasons
  from links l left join public.chart_of_accounts a on a.id = l.gl_account_id
)
select kind, organization_id, link_id, link_name, gl_account_id, code, category, is_group, account_active, is_cash_equivalent, link_active,
       array_to_string(reasons, ',') as reasons
from judged where cardinality(reasons) > 0
order by organization_id, kind, code nulls first, link_name limit 500;
\echo '-- 6e-2. the same, counted per reason (links and organizations affected)'
with links as (
  select 'cashbox'::text as kind, c.id as link_id, c.organization_id, c.gl_account_id, c.is_active as link_active from public.cashboxes c
  union all
  select 'bank'::text, b.id, b.organization_id, b.gl_account_id, b.is_active from public.bank_accounts b
), judged as (
  select l.*,
         array_remove(array[
           case when not l.link_active then 'LINK_INACTIVE' end,
           case when a.id is null then 'ACCOUNT_MISSING' end,
           case when a.id is not null and a.organization_id <> l.organization_id then 'ACCOUNT_OF_ANOTHER_ORGANIZATION' end,
           case when a.id is not null and a.category <> 'ASSET' then 'ACCOUNT_NOT_ASSET' end,
           case when a.id is not null and a.is_group then 'ACCOUNT_IS_GROUP' end,
           case when a.id is not null and not a.is_active then 'ACCOUNT_INACTIVE' end,
           case when a.id is not null and not a.is_cash_equivalent then 'ACCOUNT_NOT_CASH_EQUIVALENT' end
         ], null) as reasons
  from links l left join public.chart_of_accounts a on a.id = l.gl_account_id
)
select reason, kind, count(*) as links, count(distinct organization_id) as organizations
from judged, unnest(reasons) as reason
group by reason, kind order by reason, kind;
\echo '-- 6e-3. organizations that HAVE links but not one valid deposit account (every link is inactive or points at an invalid / missing / foreign account): their receipts would all be refused'
with links as (
  select c.id as link_id, c.organization_id, c.gl_account_id, c.is_active as link_active from public.cashboxes c
  union all
  select b.id, b.organization_id, b.gl_account_id, b.is_active from public.bank_accounts b
), valid_accounts as (
  select distinct l.organization_id, l.gl_account_id
  from links l join public.chart_of_accounts a on a.id = l.gl_account_id and a.organization_id = l.organization_id
  where l.link_active and a.is_active and not a.is_group and a.category = 'ASSET' and a.is_cash_equivalent
)
select l.organization_id, count(distinct l.link_id) as links, count(*) filter (where l.link_active) as active_links
from links l
where not exists (select 1 from valid_accounts v where v.organization_id = l.organization_id)
group by l.organization_id order by l.organization_id limit 500;

\echo '== 7. CUSTOMER ADVANCES scope: which organizations already have a usable account 2250 (the template adds it for NEW organizations only)'
select count(*) filter (where has_2250) as orgs_with_2250, count(*) filter (where not has_2250) as orgs_without_2250 from (
  select o.id, exists (select 1 from public.chart_of_accounts a where a.organization_id = o.id and a.code = '2250') as has_2250 from public.organizations o) x;
select code, name_en, category, count(*) from public.chart_of_accounts where code = '2250' group by 1, 2, 3;
\echo '-- ownership changes in the last 12 months on units that have an unallocated remainder (legacy credit): the population G-ADV-1 would hit first'
select count(*) as transferred_units_with_unallocated from (
  select distinct uo.unit_id from public.unit_ownerships uo
  join public.payments p on p.unit_id = uo.unit_id and p.status = 'POSTED' and p.unallocated_amount > 0
  where uo.end_date >= current_date - interval '12 months') x;

\echo '== 8. permissions the release relies on'
select key from public.permissions where key in ('finance.payments.void','receivables.payments.create','finance.accounts.manage','finance.payments.read','tenant.settings.manage') order by 1;
select count(*) as roles_total from public.roles;

\echo '== 9. load and locks right now (run immediately before the window as well)'
select state, count(*) from pg_stat_activity where datname = current_database() group by 1 order by 2 desc;
select pid, usename, state, now() - xact_start as xact_age, left(query, 80) as query
from pg_stat_activity where datname = current_database() and xact_start is not null and now() - xact_start > interval '30 seconds' order by xact_start limit 20;
select count(*) as ungranted_locks from pg_locks where not granted;
select rolname, rolconfig from pg_roles where rolname in ('authenticated','anon','service_role','authenticator','postgres') order by 1;
select current_setting('max_connections') as max_connections, pg_size_pretty(pg_database_size(current_database())) as database_size;

\echo '== 10. recoverability evidence that can be read from SQL (the backup itself is checked on the platform, not here)'
select archived_count, last_archived_time, failed_count, last_failed_time from pg_stat_archiver;
select name, setting from pg_settings where name in ('wal_level','archive_mode','archive_command') order by 1;

\echo '== 11. TRIAL SCOPE SWITCHES: the public demo and gate hardware must be OFF for the trial organizations'
\echo '-- 11a. demo organizations (is_demo). The public door itself is the DEMO_ORGANIZATION_ID secret of the app, which SQL cannot see: check the secret NAMES on the platform (read-only), never print values'
select id, name, status, is_demo from public.organizations where is_demo order by created_at;
\echo '-- 11b. gate hardware: per-organization switch (default false) and active endpoints (default inactive); the only adapter that exists is NOOP'
select s.organization_id, s.enabled from public.gate_hardware_settings s where s.enabled;
select e.organization_id, e.gate_id, e.adapter, e.is_active from public.gate_hardware_endpoints e where e.is_active;
\echo '-- 11c. hardware command queue by status (the cron at */5 min drains it; expected: nothing PENDING/FAILED/DISPATCHING for trial organizations)'
select organization_id, status, count(*) from public.gate_hardware_commands group by 1, 2 order by 1, 2;
\echo '   expected for the trial: zero rows in 11a for trial organizations, zero in 11b, nothing pending in 11c'
