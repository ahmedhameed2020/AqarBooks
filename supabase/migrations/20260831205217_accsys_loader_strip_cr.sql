-- pasting through a browser/Windows adds CR to every line end; strip it at the door
create or replace function accsys_stage.load(tbl text, cols text, blob text)
returns bigint language plpgsql as $fn$
declare n bigint; sel text := ''; i int; arr text[]; ctype text;
begin
  blob := replace(blob, chr(13), '');
  arr := string_to_array(cols, ',');
  for i in 1 .. array_length(arr,1) loop
    select data_type into ctype from information_schema.columns
      where table_schema='accsys_stage' and table_name=tbl and column_name=arr[i];
    if ctype is null then raise exception 'unknown column %.%', tbl, arr[i]; end if;
    sel := sel || case when i>1 then ',' else '' end
        || format('nullif(x[%s], %L)::%s', i, '\N',
                  case when ctype='numeric' then 'numeric' when ctype='date' then 'date'
                       when ctype in ('integer','bigint') then ctype
                       when ctype='boolean' then 'boolean' else 'text' end);
  end loop;
  execute format(
    'insert into accsys_stage.%I (%s) select %s from (select string_to_array(l, E''\t'') x from unnest(string_to_array($1, E''\n'')) l where l <> '''') s',
    tbl, cols, sel) using blob;
  get diagnostics n = row_count;
  return n;
end $fn$;

create or replace function accsys_stage.load_v(tbl text, cols text, blob text,
                                               expect_md5 text, expect_rows int)
returns text language plpgsql as $fn$
declare got_md5 text; got_rows int; n bigint;
begin
  blob := replace(blob, chr(13), '');
  got_md5  := md5(blob);
  got_rows := (select count(*) from unnest(string_to_array(blob, E'\n')) l where l <> '');
  if got_md5 <> expect_md5 then
    raise exception 'CHECKSUM MISMATCH on %: expected % got % (% rows)', tbl, expect_md5, got_md5, got_rows;
  end if;
  if got_rows <> expect_rows then
    raise exception 'ROW COUNT MISMATCH on %: expected % got %', tbl, expect_rows, got_rows;
  end if;
  n := accsys_stage.load(tbl, cols, blob);
  return format('%s OK  rows=%s', tbl, n);
end $fn$;;
