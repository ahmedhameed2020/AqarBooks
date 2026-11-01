-- ALL-ORGANIZATIONS IMPACT QUERIES -- PROPOSED, FOR REVIEW. NOT RUN ON PRODUCTION. (Supplement to production-readonly-checks.sql; it is NOT inside the frozen bundle.)
-- The 27 migrations are applied to the WHOLE production database. They do not read a "trial organization" list: every organization is affected the moment they
-- are applied, whatever the trial scope is. These queries measure, per organization, who would feel it. Same run rules as production-readonly-checks.sql:
--   PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=2000" psql "$PROD_READONLY_URL" -X -v ON_ERROR_STOP=1 -f ALL-ORGS-IMPACT-QUERIES.sql
-- Parse-checked on the isolated local stack only (numbers there mean nothing for production).

\echo '== I1 organizations by status (the population the migrations touch)'
select status, count(*) as organizations, count(*) filter (where is_demo) as demo from public.organizations group by 1 order by 2 desc;

\echo '== I2 (1, 1.1) financial audit log: after the migration only holders of finance.audit.read (and platform admins) read it. Organizations with active members and NO holder:'
with members as (select organization_id, count(*) as active_members from public.organization_memberships where status = 'active' group by 1),
holders as (
  select ura.organization_id, count(distinct ura.user_id) as holders
  from public.user_role_assignments ura
  join public.organization_memberships om on om.user_id = ura.user_id and om.organization_id = ura.organization_id and om.status = 'active'
  join public.role_permissions rp on rp.role_id = ura.role_id
  join public.permissions p on p.id = rp.permission_id and p.key = 'finance.audit.read'
  group by 1)
select m.organization_id, m.active_members, coalesce(h.holders, 0) as audit_readers
from members m left join holders h using (organization_id)
where coalesce(h.holders, 0) = 0 order by m.active_members desc limit 500;

\echo '== I3 (1.2) 16 finance tables: after the migration an active member reads them only through one of 42 finance/property permission keys. Active members holding NONE of them, per organization (information to review, not an automatic block):'
with keys(k) as (values
 ('banking.accounts.view'),('banking.cheques.manage'),('banking.reconciliations.manage'),('cashier.reconciliations.approve'),('cashier.sessions.close'),('cashier.sessions.open'),
 ('cashier.transactions.create'),('cashier.transactions.read'),('finance.accounts.manage'),('finance.accounts.view'),('finance.assets.manage'),('finance.assets.read'),
 ('finance.audit.read'),('finance.bank_reconciliation.manage'),('finance.bank_reconciliation.read'),('finance.budgets.manage'),('finance.commissions.manage'),
 ('finance.commissions.read'),('finance.dues.issue'),('finance.dues.read'),('finance.einvoice.manage'),('finance.einvoice.read'),('finance.entries.create'),
 ('finance.entries.review'),('finance.expenses.read'),('finance.payments.create'),('finance.payments.read'),('finance.periods.manage'),('finance.reports.read'),
 ('finance.service_charges.manage'),('finance.service_charges.read'),('finance.suppliers.read'),('operations.maintenance.costs.manage'),('operations.maintenance.costs.post'),
 ('operations.maintenance.owner_charge'),('property.installments.manage'),('property.leases.manage'),('property.members.view'),('property.reports.read'),
 ('property.units.view'),('receivables.dues.create'),('receivables.payments.create')),
active as (select organization_id, user_id from public.organization_memberships where status = 'active'),
with_key as (
  select distinct ura.organization_id, ura.user_id
  from public.user_role_assignments ura
  join public.role_permissions rp on rp.role_id = ura.role_id
  join public.permissions p on p.id = rp.permission_id
  where p.key in (select k from keys))
select a.organization_id, count(*) as active_members, count(*) filter (where w.user_id is null) as members_without_any_listed_key
from active a left join with_key w on w.organization_id = a.organization_id and w.user_id = a.user_id
group by a.organization_id having count(*) filter (where w.user_id is null) > 0
order by members_without_any_listed_key desc limit 500;

\echo '== I4 (2b, 2d) dues issuing: after 2b EVERY organization must have an approved receivable account (the column is new: nobody has one) and, after 2d, an OPEN fiscal period covering the issue date. Organizations that issued dues in the last 90 days, and whether an open period covers today:'
select d.organization_id, count(*) as dues_last_90d, max(d.created_at)::date as last_issue,
       exists (select 1 from public.fiscal_periods fp where fp.organization_id = d.organization_id and fp.status = 'OPEN' and current_date between fp.start_date and fp.end_date) as open_period_today
from public.dues d where d.created_at >= now() - interval '90 days'
group by d.organization_id order by dues_last_90d desc limit 500;

\echo '== I5 (2c, 2e) bank reconciliation: finalize now needs EVERY statement line matched. Statements not yet RECONCILED with unmatched lines, per organization:'
select s.organization_id, count(distinct s.id) as open_statements, count(*) filter (where l.matched_journal_entry_line_id is null) as unmatched_lines
from public.bank_statements s join public.bank_statement_lines l on l.statement_id = s.id
where s.status <> 'RECONCILED'
group by s.organization_id having count(*) filter (where l.matched_journal_entry_line_id is null) > 0
order by unmatched_lines desc limit 500;

\echo '== I6 (3a, 3i) volume skew: the backfill and constraint scans are global; the biggest organizations dominate view and list cost'
select p.organization_id, count(distinct p.id) as payments, count(pa.id) as allocations
from public.payments p left join public.payment_allocations pa on pa.payment_id = p.id
group by p.organization_id order by allocations desc, payments desc limit 20;

\echo '== I7 (deposit rule) receipts of the last 90 days on accounts that no active cash box / bank account links: EVERY organization listed here loses the ability to record receipts the moment the last migration is applied, trial or not'
with linked as (select organization_id, gl_account_id from public.cashboxes where is_active union select organization_id, gl_account_id from public.bank_accounts where is_active)
select p.organization_id, count(*) as receipts, max(p.created_at)::date as last_receipt
from public.payments p left join linked l on l.organization_id = p.organization_id and l.gl_account_id = p.deposit_account_id
where p.created_at >= now() - interval '90 days' and p.deposit_account_id is not null and l.gl_account_id is null
group by p.organization_id order by receipts desc limit 500;
select count(distinct organization_id) as organizations_with_receipts_last_90d from public.payments where created_at >= now() - interval '90 days';
