create table if not exists accsys_stage.dict (code text primary key, w text not null);
truncate accsys_stage.coa, accsys_stage.member, accsys_stage.je, accsys_stage.jel, accsys_stage.dict;

-- rebuild the Arabic narrations from the word dictionary after all je chunks land
create or replace function accsys_stage.decode_descr()
returns table(rewritten bigint, descr_md5 text) language plpgsql as $fn$
declare n bigint;
begin
  update accsys_stage.je e set descr = d.txt
    from (select e2.seq,
                 (select string_agg(coalesce(dd.w, t.tok), ' ' order by t.ord)
                    from unnest(string_to_array(e2.descr, ' ')) with ordinality t(tok, ord)
                    left join accsys_stage.dict dd
                           on left(t.tok,1) = '~' and dd.code = substr(t.tok,2)) as txt
          from accsys_stage.je e2) d
   where d.seq = e.seq;
  get diagnostics n = row_count;
  if exists (select 1 from accsys_stage.je where descr like '%~%') then
    raise exception 'undecoded dictionary tokens remain';
  end if;
  rewritten := n;
  descr_md5 := (select md5(string_agg(descr, E'\n' order by seq)) from accsys_stage.je);
  return next;
end $fn$;;
