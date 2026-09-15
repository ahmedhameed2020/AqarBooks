create schema if not exists accsys_stage;

create table if not exists accsys_stage.ctx (k text primary key, v uuid);
create table if not exists accsys_stage.coa (code text primary key, parent_code text, name_ar text, name_en text, category text, normal_balance text, is_group boolean, lvl int);
create table if not exists accsys_stage.zone (code text primary key, name_ar text, name_en text);
create table if not exists accsys_stage.unit (code text primary key, zone_code text, unit_type text);
create table if not exists accsys_stage.member (acc_code text primary key, full_name text, full_name_en text, unit_code text, is_company boolean);
create table if not exists accsys_stage.je (seq bigint primary key, k text unique, edate date, descr text, source_type text, glno text);
create table if not exists accsys_stage.jel (seq bigint, ln int, acc_code text, debit numeric(18,2), credit numeric(18,2));
create table if not exists accsys_stage.dtype (due_type text primary key, rev_acc text, name_en text);
create table if not exists accsys_stage.due (seq bigint primary key, je_seq bigint, acc_code text, unit_code text, due_type text, rev_acc text, amount numeric(18,2), idate date, status text);
create table if not exists accsys_stage.pay (seq bigint primary key, je_seq bigint, acc_code text, unit_code text, dep_acc text, method text, amount numeric(18,2), pdate date, receipt text, unalloc numeric(18,2));
create table if not exists accsys_stage.alloc (pay_seq bigint, due_seq bigint, amount numeric(18,2));
create table if not exists accsys_stage.fy (name text primary key, start_date date, end_date date, status text);

create index if not exists ix_jel_seq on accsys_stage.jel(seq);

-- tab/newline delimited bulk loader: keeps the wire payload as small as possible
create or replace function accsys_stage.load(tbl text, cols text, blob text)
returns bigint language plpgsql as $fn$
declare n bigint; sel text; i int; arr text[];
begin
  arr := string_to_array(cols, ',');
  sel := '';
  for i in 1 .. array_length(arr,1) loop
    sel := sel || case when i>1 then ',' else '' end || format('nullif(x[%s], %L)', i, '\N');
  end loop;
  execute format(
    'insert into accsys_stage.%I (%s) select %s from (select string_to_array(l, E''\t'') x from unnest(string_to_array($1, E''\n'')) l where l <> '''') s',
    tbl, cols, sel) using blob;
  get diagnostics n = row_count;
  return n;
end $fn$;;
