create or replace view legacy_migration.v_duplicate_members as
select batch_id, coalesce(nullif(trim(membership_no),''), nullif(trim(acc_nm),''), nullif(trim(full_name),'')) as duplicate_key,
       count(*) as row_count,
       array_agg(id order by id) as raw_ids
from legacy_migration.raw_members
group by batch_id, coalesce(nullif(trim(membership_no),''), nullif(trim(acc_nm),''), nullif(trim(full_name),''))
having count(*) > 1;

create or replace view legacy_migration.v_duplicate_units as
select batch_id, trim(sector) as sector, trim(unit_code) as unit_code,
       count(*) as row_count,
       array_agg(id order by id) as raw_ids
from legacy_migration.raw_coa4
where nullif(trim(unit_code),'') is not null
group by batch_id, trim(sector), trim(unit_code)
having count(*) > 1;

create or replace view legacy_migration.v_member_unit_candidates as
select c.batch_id,
       c.id as raw_coa4_id,
       c.code_l4 as legacy_account_code,
       c.membership_no,
       c.full_name,
       c.sector,
       c.unit_code,
       m.id as raw_member_id,
       case
         when nullif(trim(c.membership_no),'') is not null and trim(c.membership_no)=trim(m.membership_no) then 100
         when nullif(trim(c.full_name),'') is not null and lower(trim(c.full_name))=lower(trim(m.full_name)) then 90
         else 0
       end as match_score
from legacy_migration.raw_coa4 c
left join legacy_migration.raw_members m
  on m.batch_id=c.batch_id
 and (
      (nullif(trim(c.membership_no),'') is not null and trim(c.membership_no)=trim(m.membership_no))
      or (nullif(trim(c.full_name),'') is not null and lower(trim(c.full_name))=lower(trim(m.full_name)))
 );

create or replace view legacy_migration.v_orphan_journal_accounts as
select j.batch_id, trim(j.account_no) as account_no, count(*) as line_count
from legacy_migration.raw_journal_lines j
left join legacy_migration.raw_coa4 c
  on c.batch_id=j.batch_id and trim(c.code_l4)=trim(j.account_no)
where nullif(trim(j.account_no),'') is not null and c.id is null
group by j.batch_id, trim(j.account_no);

create or replace view legacy_migration.v_journal_balance_by_gl as
select batch_id,
       trim(gl_no) as gl_no,
       sum(case when trim(coalesce(debit,'')) ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(trim(debit),',','.')::numeric else 0 end) as total_debit,
       sum(case when trim(coalesce(credit,'')) ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(trim(credit),',','.')::numeric else 0 end) as total_credit,
       sum(case when trim(coalesce(debit,'')) ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(trim(debit),',','.')::numeric else 0 end)
       - sum(case when trim(coalesce(credit,'')) ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(trim(credit),',','.')::numeric else 0 end) as difference,
       count(*) as line_count
from legacy_migration.raw_journal_lines
where nullif(trim(gl_no),'') is not null
group by batch_id, trim(gl_no);

create or replace view legacy_migration.v_unbalanced_journals as
select * from legacy_migration.v_journal_balance_by_gl where abs(difference) > 0.005;

revoke all on all tables in schema legacy_migration from public, anon, authenticated;
grant select on all tables in schema legacy_migration to service_role;
;
