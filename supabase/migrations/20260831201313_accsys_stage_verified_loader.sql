-- verified loader: refuses the batch unless the received bytes hash to the expected value
create or replace function accsys_stage.load_v(tbl text, cols text, blob text,
                                               expect_md5 text, expect_rows int)
returns text language plpgsql as $fn$
declare got_md5 text; got_rows int; n bigint;
begin
  got_md5  := md5(blob);
  got_rows := (select count(*) from unnest(string_to_array(blob, E'\n')) l where l <> '');
  if got_md5 <> expect_md5 then
    raise exception 'CHECKSUM MISMATCH on %: expected % got % (% rows received)',
      tbl, expect_md5, got_md5, got_rows;
  end if;
  if got_rows <> expect_rows then
    raise exception 'ROW COUNT MISMATCH on %: expected % got %', tbl, expect_rows, got_rows;
  end if;
  n := accsys_stage.load(tbl, cols, blob);
  return format('%s OK  rows=%s  md5=%s', tbl, n, got_md5);
end $fn$;;
